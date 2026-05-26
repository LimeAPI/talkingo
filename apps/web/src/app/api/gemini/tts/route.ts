import { NextRequest, NextResponse } from 'next/server'
import { synthesizeWithEdgeTTS } from '@/lib/api/edge-tts-service'

// ─── Gemini TTS fallback chain ────────────────────────────────────────────────
const GEMINI_TTS_MODELS = [
  'gemini-3.1-flash-tts',
  'gemini-2.5-flash-preview-tts',
]
const FALLBACK_VOICES = ['Aoede', 'Charon', 'Fenrir']

/**
 * TTS endpoint — Edge TTS (free) as primary, Gemini TTS as fallback.
 *
 * Body: { text: string, voiceName?: string, languageCode?: string, personaId?: string }
 *
 * Returns: { audioData: string, format: 'mp3' | 'pcm' }
 *   - Edge TTS returns MP3 (smaller, plays natively in browsers)
 *   - Gemini fallback returns base64 PCM (existing format for backwards compat)
 */
export async function POST(req: NextRequest) {
  // ── Auth: verify user has a valid session ────────────────────────────
  const { verifyAuth, checkRateLimit } = await import('@/lib/api/auth-guard')
  const userId = await verifyAuth(req)
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { allowed } = checkRateLimit(`tts:${userId}`, 60, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let text: string
  let voiceName: string | undefined
  let languageCode: string | undefined
  let personaId: string | undefined
  let provider: 'auto' | 'edge' | 'gemini' = 'auto'

  try {
    const body = await req.json()
    text = body?.text
    voiceName = body?.voiceName
    languageCode = body?.languageCode
    personaId = body?.personaId
    provider = body?.provider || 'auto'
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Strip markdown formatting before sending to TTS (no "asterisk asterisk" in speech)
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold** → bold
    .replace(/__(.+?)__/g, '$1')       // __bold__ → bold
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')  // *italic* → italic
    .replace(/^[\*\-]\s+/gm, '')       // bullet markers → remove
    .replace(/[«»]/g, '"')             // « » → regular quotes (sounds better in TTS)
    .trim()

  // ── Force Gemini if requested (for premium voice previews) ────────────────
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'TTS not available' }, { status: 503 })
    const result = await synthesizeWithGemini(text, voiceName || 'Aoede', languageCode, apiKey)
    if (result) return NextResponse.json(result)
    return NextResponse.json({ error: 'Gemini TTS failed' }, { status: 503 })
  }

  // ── Primary: Edge TTS (free) ──────────────────────────────────────────────
  if (provider === 'auto' || provider === 'edge') {
    try {
      const result = await synthesizeWithEdgeTTS(text, {
        languageCode,
        personaId,
        voiceName,
      })

      if (result) {
        return NextResponse.json({
          audioData: result.audioBase64,
          format: 'mp3',
        })
      }
    } catch (err) {
      console.warn('[tts] Edge TTS failed, trying Gemini fallback:', (err as Error).message)
    }
  }

  // ── Fallback: Gemini TTS (paid) ───────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not available' }, { status: 503 })
  }

  for (const modelName of GEMINI_TTS_MODELS) {
    const voicesToTry = voiceName ? [voiceName, ...FALLBACK_VOICES] : FALLBACK_VOICES

    for (const voice of voicesToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

        const speechConfig: Record<string, unknown> = {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        }
        if (languageCode) {
          speechConfig.languageCode = languageCode
        }

        const body = {
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig,
          },
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const status = res.status
          if (status === 404) break // model unavailable, try next
          if (status === 429) {
            return NextResponse.json({ error: 'Rate limited' }, { status: 503 })
          }
          continue
        }

        const data = await res.json()
        const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
        if (!audioData) continue

        return NextResponse.json({ audioData, format: 'pcm' })
      } catch {
        continue
      }
    }
  }

  console.error('[tts] All TTS providers failed')
  return NextResponse.json({ error: 'All TTS providers unavailable' }, { status: 503 })
}

// ─── Gemini TTS helper ────────────────────────────────────────────────────────

async function synthesizeWithGemini(
  text: string,
  voiceName: string,
  languageCode: string | undefined,
  apiKey: string
): Promise<{ audioData: string; format: 'pcm' } | null> {
  for (const modelName of GEMINI_TTS_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

      const speechConfig: Record<string, unknown> = {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      }
      if (languageCode) speechConfig.languageCode = languageCode

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig },
        }),
      })

      if (!res.ok) {
        if (res.status === 404) continue
        return null
      }

      const data = await res.json()
      const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
      if (audioData) return { audioData, format: 'pcm' }
    } catch {
      continue
    }
  }
  return null
}
