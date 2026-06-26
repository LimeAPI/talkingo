/**
 * Standalone WebSocket server for Gemini Live proxy.
 *
 * Runs independently from Next.js so we can use Turbopack for dev.
 * In production, this is bundled into server.ts for single-process deployment.
 *
 * Usage:
 *   npx tsx ws-server.ts          # standalone (port 3001)
 *   NEXT_PUBLIC_LIVE_WS_URL=ws://localhost:3001  # client env var
 */

import { createServer } from 'http'
import { parse } from 'url'
import { WebSocket, WebSocketServer } from 'ws'
import { getSystemInstruction } from '@talkingo/shared/gemini'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import type { ConversationState } from '@talkingo/shared/types'
import { Client, Databases, Account, Query } from 'node-appwrite'
import { APPWRITE_DB_ID, COLLECTION_IDS } from './src/lib/appwrite-schema'

// ─── Config ───────────────────────────────────────────────────────────────────

const WS_PORT = parseInt(process.env.LIVE_WS_PORT ?? '3001', 10)
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

// ─── Rate limiting ────────────────────────────────────────────────────────────

const WS_RATE_LIMIT = 600 // messages per minute per user (audio streams ~4 chunks/sec)
const wsRateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkWsRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = wsRateLimitStore.get(userId)
  if (!entry || now > entry.resetAt) {
    wsRateLimitStore.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= WS_RATE_LIMIT) return false
  entry.count++
  return true
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of wsRateLimitStore) {
    if (now > entry.resetAt + 60_000) wsRateLimitStore.delete(key)
  }
}, 300_000).unref()

// ─── Master prompt cache ──────────────────────────────────────────────────────

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
    console.warn('[ws-server] Could not fetch master prompt from DB:', e)
  }
  return null
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
    console.warn('[ws-server] JWT verify failed:', (err as Error).message)
    return null
  }
}

// ─── Input validation ─────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 4000
const MAX_AUDIO_B64_LENGTH = 200_000

function isValidBase64(str: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0
}

function validateSetupMessage(msg: any): string | null {
  if (msg.voiceName && (typeof msg.voiceName !== 'string' || msg.voiceName.length > 100)) {
    return 'Invalid voiceName'
  }
  return null
}

// ─── Server ───────────────────────────────────────────────────────────────────

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', service: 'talkingo-ws' }))
})

const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url ?? '/')

  if (pathname !== '/api/gemini/live') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  const parsedUrl = parse(req.url ?? '/', true)
  const jwt = (parsedUrl.query?.jwt as string) || (parsedUrl.query?.session as string)

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
})

httpServer.listen(WS_PORT, () => {
  console.log(`[ws-server] Live WebSocket server on port ${WS_PORT}`)
})

// ─── Live session handler ─────────────────────────────────────────────────────

function handleLiveSession(clientWs: WebSocket, userId: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Service unavailable' }))
    clientWs.close(1011)
    return
  }

  console.log('[ws-server] Session opened for user:', userId)

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
        try {
          serverMsg = JSON.parse(data.toString())
        } catch {
          return
        }
        handleGeminiMessage(serverMsg, sendToClient, () => {
          readySent = true
          sendToClient({ type: 'ready' })
        })
      })

      geminiWs.on('error', (err) => {
        console.error('[ws-server] Gemini WS error:', err.message)
        sendToClient({ type: 'error', message: 'Live API error. Try again.' })
      })

      geminiWs.on('close', (code, reasonBuf) => {
        const reason = reasonBuf?.toString() || ''
        console.log('[ws-server] Gemini WS closed:', code, reason)
        if (!readySent) {
          const msg =
            code === 1008
              ? 'Live API rejected the request. Check your API key and model access.'
              : code === 1011
                ? 'Live API server error. Try again in a moment.'
                : code === 1007
                  ? 'Live API rejected the request payload.'
                  : reason
                    ? `Live API closed: ${reason}`
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

    // ── Interrupt ──
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
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000)
  })

  clientWs.on('error', (err) => {
    console.error('[ws-server] Client WS error:', err.message)
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000)
  })
}

// ─── Gemini message handler ───────────────────────────────────────────────────

function handleGeminiMessage(
  msg: any,
  sendToClient: (m: object) => void,
  onSetupComplete?: () => void,
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

  if (msg?.goAway) return

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

// ─── System instruction ───────────────────────────────────────────────────────

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