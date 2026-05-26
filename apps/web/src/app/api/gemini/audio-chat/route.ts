import { NextRequest, NextResponse } from 'next/server'
import {
  getSystemInstruction,
} from '@talkingo/shared/gemini'
import { parseConversationResponse } from '@talkingo/shared/gemini'
import type { ConversationState } from '@talkingo/shared/types'

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  // ── Auth: verify user has a valid session ────────────────────────────
  const { verifyAuth, checkRateLimit } = await import('@/lib/api/auth-guard')
  const userId = await verifyAuth(req)
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Rate limit: 30 audio requests per minute per user ──────────────────
  const { allowed } = checkRateLimit(`audio:${userId}`, 30, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { audioBase64, mimeType, state, history = [], userName } = body

  if (!audioBase64 || !state) {
    return NextResponse.json({ error: 'bad_request', message: 'audioBase64 and state required' }, { status: 400 })
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
        mimeType: mimeType || 'audio/webm',
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
