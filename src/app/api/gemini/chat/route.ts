import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callAIProvider } from '@/lib/api/ai-adapter'
import {
  getSystemInstruction,
  buildConversationPrompt,
  buildOpenerPrompt,
  buildAssessmentSystemInstruction,
  buildAssessmentPrompt,
  parseConversationResponse,
  parseOpenerResponse,
} from '@talkingo/shared/gemini'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import type {
  ConversationState,
  TargetLanguage,
} from '@talkingo/shared/types'

// ─── Model fallback chain ─────────────────────────────────────────────────────
const MODEL_CHAIN = [
  process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite'
]

const chatRequestSchema = z.object({
  type: z.enum(['message', 'opener', 'assessment']),
  userText: z.string().max(4000).optional(),
  state: z.unknown().optional(),
  history: z.array(z.any()).max(80).optional(),
  userName: z.string().max(100).optional(),
  targetLanguage: z.string().max(20).optional(),
  assessmentTranscript: z.array(z.object({
    role: z.enum(['user', 'ai']),
    text: z.string().max(4000),
  })).max(300).optional(),
}).passthrough()

async function callAIWithFallback(
  systemInstruction: string,
  prompt: string,
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  responseFormat: 'json' | 'text' = 'json'
): Promise<string> {
  const messages = history.map(h => ({
    role: (h.role === 'model' ? 'assistant' : h.role) as 'user' | 'assistant',
    content: h.parts?.[0]?.text || ''
  }))
  messages.push({ role: 'user', content: prompt })

  for (const model of MODEL_CHAIN) {
    try {
      return await callAIProvider({ model, messages, systemInstruction, temperature: 0.85, responseFormat })
    } catch (err) {
      console.warn(`[AI] ${model} failed, retrying...`, err)
    }
  }
  throw new Error('All AI models failed')
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json()
    const parsed = chatRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_request', message: 'Invalid request' }, { status: 400 })
    }

    const body = parsed.data as { type: string; userText?: string; state?: ConversationState; history?: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>; userName?: string; targetLanguage?: TargetLanguage; assessmentTranscript?: Array<{ role: 'user' | 'ai'; text: string }> }
    const { type, userText, state, history = [], userName } = body

    if (!process.env.AI_API_KEY && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'not_configured', message: 'AI service is not configured.' }, { status: 503 })
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

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { allowed } = checkRateLimit(`gemini:${userId}`, 60, 60_000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // ── Free tier limit (lifetime) ──────────────────────────────────
    const { getSubscription, incrementFreeUsage, getFreeUsage } = await import('@/lib/appwrite-server')
    const subscription = await getSubscription(userId)
    const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'
    if (!isActive) {
      const FREE_LIFETIME_LIMIT = 50
      const limitResponse = NextResponse.json(
        { error: 'free_limit_reached', message: 'You have used all 50 free messages. Upgrade for unlimited conversations.' },
        { status: 429 }
      )
      try {
        // Only real user messages count toward the lifetime limit. Openers and the
        // placement assessment are free and must NOT burn the user's quota.
        if (type === 'message') {
          const newCount = await incrementFreeUsage(userId)
          if (newCount > FREE_LIFETIME_LIMIT) return limitResponse
        } else {
          // opener / assessment — block when already capped, but don't increment.
          const used = await getFreeUsage(userId)
          if (used >= FREE_LIFETIME_LIMIT) return limitResponse
        }
      } catch (usageErr) {
        // Fail CLOSED: if we can't verify remaining free quota (counter store
        // unavailable), deny rather than hand out free AI on an unverifiable
        // counter. Premium users skip this block entirely and are unaffected.
        console.error('[gemini/chat] free-usage check failed — denying:', usageErr)
        return NextResponse.json(
          { error: 'usage_unavailable', message: 'Unable to verify your usage right now. Please try again shortly.' },
          { status: 503 }
        )
      }
    }

    try {
      // ── Assessment ───────────────────────────────────────────────────────
      if (type === 'assessment') {
        const sysInstr = buildAssessmentSystemInstruction(body.targetLanguage)
        const prompt = buildAssessmentPrompt(body.assessmentTranscript ?? [{ role: 'user', text: userText ?? '' }], body.targetLanguage)
        const raw = await callAIWithFallback(sysInstr, prompt, [], 'text')
        const { parseAssessmentResponse } = await import('@talkingo/shared/gemini')
        return NextResponse.json(parseAssessmentResponse(raw))
      }

      // ── Conversation (opener / message) ──────────────────────────────────
      if (!state) {
        return NextResponse.json({ error: 'bad_request', message: 'state required' }, { status: 400 })
      }

      const sysInstr = getSystemInstruction(state)
      const prompt = type === 'opener'
        ? buildOpenerPrompt(state, userName)
        : buildConversationPrompt(userText ?? '', state, userName)

      const raw = await callAIWithFallback(sysInstr, prompt, history, 'text')

      if (type === 'opener') return NextResponse.json(parseOpenerResponse(raw))
      return NextResponse.json(parseConversationResponse(raw, userText))

    } catch (aiErr: unknown) {
      console.error('[gemini/chat] All models failed:', aiErr)
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr)
      const isRateLimit = errMsg.includes('429')
      return NextResponse.json(
        {
          error: isRateLimit ? 'rate_limited' : 'ai_unavailable',
          message: isRateLimit
            ? 'AI is temporarily rate limited. Please wait a moment.'
            : 'AI service is currently unavailable. Please try again shortly.',
        },
        { status: isRateLimit ? 429 : 503 }
      )
    }
  } catch (err) {
    console.error('[gemini/chat] Request parsing error:', err)
    return NextResponse.json({ error: 'bad_request', message: 'Invalid request' }, { status: 400 })
  }
}
