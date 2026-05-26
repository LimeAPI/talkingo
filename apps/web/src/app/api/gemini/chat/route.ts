import { NextRequest, NextResponse } from 'next/server'
import { callAIProvider } from '@/lib/api/ai-adapter'
import {
  getSystemInstruction,
  buildConversationPrompt,
  buildOpenerPrompt,
  buildAssessmentSystemInstruction,
  buildAssessmentPrompt,
  buildRecapSystemInstruction,
  buildRecapPrompt,
  buildOnboardingSystemInstruction,
  buildOnboardingOpenerPrompt,
  buildRegisterAlternativesSystemInstruction,
  buildRegisterAlternativesPrompt,
  buildMemoryUpdateSystemInstruction,
  buildMemoryUpdatePrompt,
  parseConversationResponse,
  parseOpenerResponse,
  parseAssessmentResponse,
  parseRecapResponse,
  parseRegisterAlternatives,
  parseMemoryUpdate,
} from '@talkingo/shared/gemini'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import type {
  ConversationState,
  TargetLanguage,
  CefrLevel,
  Correction,
  VocabItem,
  DomainScores,
  OnboardingTurn,
  PersonaId,
} from '@talkingo/shared/types'

// ─── Model fallback chain ─────────────────────────────────────────────────────
const MODEL_CHAIN = [
  process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash', 
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite'
]

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

interface ChatRequest {
  type:
    | 'message'
    | 'opener'
    | 'assessment'
    | 'recap'
    | 'onboarding-turn'
    | 'onboarding-assess'
    | 'register-alternatives'
    | 'memory-update'
  userText?: string
  state?: ConversationState
  history?: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  userName?: string
  targetLanguage?: TargetLanguage
  learningGoal?: string
  // assessment (new: transcript-based)
  assessmentTranscript?: Array<{ role: 'user' | 'ai'; text: string }>
  // recap
  recap?: {
    targetLanguage?: TargetLanguage
    unitId: string
    unitTitle: string
    cefr: CefrLevel
    domainScores?: DomainScores
    transcript: Array<{ role: 'user' | 'ai'; text: string }>
    corrections: Correction[]
    vocabIntroduced: VocabItem[]
    durationSeconds: number
    plantedPhrase?: { term: string; gloss: string; targetUses: number } | null
  }
  // register alternatives ("Say it like a native")
  registerRequest?: {
    userPhrase: string
    targetLanguage: TargetLanguage
    conversationContext?: string
  }
  // character memory update
  memoryRequest?: {
    personaId: PersonaId
    previousSummary: string
    knownFacts: string[]
    transcript: Array<{ role: 'user' | 'ai'; text: string }>
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest
    const { type, userText, state, history = [], userName } = body

    if (!process.env.AI_API_KEY && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'not_configured', message: 'AI service is not configured.' }, { status: 503 })
    }

    // ── Auth: verify user has a valid session ────────────────────────────
    const { verifyAuth, checkRateLimit } = await import('@/lib/api/auth-guard')
    const userId = await verifyAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // ── Rate limit: 60 requests per minute per user ──────────────────────
    const { allowed, remaining } = checkRateLimit(`gemini:${userId}`, 60, 60_000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // ── Free tier enforcement (server-side) ──────────────────────────────
    // Only enforce on conversation messages (not onboarding, assessment, etc.)
    if (type === 'message') {
      const { getSubscription } = await import('@/lib/appwrite-server')
      const subscription = await getSubscription(userId)
      const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'

      if (!isActive) {
        // Check daily message count (server-side, per-user, stored in rate limit store)
        const FREE_DAILY_LIMIT = 6
        const dayKey = new Date().toISOString().split('T')[0]
        const usageKey = `free:${userId}:${dayKey}`
        const { allowed: withinLimit } = checkRateLimit(usageKey, FREE_DAILY_LIMIT, 24 * 60 * 60_000)
        if (!withinLimit) {
          return NextResponse.json(
            { error: 'free_limit_reached', message: 'Daily message limit reached. Upgrade for unlimited conversations.' },
            { status: 429 }
          )
        }
      }
    }

    try {
      // ── Onboarding: single turn of the natural conversation ──
      if (type === 'onboarding-turn') {
        const sysInstr = buildOnboardingSystemInstruction(body.targetLanguage)
        const prompt = history.length === 0
          ? buildOnboardingOpenerPrompt(body.targetLanguage, body.learningGoal)
          : (userText ?? '')
        const raw = await callAIWithFallback(sysInstr, prompt, history, 'text')
        // Strip wrapping quotation marks that AI sometimes adds around plain text responses
        let cleaned = raw.trim()
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
            (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
            (cleaned.startsWith('`') && cleaned.endsWith('`'))) {
          cleaned = cleaned.slice(1, -1).trim()
        }
        // Also strip markdown code fences if AI wraps in ```
        if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
          cleaned = cleaned.slice(3, -3).trim()
        }
        return NextResponse.json({ aiResponse: cleaned })
      }

      // ── Onboarding: assess the full transcript ──
      if (type === 'onboarding-assess') {
        const sysInstr = buildAssessmentSystemInstruction(body.targetLanguage)
        const prompt = buildAssessmentPrompt(body.assessmentTranscript ?? [], body.targetLanguage)
        const raw = await callAIWithFallback(sysInstr, prompt, [])
        return NextResponse.json(parseAssessmentResponse(raw))
      }

      // ── Legacy single-answer assessment (kept for backwards compat) ──
      if (type === 'assessment') {
        const sysInstr = buildAssessmentSystemInstruction(body.targetLanguage)
        const prompt = buildAssessmentPrompt(
          [{ role: 'user', text: userText ?? '' }],
          body.targetLanguage
        )
        const raw = await callAIWithFallback(sysInstr, prompt, [])
        return NextResponse.json(parseAssessmentResponse(raw))
      }

      // ── Recap ──
      if (type === 'recap') {
        if (!body.recap) {
          return NextResponse.json({ error: 'bad_request', message: 'recap payload missing' }, { status: 400 })
        }
        const sysInstr = buildRecapSystemInstruction()
        const prompt = buildRecapPrompt({
          ...body.recap,
          domainScores: body.recap.domainScores as Record<string, string> | undefined,
          cefr: body.recap.cefr,
        })
        const raw = await callAIWithFallback(sysInstr, prompt, [])
        return NextResponse.json(parseRecapResponse(raw, {
          unitId: body.recap.unitId,
          unitTitle: body.recap.unitTitle,
          durationSeconds: body.recap.durationSeconds,
        }))
      }

      // ── Register alternatives ("Say it like a native") ──
      if (type === 'register-alternatives') {
        if (!body.registerRequest) {
          return NextResponse.json({ error: 'bad_request', message: 'registerRequest missing' }, { status: 400 })
        }
        const sysInstr = buildRegisterAlternativesSystemInstruction(body.registerRequest.targetLanguage)
        const prompt = buildRegisterAlternativesPrompt(
          body.registerRequest.userPhrase,
          body.registerRequest.targetLanguage,
          body.registerRequest.conversationContext
        )
        const raw = await callAIWithFallback(sysInstr, prompt, [])
        return NextResponse.json(parseRegisterAlternatives(raw))
      }

      // ── Character memory update (rolling summary) ──
      if (type === 'memory-update') {
        if (!body.memoryRequest) {
          return NextResponse.json({ error: 'bad_request', message: 'memoryRequest missing' }, { status: 400 })
        }
        const persona = getPersonaById(body.memoryRequest.personaId)
        const personaName = persona?.name ?? 'the AI'
        const sysInstr = buildMemoryUpdateSystemInstruction(personaName)
        const prompt = buildMemoryUpdatePrompt({
          personaName,
          previousSummary: body.memoryRequest.previousSummary,
          knownFacts: body.memoryRequest.knownFacts,
          transcript: body.memoryRequest.transcript,
        })
        const raw = await callAIWithFallback(sysInstr, prompt, [])
        return NextResponse.json(parseMemoryUpdate(raw))
      }

      // ── Conversation (opener / message) ──
      if (!state) {
        return NextResponse.json({ error: 'bad_request', message: 'state required' }, { status: 400 })
      }

      // Use hardcoded master prompt (zero DB reads)
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
