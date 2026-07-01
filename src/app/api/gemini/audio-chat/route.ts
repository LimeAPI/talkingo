import { NextRequest, NextResponse } from 'next/server'
import {
  getSystemInstruction,
} from '@talkingo/shared/gemini'
import { parseConversationResponse } from '@talkingo/shared/gemini'
import type { ConversationState } from '@talkingo/shared/types'
import { z } from 'zod'

/**
 * Audio Chat endpoint — accepts user's voice message audio and sends it
 * directly to Gemini as multimodal input (audio + text context).
 *
 * Gemini hears the actual audio, understands all languages, and responds
 * with the standard JSON format. No browser STT needed.
 *
 * Body: {
 *   audioBase64: string,     // base64-encoded audio (webm/opus or mp4)
 *   mimeType: string,        // e.g., 'audio/webm;codecs=opus'
 *   state: ConversationState,
 *   history: ChatHistory[],
 *   userName?: string,
 * }
 */

const MODEL = process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash'
const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const MAX_HISTORY_ITEMS = 80
const ALLOWED_AUDIO_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'])

const audioChatSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().optional(),
  state: z.unknown(),
  history: z.array(z.any()).optional(),
  userName: z.string().max(100).optional(),
})

export async function POST(req: NextRequest) {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  // ── Auth: verify user has a valid session ────────────────────────────
  const { verifyAuth, checkRateLimit } = await import('@/lib/api/auth-guard')
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { userId } = auth

  // ── Rate limit: 30 audio requests per minute per user ──────────────────
  const { allowed } = checkRateLimit(`audio:${userId}`, 30, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: any
  try {
    body = audioChatSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { audioBase64, mimeType, state, history = [], userName } = body

  if (!audioBase64 || !state) {
    return NextResponse.json({ error: 'bad_request', message: 'audioBase64 and state required' }, { status: 400 })
  }

  let audioBytes = 0
  try {
    audioBytes = Buffer.byteLength(audioBase64, 'base64')
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid audio encoding' }, { status: 400 })
  }
  if (audioBytes <= 0 || audioBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  }

  const mime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_AUDIO_MIME.has(mime)) {
    return NextResponse.json({ error: 'bad_request', message: 'Unsupported audio format' }, { status: 400 })
  }

  if (!Array.isArray(history) || history.length > MAX_HISTORY_ITEMS) {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid history' }, { status: 400 })
  }

  const { getSubscription } = await import('@/lib/appwrite-server')
  const subscription = await getSubscription(userId)
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'
  if (!isActive) {
    // Voice is a Premium-only feature (the free tier is text chat). Block free
    // users outright rather than counting voice against the text quota.
    return NextResponse.json(
      {
        error: 'upgrade_required',
        message: 'Voice messages are a Premium feature. Upgrade to talk with your tutor.',
      },
      { status: 403 }
    )
  }

  const systemInstruction = getSystemInstruction(state)

  // Build conversation history in Gemini format
  const contents: any[] = history.map((h: any) => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.parts?.[0]?.text || '' }],
  }))

  // Add the current turn: audio + instruction
  // Tell Gemini to transcribe what it hears AND respond in the standard JSON format
  // IMPORTANT: specify the target language so Gemini doesn't guess wrong
  const langMeta = state.targetLanguage || 'en'
  const nativeLang = state.nativeLanguage || 'en'
  const userTurnParts: any[] = [
    {
      inlineData: {
        mimeType: mime,
        data: audioBase64,
      },
    },
    {
      text: `Listen to this audio carefully.

CONTEXT: The user is learning ${langMeta}. Their native language is ${nativeLang}. They may speak in either language or mix both.

STEP 1 — SPEECH CHECK:
If the audio contains NO human speech (just noise, breathing, coughing, drinking, typing, music, ambient sounds), respond ONLY with: {"transcription": "", "noSpeech": true}

STEP 2 — TRANSCRIPTION:
If you hear speech, transcribe EXACTLY what was said. If the user spoke in ${langMeta}, transcribe in ${langMeta}. If they spoke in ${nativeLang} or English (asking for help, expressing confusion), transcribe in THAT language. If they mixed languages, transcribe each part in the language it was spoken. Be faithful to what was actually said — do not translate or "fix" their words in the transcription.

STEP 3 — RESPONSE:
Respond per your system instructions (JSON format). Include the "transcription" field with your faithful transcription from Step 2.`,
    },
  ]

  contents.push({ role: 'user', parts: userTurnParts })

  const modelName = MODEL.startsWith('gemini') ? MODEL : `gemini-${MODEL}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[audio-chat] Gemini error:', res.status, err.slice(0, 200))
      const isRateLimit = res.status === 429
      return NextResponse.json(
        { error: isRateLimit ? 'rate_limited' : 'ai_unavailable' },
        { status: isRateLimit ? 429 : 503 }
      )
    }

    const data = await res.json()
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse the response — Gemini returns our standard JSON + a "transcription" field
    const parsed = parseConversationResponse(rawText)

    // Extract transcription and check for no-speech signal
    let transcription: string | undefined
    let noSpeech = false
    try {
      const rawJson = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] || '{}')
      transcription = rawJson.transcription || undefined
      noSpeech = rawJson.noSpeech === true
    } catch { /* ignore parse errors */ }

    // If Gemini detected no speech, signal the client to discard
    if (noSpeech || (transcription === '' && !parsed.aiResponse)) {
      return NextResponse.json({ noSpeech: true, aiResponse: '', corrections: [], vocab: [] })
    }

    return NextResponse.json({
      ...parsed,
      transcription,
      inputType: 'audio',
    })
  } catch (err) {
    console.error('[audio-chat] Error:', err)
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 })
  }
}
