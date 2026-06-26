import { NextRequest, NextResponse } from 'next/server'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import { synthesizePersonaSample } from '@/lib/api/edge-tts-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/personas/sample?id=eli
 *
 * Returns a short audio sample (mp3) of a persona speaking in the user's
 * target language. Used by the landing page "Hear them speak" buttons.
 *
 * Caches the synthesized audio in memory for 24h so we don't re-spend
 * TTS credits every time someone scrolls past the persona section.
 */

const cache = new Map<string, { audio: Buffer; contentType: string; cachedAt: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000

function cacheKey(personaId: string, language: string) {
  return `${personaId}::${language}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const language = (searchParams.get('language') || 'en').toLowerCase()

  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const persona = getPersonaById(id)
  if (!persona || !persona.sampleSentence) {
    return NextResponse.json({ error: 'unknown persona' }, { status: 404 })
  }

  // Serve from cache if warm
  const key = cacheKey(persona.id, language)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return new NextResponse(cached.audio, {
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Cache': 'HIT',
      },
    })
  }

  try {
    const { audio, contentType } = await synthesizePersonaSample({
      voiceName: persona.voiceName,
      text: persona.sampleSentence,
      language,
    })
    cache.set(key, { audio, contentType, cachedAt: Date.now() })
    return new NextResponse(audio, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Cache': 'MISS',
      },
    })
  } catch (err: any) {
    console.error('[personas/sample] synthesis failed:', err?.message)
    // Soft-fail: return an empty response so the UI can degrade gracefully
    return NextResponse.json({ error: 'synthesis_failed' }, { status: 502 })
  }
}
