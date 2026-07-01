import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callAIProvider } from '@/lib/api/ai-adapter'
import {
  buildAnalysisSystemInstruction,
  buildAnalysisPrompt,
  parseAnalysisResponse,
} from '@talkingo/shared/gemini'
import type { ConversationState } from '@talkingo/shared/types'

/**
 * Voice-turn analysis endpoint.
 *
 * Live calls stream audio only, so they can't return structured corrections.
 * After each user turn the client sends the transcribed text here and gets back
 * corrections + a memory note + an optional language/script-normalized transcript.
 * This is what makes the live call actually teach and remember.
 *
 * Cheap by design: text-only, small model, no conversational reply.
 */

// Use the lightest models first — this runs once per user turn in a live call.
const MODEL_CHAIN = [
  process.env.NEXT_PUBLIC_AI_ANALYZE_MODEL || 'gemini-2.5-flash-lite',
  process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash',
]

const analyzeSchema = z.object({
  userText: z.string().min(1).max(4000),
  state: z.unknown().optional(),
})

export async function POST(req: NextRequest) {
  if (!process.env.AI_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  const { verifyAuth, checkRateLimit, validateOrigin } = await import('@/lib/api/auth-guard')
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 })
  }
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { userId } = auth

  // ── Rate limit — generous; one call per user turn in a live conversation ──
  const { allowed } = checkRateLimit(`analyze:${userId}`, 120, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // ── Premium gate ─────────────────────────────────────────────────────────
  // This endpoint exists only to analyze turns during a LIVE voice call, which
  // is premium-only (enforced at the WebSocket upgrade). A free user has no
  // legitimate reason to call it, and it runs a paid Gemini model — so gate it
  // here too. Fails CLOSED: any subscription read error denies access rather
  // than handing out the paid model.
  try {
    const { getSubscription } = await import('@/lib/appwrite-server')
    const sub = await getSubscription(userId)
    const isPremium = sub?.status === 'active' || sub?.status === 'trialing'
    if (!isPremium) {
      return NextResponse.json({ error: 'premium_required' }, { status: 402 })
    }
  } catch {
    return NextResponse.json({ error: 'premium_required' }, { status: 402 })
  }

  let body: { userText: string; state?: ConversationState }
  try {
    body = analyzeSchema.parse(await req.json()) as { userText: string; state?: ConversationState }
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { userText, state } = body
  const sysInstr = buildAnalysisSystemInstruction(state)
  const prompt = buildAnalysisPrompt(userText)

  for (const model of MODEL_CHAIN) {
    try {
      const raw = await callAIProvider({
        model,
        messages: [{ role: 'user', content: prompt }],
        systemInstruction: sysInstr,
        temperature: 0.3,
        responseFormat: 'json',
        maxTokens: 1024,
        timeoutMs: 15_000,
      })
      return NextResponse.json(parseAnalysisResponse(raw, userText))
    } catch (err) {
      console.warn(`[analyze] ${model} failed:`, err)
    }
  }

  // Soft-fail: never block the live call over a missed analysis.
  return NextResponse.json({ corrections: [], memoryUpdate: undefined })
}
