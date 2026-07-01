import { NextRequest, NextResponse } from 'next/server'
import { synthesizeWithEdgeTTS } from '@/lib/api/edge-tts-service'
import { z } from 'zod'

// ─── Pronunciation TTS endpoint ───────────────────────────────────────────────
// Synthesizes a short word or phrase for pronunciation corrections.
// Uses Edge TTS (free) as the primary provider.

const pronunciationSchema = z.object({
  text: z.string().min(1).max(200),
  languageCode: z.string().max(32).optional(),
  personaId: z.string().max(32).optional(),
})

/**
 * POST /api/tts/pronunciation
 *
 * Synthesizes the correct pronunciation of a word/phrase using Edge TTS.
 * Designed for inline playback from the CorrectionsBlock pronunciation button.
 *
 * Body: { text: string, languageCode?: string, personaId?: string }
 * Returns: { audioData: string, format: 'mp3' }
 */
export async function POST(req: NextRequest) {
  // ── Auth: verify user has a valid session ────────────────────────────
  const { verifyAuth, checkRateLimit, validateOrigin } = await import('@/lib/api/auth-guard')
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 })
  }
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = auth.userId

  // Rate limit: 120 pronunciation requests per minute (more generous since they're short)
  const { allowed } = checkRateLimit(`tts-pronunciation:${userId}`, 120, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let text: string
  let languageCode: string | undefined
  let personaId: string | undefined

  try {
    const body = pronunciationSchema.parse(await req.json())
    text = body.text
    languageCode = body.languageCode
    personaId = body.personaId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Strip any markdown/formatting from the word/phrase
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/[«»]/g, '"')
    .trim()

  // ── Synthesize with Edge TTS ──────────────────────────────────────────────
  try {
    const result = await synthesizeWithEdgeTTS(text, {
      languageCode,
      personaId,
    })

    if (result) {
      return NextResponse.json({
        audioData: result.audioBase64,
        format: 'mp3',
      })
    }

    return NextResponse.json({ error: 'TTS synthesis returned no audio' }, { status: 503 })
  } catch (err) {
    console.error('[tts/pronunciation] Synthesis failed:', (err as Error).message)
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 503 })
  }
}
