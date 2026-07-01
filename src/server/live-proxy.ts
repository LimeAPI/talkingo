/**
 * Shared Gemini Live proxy — the single source of truth for the realtime voice
 * pipeline used by BOTH entry points:
 *   - `server.ts`    (production: Next.js HTTP + WS in one process)
 *   - `ws-server.ts` (development: standalone WS so Next dev can use Turbopack)
 *
 * Previously this ~350-line proxy was copy-pasted into both files and the two
 * copies had drifted apart on cost-/security-relevant settings (rate limit,
 * base64 validation, error verbosity). Consolidating here removes that drift —
 * there is now exactly one implementation. Where the two old copies disagreed,
 * this module deliberately takes the SAFER / more-correct behavior of each:
 *
 *   - Rate limit 600/min (matches ~4 audio chunks/sec — the old prod value of
 *     120 would throttle a normal live call after ~30s) PLUS the prod
 *     memory-safety cap + frequent sweep.
 *   - Lenient base64 validation (accepts base64url / unpadded audio that strict
 *     `%4===0` would wrongly reject) that still verifies the payload decodes.
 *   - `validateSetupMessage` (was only in dev).
 *   - A generic Gemini-error message to the client (the old prod copy leaked the
 *     upstream error text).
 *
 * This file is run via `tsx` from the two root entry points (never bundled into
 * the client) and talks to Appwrite with the admin key directly, mirroring the
 * original servers.
 */

import { WebSocket } from 'ws'
import { getSystemInstruction } from '@talkingo/shared/gemini'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import type { ConversationState } from '@talkingo/shared/types'
import { Client, Databases, Account, Query } from 'node-appwrite'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '../lib/appwrite-schema'
import {
  resolveLiveDailyCapSeconds,
  resolveTier,
  isLiveCapEnforced,
  liveDayKey,
  remainingLiveSeconds,
  LIVE_WINDDOWN_SECONDS,
  LIVE_IDLE_TIMEOUT_SECONDS,
  type CapSubscriptionInfo,
} from '../lib/subscription/live-limits'

// ─── Config ───────────────────────────────────────────────────────────────────

/** WebSocket path the client connects to for live voice. */
export const GEMINI_LIVE_PATH = '/api/gemini/live'

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

const MAX_TEXT_LENGTH = 4000
const MAX_AUDIO_B64_LENGTH = 200_000

// ─── Rate limiting (per user) ───────────────────────────────────────────────
// 600/min accommodates a live audio stream (~4 chunks/sec) without throttling a
// legitimate call. The Live path is premium-gated upstream, so only paying users
// reach it; combined with the idle auto-end this is a per-instance safety net,
// not the primary cost control. Bounded + swept so a flood of distinct users
// can't grow the map unboundedly.
const WS_RATE_LIMIT = 600
const WS_RATE_LIMIT_MAX_ENTRIES = 10_000
const WS_WINDOW_MS = 60_000
const wsRateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkWsRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = wsRateLimitStore.get(userId)
  if (!entry || now > entry.resetAt) {
    if (!entry && wsRateLimitStore.size >= WS_RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = wsRateLimitStore.keys().next().value
      if (oldestKey !== undefined) wsRateLimitStore.delete(oldestKey)
    }
    wsRateLimitStore.delete(userId)
    wsRateLimitStore.set(userId, { count: 1, resetAt: now + WS_WINDOW_MS })
    return true
  }
  if (entry.count >= WS_RATE_LIMIT) return false
  entry.count++
  return true
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of wsRateLimitStore) {
    if (now > entry.resetAt) wsRateLimitStore.delete(key)
  }
}, 60_000).unref()

// ─── Admin Appwrite client (read-only here) ──────────────────────────────────

let _adminDb: Databases | null = null

/**
 * Lazily-built admin Databases client (uses APPWRITE_API_KEY). Returns null when
 * the key is missing. Shared so the premium check here and the boot-time
 * collection assertion in `server.ts` use one client.
 */
export function getAdminDatabases(): Databases | null {
  if (_adminDb) return _adminDb
  const key = process.env.APPWRITE_API_KEY
  if (!key) {
    console.error('[live-proxy] APPWRITE_API_KEY missing — cannot verify premium access.')
    return null
  }
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(key)
  _adminDb = new Databases(client)
  return _adminDb
}

// ─── JWT verification ─────────────────────────────────────────────────────────

async function verifyAppwriteJwt(jwt: string): Promise<string | null> {
  try {
    const client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
      .setJWT(jwt)
    const account = new Account(client)
    const user = await account.get()
    return user.$id ?? null
  } catch (err) {
    console.warn('[live-proxy] JWT verify failed:', (err as Error).message)
    return null
  }
}

/**
 * Whether the user currently has premium access (active or trialing). Live voice
 * is premium-only. Fails CLOSED: a missing subscription, a non-active status, or
 * any read error all resolve to `false`, so a misconfigured DB never hands out
 * the most expensive feature for free.
 */
async function hasPremiumAccess(userId: string): Promise<boolean> {
  const db = getAdminDatabases()
  if (!db) return false
  try {
    const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])
    const status = (res.documents[0] as any)?.status
    return status === 'active' || status === 'trialing'
  } catch (err) {
    console.warn('[live-proxy] premium check failed (denying):', (err as Error).message)
    return false
  }
}

// ─── Live usage metering (daily cap) ─────────────────────────────────────────
// The live proxy runs under `tsx` and CANNOT import `lib/appwrite-server` (it is
// marked `server-only`, which throws outside a React Server Component). So the
// admin reads/writes for the daily-cap counter are implemented here against the
// proxy's own admin Databases client, sharing only the PURE limit logic from
// `lib/subscription/live-limits`. The Appwrite calls mirror
// `appwrite-server.ts`'s `getLiveUsageSeconds` / `addLiveUsageSeconds`.

/** Metering flush cadence — persist accrued seconds every N ms so a crash or an
 *  ungraceful socket drop can't lose more than this window (prevents "kill the
 *  tab at 19:59 forever" evasion). */
const LIVE_FLUSH_INTERVAL_MS = 15_000

/**
 * One active live session per user ("newest wins"). Keyed by userId → the live
 * client socket. Closes ANY multiplication of the most expensive feature across
 * tabs/devices, while remaining safe for the going-away→reconnect flow (the new
 * session simply supersedes the old, which was tearing down anyway). Single
 * process (server.ts bundles the WS), so an in-memory map suffices; a
 * multi-instance deploy still catches cross-instance cost via the per-flush DB
 * writes + the connect-time read.
 */
const activeLiveSessions = new Map<string, WebSocket>()

/** Read the minimal subscription info needed to resolve a cap tier. */
async function readSubscriptionInfo(userId: string): Promise<CapSubscriptionInfo | null> {
  const db = getAdminDatabases()
  if (!db) return null
  try {
    const res = await db.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SUBSCRIPTIONS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])
    const doc = res.documents[0] as any
    if (!doc) return null
    return { status: doc.status, plan: doc.plan }
  } catch (err) {
    console.warn('[live-proxy] readSubscriptionInfo failed:', (err as Error).message)
    return null
  }
}

/** Read seconds used today. FAILS OPEN (returns 0) — never block a paying user
 *  on a store blip. Mirrors `appwrite-server.getLiveUsageSeconds`. */
async function readLiveUsageSeconds(userId: string, dayKey: string): Promise<number> {
  const db = getAdminDatabases()
  if (!db) return 0
  const docId = `${userId}_${dayKey}`
  try {
    const doc = (await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId)) as any
    return doc.secondsUsed ?? 0
  } catch (err: any) {
    const code = err?.code ?? err?.response?.code
    if (code === 404) return 0
    console.warn('[live-proxy] readLiveUsageSeconds failed (allowing):', err?.message)
    return 0
  }
}

/** Add accrued seconds to today's counter (best-effort — a lost write must never
 *  interrupt a call). Mirrors `appwrite-server.addLiveUsageSeconds`. */
async function addLiveUsage(
  userId: string,
  dayKey: string,
  deltaSeconds: number,
  tier: string,
): Promise<void> {
  const db = getAdminDatabases()
  if (!db || deltaSeconds <= 0) return
  const docId = `${userId}_${dayKey}`
  const delta = Math.round(deltaSeconds)
  try {
    const existing = (await db.getDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId)) as any
    await db.updateDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId, {
      secondsUsed: (existing.secondsUsed ?? 0) + delta,
    })
  } catch (err: any) {
    const code = err?.code ?? err?.response?.code
    if (code === 404) {
      try {
        await db.createDocument(APPWRITE_DB_ID, COLLECTION_IDS.LIVE_USAGE, docId, {
          userId,
          date: dayKey,
          secondsUsed: delta,
          tier,
        })
      } catch (createErr: any) {
        // 409 race or anything else — best-effort, drop it. The next flush
        // re-reads and continues from the persisted value.
        if ((createErr?.code ?? createErr?.response?.code) !== 409) {
          console.warn('[live-proxy] addLiveUsage create failed:', createErr?.message)
        }
      }
      return
    }
    console.warn('[live-proxy] addLiveUsage error (best-effort):', err?.message)
  }
}

/**
 * Authorize a live-voice WebSocket upgrade from the JWT in the connection URL.
 * Returns the verified userId on success, or a status code (401 unauthenticated,
 * 402 not premium) the caller writes to the socket. Centralizes the auth +
 * entitlement gate so both entry points enforce it identically.
 */
export async function authorizeLiveConnection(
  jwt: string | undefined,
): Promise<{ ok: true; userId: string } | { ok: false; code: 401 | 402 }> {
  if (!jwt) return { ok: false, code: 401 }
  const userId = await verifyAppwriteJwt(jwt)
  if (!userId) return { ok: false, code: 401 }
  const premium = await hasPremiumAccess(userId)
  if (!premium) {
    console.log('[live-proxy] Rejected non-premium user:', userId)
    return { ok: false, code: 402 }
  }
  return { ok: true, userId }
}

// ─── Input validation ─────────────────────────────────────────────────────────

/**
 * Validate a base64 audio chunk. Accepts both standard and URL-safe (base64url)
 * alphabets, tolerates whitespace/newlines, and does not require padding — many
 * encoders omit it. Normalizes then verifies it decodes to a non-empty buffer
 * rather than relying on a strict regex that would reject valid payloads.
 */
function isValidBase64(str: string): boolean {
  const normalized = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (normalized.length === 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false
  try {
    return Buffer.from(normalized, 'base64').length > 0
  } catch {
    return false
  }
}

function validateSetupMessage(msg: any): string | null {
  if (msg.voiceName && (typeof msg.voiceName !== 'string' || msg.voiceName.length > 100)) {
    return 'Invalid voiceName'
  }
  return null
}

// ─── Live session handler ─────────────────────────────────────────────────────

/**
 * Drive one client live-voice session: opens the upstream Gemini Live socket,
 * relays setup/audio/text/turn control up, and relays audio/transcripts/control
 * back down. Identical for prod and dev.
 */
export function handleLiveSession(clientWs: WebSocket, userId: string): void {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Service unavailable' }))
    clientWs.close(1011)
    return
  }

  console.log('[live-proxy] Session opened for user:', userId)

  // One active live session per user (newest wins). Supersede any prior socket
  // so opening a 2nd tab/device can't stream (and bill) in parallel; also makes
  // the going-away → reconnect flow clean (the new session replaces the old,
  // which is tearing down anyway).
  const prior = activeLiveSessions.get(userId)
  if (prior && prior !== clientWs && prior.readyState === WebSocket.OPEN) {
    console.log('[live-proxy] Superseding prior live session for user:', userId)
    try { prior.close(1000, 'superseded') } catch {}
  }
  activeLiveSessions.set(userId, clientWs)

  let geminiWs: WebSocket | null = null
  let setupDone = false
  let readySent = false

  const sendToClient = (msg: object) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg))
    }
  }

  // ── Daily-cap metering state ──
  const enforced = isLiveCapEnforced()
  let dayKey = liveDayKey()
  let capSeconds = 0
  let tier = 'none'
  let priorSeconds = 0
  let sessionStartMs = 0
  let lastFlushMs = 0
  let lastActivityMs = Date.now()
  let winddownSent = false
  let capHit = false
  let flushTimer: NodeJS.Timeout | null = null

  const markActivity = () => { lastActivityMs = Date.now() }

  /** Total seconds used today = persisted prior usage + this session's elapsed. */
  const currentUsedSeconds = () =>
    priorSeconds + (sessionStartMs === 0 ? 0 : (Date.now() - sessionStartMs) / 1000)

  /** Persist time accrued since the last flush. Monotonic (only ever advances
   *  `lastFlushMs`), so no double-counting between the interval and final flush. */
  const flush = async () => {
    if (sessionStartMs === 0) return
    const now = Date.now()
    const delta = (now - lastFlushMs) / 1000
    lastFlushMs = now
    if (delta > 0) await addLiveUsage(userId, dayKey, delta, tier)
  }

  /** Best-effort, in-character wind-down: ask the tutor to wrap up warmly. This
   *  is DECORATION — the hard cap disconnect fires regardless of compliance. */
  const sendWrapUpNudge = () => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return
    geminiWs.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text:
          '[SYSTEM: The learner is almost out of speaking time for today. Warmly begin ' +
          'wrapping up now — note one thing they did well, encourage them, and invite ' +
          'them back tomorrow. Never mention limits, minutes, quotas, or systems.]' }] }],
        turnComplete: true,
      },
    }))
  }

  const endForCap = () => {
    if (capHit) return
    capHit = true
    sendToClient({ type: 'usage_limit', reason: 'daily_cap' })
    // Let the current AI turn land and the UI show its "done for today" screen
    // before the socket actually drops — a warm wind-down, not a guillotine.
    setTimeout(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000, 'daily_cap')
    }, 1500)
  }

  /** Runs every flush interval once metering has started. */
  const tick = async () => {
    // Idle auto-end: no audio either direction for too long → close. Fair to the
    // user (idle shouldn't burn their minutes) and it costs us ~nothing anyway.
    if ((Date.now() - lastActivityMs) / 1000 > LIVE_IDLE_TIMEOUT_SECONDS) {
      await flush()
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000, 'idle_timeout')
      return
    }
    await flush()
    if (capSeconds <= 0) return
    const used = currentUsedSeconds()
    if (used >= capSeconds) {
      if (enforced) { endForCap(); return }
      console.log(`[live-proxy] SHADOW cap reached user=${userId} used=${Math.round(used)}s cap=${capSeconds}s tier=${tier}`)
    } else if (used >= capSeconds - LIVE_WINDDOWN_SECONDS && !winddownSent) {
      winddownSent = true
      if (enforced) {
        sendToClient({ type: 'usage_warning', remaining: Math.round(remainingLiveSeconds(used, capSeconds)) })
        sendWrapUpNudge()
      } else {
        console.log(`[live-proxy] SHADOW wind-down point user=${userId} used=${Math.round(used)}s cap=${capSeconds}s`)
      }
    }
  }

  clientWs.on('message', async (raw) => {
    // ── Rate limit ──
    if (!checkWsRateLimit(userId)) {
      sendToClient({ type: 'error', message: 'Too many messages. Slow down.' })
      return
    }

    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      sendToClient({ type: 'error', message: 'Invalid JSON' })
      return
    }

    if (!msg || typeof msg.type !== 'string') {
      sendToClient({ type: 'error', message: 'Missing message type' })
      return
    }

    // ── Setup ──
    if (msg.type === 'setup') {
      if (setupDone) return
      const setupErr = validateSetupMessage(msg)
      if (setupErr) {
        sendToClient({ type: 'error', message: setupErr })
        return
      }
      setupDone = true

      // ── Resolve daily cap + prior usage for metering / gating ──
      dayKey = liveDayKey(typeof msg.localDate === 'string' ? msg.localDate : null)
      const sub = await readSubscriptionInfo(userId)
      tier = resolveTier(sub)
      capSeconds = resolveLiveDailyCapSeconds(sub)
      priorSeconds = await readLiveUsageSeconds(userId, dayKey)

      // Connect-time gate: already at/over today's cap → don't even open Gemini.
      if (capSeconds > 0 && priorSeconds >= capSeconds) {
        if (enforced) {
          sendToClient({ type: 'usage_limit', reason: 'daily_cap' })
          clientWs.close(1000, 'daily_cap')
          return
        }
        console.log(`[live-proxy] SHADOW would block connect user=${userId} prior=${Math.round(priorSeconds)}s cap=${capSeconds}s tier=${tier}`)
      }

      const state: ConversationState = msg.state ?? {}
      const persona = getPersonaById(state.persona ?? 'eli')
      const voiceName: string = msg.voiceName ?? persona?.voiceName ?? 'Aoede'
      const resumeHandle: string | undefined =
        typeof msg.resumeHandle === 'string' && msg.resumeHandle.length > 0
          ? msg.resumeHandle
          : undefined
      const systemInstruction = buildLiveSystemInstruction(state)

      const url = `${GEMINI_LIVE_WS}?key=${apiKey}`
      geminiWs = new WebSocket(url)

      geminiWs.on('open', () => {
        const setup = {
          setup: {
            model: `models/${LIVE_MODEL}`,
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
              },
            },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 200,
                silenceDurationMs: 600,
              },
            },
            // Sliding-window compression removes the 15-minute hard cap on
            // audio-only sessions, so long lessons run without termination.
            contextWindowCompression: { slidingWindow: {} },
            // Session resumption lets a dropped socket reconnect WITH context.
            sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
        }
        geminiWs!.send(JSON.stringify(setup))
      })

      geminiWs.on('message', (data) => {
        let serverMsg: any
        try {
          serverMsg = JSON.parse(data.toString())
        } catch {
          return
        }
        handleGeminiMessage(serverMsg, sendToClient, () => {
          readySent = true
          sendToClient({ type: 'ready' })
          // Metering starts here — this is when audio (and cost) actually begins.
          sessionStartMs = Date.now()
          lastFlushMs = sessionStartMs
          lastActivityMs = sessionStartMs
          flushTimer = setInterval(() => { void tick() }, LIVE_FLUSH_INTERVAL_MS)
          flushTimer.unref?.()
        }, markActivity)
      })

      geminiWs.on('error', (err) => {
        console.error('[live-proxy] Gemini WS error:', err.message)
        // Generic message — never leak upstream error details to the client.
        sendToClient({ type: 'error', message: 'Live API error. Try again.' })
      })

      geminiWs.on('close', (code, reasonBuf) => {
        const reason = reasonBuf?.toString() || ''
        console.log('[live-proxy] Gemini WS closed:', code, reason)
        if (!readySent) {
          const closeMsg =
            code === 1008
              ? 'Live API rejected the request. Check your API key and model access.'
              : code === 1011
                ? 'Live API server error. Try again in a moment.'
                : code === 1007
                  ? 'Live API rejected the request payload.'
                  : reason
                    ? `Live API closed: ${reason}`
                    : `Live API closed (code ${code}). Make sure your API key has access to the live model.`
          sendToClient({ type: 'error', message: closeMsg })
        }
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000, reason || 'gemini closed')
      })

      return
    }

    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
      sendToClient({ type: 'error', message: 'Session not ready — send setup first' })
      return
    }

    // ── Audio chunk ──
    if (msg.type === 'audio') {
      if (!msg.data || typeof msg.data !== 'string' || msg.data.length > MAX_AUDIO_B64_LENGTH) {
        sendToClient({ type: 'error', message: 'Invalid audio data' })
        return
      }
      if (!isValidBase64(msg.data)) {
        sendToClient({ type: 'error', message: 'Invalid audio format' })
        return
      }
      markActivity()
      geminiWs.send(
        JSON.stringify({
          realtimeInput: {
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          },
        }),
      )
      return
    }

    // ── Text turn ──
    if (msg.type === 'text') {
      if (!msg.text || typeof msg.text !== 'string') {
        sendToClient({ type: 'error', message: 'Invalid text message' })
        return
      }
      const sanitized = msg.text.trim()
      if (sanitized.length === 0 || sanitized.length > MAX_TEXT_LENGTH) {
        sendToClient({ type: 'error', message: 'Text too long or empty' })
        return
      }
      markActivity()
      geminiWs.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: sanitized }] }],
            turnComplete: true,
          },
        }),
      )
      return
    }

    // ── End turn ──
    if (msg.type === 'end_turn') {
      geminiWs.send(
        JSON.stringify({
          realtimeInput: { audioStreamEnd: true },
        }),
      )
      return
    }

    // ── Interrupt (manual stop only — VAD barge-in is handled natively) ──
    if (msg.type === 'interrupt') {
      geminiWs.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: '' }] }],
            turnComplete: true,
          },
        }),
      )
      return
    }

    sendToClient({ type: 'error', message: `Unknown message type: ${msg.type}` })
  })

  clientWs.on('close', () => {
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null }
    void flush() // persist the final segment (best-effort)
    if (activeLiveSessions.get(userId) === clientWs) activeLiveSessions.delete(userId)
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000)
  })

  clientWs.on('error', (err) => {
    console.error('[live-proxy] Client WS error:', err.message)
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000)
  })
}

// ─── Gemini message handler ───────────────────────────────────────────────────

function handleGeminiMessage(
  msg: any,
  sendToClient: (m: object) => void,
  onSetupComplete?: () => void,
  onActivity?: () => void,
) {
  if (msg?.setupComplete !== undefined) {
    onSetupComplete?.()
    return
  }

  if (msg?.error) {
    const m = msg.error.message || msg.error.status || 'Gemini error'
    sendToClient({ type: 'error', message: m })
    return
  }

  if (msg?.goAway) {
    sendToClient({ type: 'going_away', timeLeft: msg.goAway.timeLeft ?? null })
    return
  }

  if (msg?.sessionResumptionUpdate) {
    const upd = msg.sessionResumptionUpdate
    if (upd.resumable && upd.newHandle) {
      sendToClient({ type: 'session_handle', handle: upd.newHandle })
    }
    return
  }

  const sc = msg?.serverContent
  if (!sc) return

  if (sc.interrupted) {
    sendToClient({ type: 'interrupted' })
    return
  }

  if (sc.modelTurn?.parts) {
    for (const part of sc.modelTurn.parts) {
      if (part.inlineData?.data) {
        onActivity?.() // model is speaking → audio flowing → not idle
        sendToClient({ type: 'audio', data: part.inlineData.data })
      }
    }
  }

  if (sc.outputTranscription?.text) {
    sendToClient({
      type: 'transcript',
      role: 'model',
      text: sc.outputTranscription.text,
      final: !!sc.outputTranscription.finished,
    })
  }

  if (sc.inputTranscription?.text) {
    sendToClient({
      type: 'transcript',
      role: 'user',
      text: sc.inputTranscription.text,
      final: !!sc.inputTranscription.finished,
    })
  }

  if (sc.turnComplete) {
    sendToClient({ type: 'turn_complete' })
  }
}

// ─── System instruction (voice mode) ──────────────────────────────────────────

function buildLiveSystemInstruction(state: ConversationState): string {
  const full = getSystemInstruction(state)
  // RESPONSE_FORMAT (JSON spec) is always the last block. Voice speaks out loud,
  // so strip the JSON format spec entirely — from "Return ONLY valid JSON" on.
  const stripped = full.replace(/Return ONLY valid JSON[\s\S]*$/i, '').trim()

  return `${stripped}

═══ CRITICAL — VOICE MODE ═══
You are SPEAKING OUT LOUD. Everything you write becomes audio. You must follow these rules:

1. NO STRUCTURED DATA — Never output JSON, code, markdown, bullet lists, or any field names like "response:", "corrections:". Say only natural spoken sentences.
2. CORRECT NATURALLY — Simply rephrase the correct version in your reply (recasting).
3. CONCISE — 2–4 sentences per turn. End with a question.`
}
