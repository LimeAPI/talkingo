/**
 * Custom Next.js server — production entry point.
 *
 * In development, use `next dev --turbopack` for fast HMR and run the
 * WebSocket server separately via `tsx ws-server.ts`.
 *
 * In production, this server bundles both Next.js and the WebSocket proxy
 * into a single process for simpler deployment.
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocket, WebSocketServer } from 'ws'
import { getSystemInstruction } from '@talkingo/shared/gemini'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import type { ConversationState } from '@talkingo/shared/types'
import { Client, Databases, Account, Query } from 'node-appwrite'
import { APPWRITE_DB_ID, COLLECTION_IDS } from './src/lib/appwrite-schema'

// ─── Master prompt cache (refreshed every 5 min) ──────────────────────────────
let _cachedMasterPrompt: string | null = null
let _masterPromptFetchedAt = 0
const MASTER_PROMPT_TTL = 5 * 60 * 1000

async function getLiveMasterPrompt(): Promise<string | null> {
  const now = Date.now()
  if (_cachedMasterPrompt && now - _masterPromptFetchedAt < MASTER_PROMPT_TTL) {
    return _cachedMasterPrompt
  }
  try {
    const client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    const databases = new Databases(client)
    const res = await databases.listDocuments(APPWRITE_DB_ID, COLLECTION_IDS.SYSTEM_CONFIG, [
      Query.equal('key', 'master_prompt'),
      Query.limit(1),
    ])
    if (res.documents.length > 0) {
      _cachedMasterPrompt = (res.documents[0] as any).value ?? null
      _masterPromptFetchedAt = now
      return _cachedMasterPrompt
    }
  } catch (e) {
    console.warn('[live-proxy] Could not fetch master prompt from DB, using default:', e)
  }
  return null
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
const WS_RATE_LIMIT = 120
// Cap the store so a flood of distinct userIds (or minted JWTs) can't grow the
// Map unboundedly and exhaust memory. When full, the oldest entry is evicted.
const WS_RATE_LIMIT_MAX_ENTRIES = 10_000
const WS_WINDOW_MS = 60_000
const wsRateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkWsRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = wsRateLimitStore.get(userId)
  if (!entry || now > entry.resetAt) {
    // Evict the oldest entry (insertion-ordered Map) once we hit the cap.
    if (!entry && wsRateLimitStore.size >= WS_RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = wsRateLimitStore.keys().next().value
      if (oldestKey !== undefined) wsRateLimitStore.delete(oldestKey)
    }
    // Re-insert so refreshed entries move to the end (LRU-ish ordering).
    wsRateLimitStore.delete(userId)
    wsRateLimitStore.set(userId, { count: 1, resetAt: now + WS_WINDOW_MS })
    return true
  }
  if (entry.count >= WS_RATE_LIMIT) return false
  entry.count++
  return true
}

// Sweep expired entries frequently (every 60s) so memory is reclaimed promptly
// rather than letting entries linger for minutes.
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of wsRateLimitStore) {
    if (now > entry.resetAt) wsRateLimitStore.delete(key)
  }
}, 60_000).unref()

// ─── Input validation ─────────────────────────────────────────────────────────
const MAX_TEXT_LENGTH = 4000
const MAX_AUDIO_B64_LENGTH = 200_000

/**
 * Validate a base64 audio chunk. Accepts both standard and URL-safe (base64url)
 * alphabets, tolerates whitespace/newlines, and does not require padding — many
 * encoders omit it. We normalize to standard base64 and verify it decodes to a
 * non-empty buffer rather than relying on a strict regex that would reject
 * otherwise-valid payloads.
 */
function isValidBase64(str: string): boolean {
  // Strip whitespace/newlines and normalize URL-safe chars to standard base64.
  const normalized = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (normalized.length === 0) return false
  // Only base64 alphabet characters (plus optional trailing padding) allowed.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false
  try {
    return Buffer.from(normalized, 'base64').length > 0
  } catch {
    return false
  }
}

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME ?? 'localhost'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
const GEMINI_LIVE_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  // ── WebSocket upgrade handler ──────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/')

    // Allow Next.js HMR WebSocket connections
    if (pathname?.startsWith('/_next/webpack-hmr')) {
      return
    }

    if (pathname === '/api/gemini/live') {
      const parsedWsUrl = parse(req.url ?? '/', true)
      const queryJwt = parsedWsUrl.query?.jwt as string | undefined
      const queryFallback = parsedWsUrl.query?.session as string | undefined
      const jwt = queryJwt || queryFallback

      if (!jwt) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      verifyAppwriteJwt(jwt)
        .then((userId) => {
          if (!userId) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
          }
          wss.handleUpgrade(req, socket as any, head, (clientWs) => {
            handleLiveSession(clientWs, userId)
          })
        })
        .catch(() => {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
        })
    } else {
      socket.destroy()
    }
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})

// ─── Live session handler ──────────────────────────────────────────────────────

/**
 * Verify an Appwrite JWT. Returns the user id on success, null otherwise.
 */
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

function handleLiveSession(clientWs: WebSocket, userId: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Service unavailable' }))
    clientWs.close(1011)
    return
  }

  console.log('[live-proxy] Session opened for user:', userId)

  let geminiWs: WebSocket | null = null
  let setupDone = false
  let readySent = false

  const sendToClient = (msg: object) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg))
    }
  }

  clientWs.on('message', async (raw) => {
    // ── Rate limit ──
    if (!checkWsRateLimit(userId)) {
      sendToClient({ type: 'error', message: 'Too many messages. Slow down.' })
      return
    }

    let msg: any
    try { msg = JSON.parse(raw.toString()) } catch {
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
      setupDone = true

      const state: ConversationState = msg.state ?? {}
      const persona = getPersonaById(state.persona ?? 'eli')
      const voiceName: string = msg.voiceName ?? persona?.voiceName ?? 'Aoede'
      const masterPrompt = await getLiveMasterPrompt()
      const systemInstruction = buildLiveSystemInstruction(state, masterPrompt ?? undefined)

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
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
        }
        geminiWs!.send(JSON.stringify(setup))
      })

      geminiWs.on('message', (data) => {
        let serverMsg: any
        try { serverMsg = JSON.parse(data.toString()) } catch { return }
        handleGeminiMessage(serverMsg, sendToClient, () => {
          readySent = true
          sendToClient({ type: 'ready' })
        })
      })

      geminiWs.on('error', (err) => {
        console.error('[live-proxy] Gemini WS error:', err.message)
        sendToClient({ type: 'error', message: `Gemini error: ${err.message}` })
      })

      geminiWs.on('close', (code, reasonBuf) => {
        const reason = reasonBuf?.toString() || ''
        console.log('[live-proxy] Gemini WS closed:', code, reason)
        // Surface a meaningful error to the client BEFORE closing the socket.
        // Without this the client just sees `closed` and silently shows "Call ended".
        if (!readySent) {
          // Most common cause: model name unsupported, API key invalid, quota exceeded,
          // or invalid setup payload. Gemini closes the WS with code 1007/1008/1011.
          const msg =
            code === 1008 ? 'Live API rejected the request. Check your API key and model access.'
            : code === 1011 ? 'Live API server error. Try again in a moment.'
            : code === 1007 ? 'Live API rejected the request payload.'
            : reason ? `Live API closed: ${reason}`
            : `Live API closed (code ${code}). Make sure your API key has access to the live model.`
          sendToClient({ type: 'error', message: msg })
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
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
        },
      }))
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
      geminiWs.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: sanitized }] }],
          turnComplete: true,
        },
      }))
      return
    }

    // ── End turn ──
    if (msg.type === 'end_turn') {
      geminiWs.send(JSON.stringify({
        realtimeInput: { audioStreamEnd: true },
      }))
      return
    }

    // ── Interrupt ──
    // The cleanest way to interrupt the model is to send a clientContent
    // message with turnComplete=true. Per the Live API docs, "A message here
    // will interrupt any current model generation." Sending an empty parts
    // array would be invalid, so we send a single empty-string part which
    // the API tolerates and treats as a turn boundary.
    if (msg.type === 'interrupt') {
      geminiWs.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: '' }] }],
          turnComplete: true,
        },
      }))
      return
    }
  })

  clientWs.on('close', () => {
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000)
  })

  clientWs.on('error', (err) => {
    console.error('[live-proxy] Client WS error:', err.message)
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000)
  })
}

// ─── Gemini message handler ────────────────────────────────────────────────────

function handleGeminiMessage(
  msg: any,
  sendToClient: (m: object) => void,
  onSetupComplete?: () => void,
) {
  // Setup complete — first message back from server confirms session is live
  if (msg?.setupComplete !== undefined) {
    onSetupComplete?.()
    return
  }

  // Error envelope from Gemini (e.g. invalid model, quota exceeded). The Live
  // API doesn't always close on a bad setup — sometimes it emits an `error`
  // body. Surface it so the client doesn't sit at "Connecting…" forever.
  if (msg?.error) {
    const m = msg.error.message || msg.error.status || 'Gemini error'
    sendToClient({ type: 'error', message: m })
    return
  }

  // GoAway = server is about to close. Surface so the client can show a graceful message.
  if (msg?.goAway) {
    return // benign — let the close handler emit the error if needed.
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

// ─── System instruction ────────────────────────────────────────────────────────

function buildLiveSystemInstruction(state: ConversationState, masterPrompt?: string): string {
  const full = getSystemInstruction(state)
  // The RESPONSE_FORMAT (JSON spec) is always the last block. Voice mode speaks out
  // loud, so strip the entire JSON format spec — from "Return ONLY valid JSON" to the end.
  const stripped = full
    .replace(/Return ONLY valid JSON[\s\S]*$/i, '')
    .trim()

  return `${stripped}

═══ CRITICAL — VOICE MODE ═══
You are SPEAKING OUT LOUD. Everything you write becomes audio. You must follow these rules:

1. NO STRUCTURED DATA — Never output JSON, code, markdown, bullet lists, or any field names like "response:", "corrections:". Say only natural spoken sentences.
2. CORRECT NATURALLY — Simply rephrase the correct version in your reply (recasting).
3. CONCISE — 2–4 sentences per turn. End with a question.`
}
