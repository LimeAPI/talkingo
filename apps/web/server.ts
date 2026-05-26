/**
 * Custom Next.js server — adds WebSocket support for the Gemini Live proxy.
 *
 * Next.js App Router route handlers cannot handle WebSocket upgrades.
 * This server intercepts upgrade requests to /api/gemini/live and proxies
 * them to the Gemini Live API, keeping the API key server-side.
 *
 * All other requests are handled by Next.js as normal.
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocket, WebSocketServer } from 'ws'
import { getSystemInstruction } from '@talkingo/shared/gemini'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import type { ConversationState } from '@talkingo/shared/types'
import { Client, Databases, Query } from 'node-appwrite'

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
      .setKey(process.env.APPWRITE_API_KEY!)
    const databases = new Databases(client)
    const res = await databases.listDocuments('talkingo_db', 'system_config', [
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

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME ?? 'localhost'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const LIVE_MODEL = 'gemini-3.1-flash-live-preview'
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
      // Let Next.js handle HMR WebSocket upgrades
      return
    }

    if (pathname === '/api/gemini/live') {
      // ── Auth: verify Appwrite session from cookies ─────────────────────
      const cookies = req.headers.cookie || ''
      const sessionCookie = cookies
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('a_session_'))

      if (!sessionCookie) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      wss.handleUpgrade(req, socket as any, head, (clientWs) => {
        handleLiveSession(clientWs)
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

function handleLiveSession(clientWs: WebSocket) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'GEMINI_API_KEY not configured' }))
    clientWs.close(1011)
    return
  }

  let geminiWs: WebSocket | null = null
  let setupDone = false

  const sendToClient = (msg: object) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg))
    }
  }

  clientWs.on('message', async (raw) => {
    let msg: any
    try { msg = JSON.parse(raw.toString()) } catch {
      sendToClient({ type: 'error', message: 'Invalid JSON' })
      return
    }

    // ── Setup ──
    if (msg.type === 'setup') {
      if (setupDone) return
      setupDone = true

      const state: ConversationState = msg.state ?? {}
      const persona = getPersonaById(state.persona ?? 'eli')
      const voiceName: string = msg.voiceName ?? persona?.voiceName ?? 'Aoede'
      // Fetch master prompt from DB (with cache) so live mode respects admin changes
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
          sendToClient({ type: 'ready' })
        })
      })

      geminiWs.on('error', (err) => {
        console.error('[live-proxy] Gemini WS error:', err.message)
        sendToClient({ type: 'error', message: `Gemini error: ${err.message}` })
      })

      geminiWs.on('close', (code) => {
        console.log('[live-proxy] Gemini WS closed:', code)
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000)
      })

      return
    }

    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
      sendToClient({ type: 'error', message: 'Session not ready — send setup first' })
      return
    }

    // ── Audio chunk ──
    if (msg.type === 'audio') {
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
        },
      }))
      return
    }

    // ── Text turn ──
    if (msg.type === 'text') {
      geminiWs.send(JSON.stringify({
        realtimeInput: { text: msg.text },
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
    if (msg.type === 'interrupt') {
      // Send an empty audio chunk with streamEnd to force Gemini to stop
      // This is the most reliable way to trigger a hard stop on the server side
      geminiWs.send(JSON.stringify({
        realtimeInput: { audioStreamEnd: true },
      }))
      // Also send a text signal if available in the API version
      geminiWs.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: '' }] }],
          turnComplete: true
        }
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
  const full = getSystemInstruction(state, masterPrompt)
  // Strip JSON format block — Live API responds in natural speech
  const stripped = full
    .replace(/RESPONSE FORMAT[\s\S]*?(?=\n\n[A-Z]|$)/m, '')
    .replace(/Return ONLY valid JSON[\s\S]*?(?=\n\n|$)/m, '')
    .trim()

  return `${stripped}

IMPORTANT — VOICE MODE:
- You are speaking out loud. Respond naturally in spoken language.
- Do NOT output JSON. Speak conversationally.
- Keep responses concise — 2–4 sentences per turn.
- Always end with a question to keep the conversation going.
- Correct errors by recasting naturally in your reply, never by announcing them.`
}
