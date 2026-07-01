import { NextRequest, NextResponse } from 'next/server'
import { callAIProvider } from '@/lib/api/ai-adapter'

/**
 * Lightweight on-demand translation endpoint.
 * Called when user taps the "translate" button on a message.
 * Uses the cheapest model with minimal tokens.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth: verify user has a valid session ────────────────────────────
    const { verifyAuth, checkRateLimit } = await import('@/lib/api/auth-guard')
    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const userId = auth.userId

    const { allowed } = checkRateLimit(`translate:${userId}`, 30, 60_000)
    if (!allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const { text, targetLanguage } = await req.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'bad_request', message: 'text required' }, { status: 400 })
    }

    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }

    const result = await callAIProvider({
      model: 'gemini-2.5-flash-lite', // cheapest model for simple translation
      messages: [{ role: 'user', content: `Translate the following ${targetLanguage || ''} text to English. Return ONLY the translation, nothing else.\n\n${text}` }],
      temperature: 0.1,
      maxTokens: 256,
      responseFormat: 'text',
    })

    return NextResponse.json({ translation: result.trim() })
  } catch (err) {
    console.error('[translate] Error:', err)
    return NextResponse.json({ error: 'failed', message: 'Translation failed' }, { status: 500 })
  }
}
