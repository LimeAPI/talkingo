import { NextRequest } from 'next/server'
import {
  getSystemInstruction,
  buildConversationPrompt,
} from '@talkingo/shared/gemini'
import type { ConversationState } from '@talkingo/shared/types'
import { z } from 'zod'

/**
 * Streaming chat endpoint — returns Server-Sent Events (SSE) with
 * progressive text chunks. The client shows text as it arrives.
 *
 * Falls back to non-streaming if the model doesn't support it.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503 })
  }

  // ── Auth: verify user has a valid session ────────────────────────────
  const { verifyAuth, checkRateLimit, validateOrigin } = await import('@/lib/api/auth-guard')
  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: 'forbidden_origin' }), { status: 403 })
  }
  const auth = await verifyAuth(req)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }
  const userId = auth.userId

  // ── Rate limit: 60 requests per minute per user ──────────────────────
  const { allowed } = checkRateLimit(`stream:${userId}`, 60, 60_000)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })
  }


  // -- Free tier enforcement (server-side) ------------------------------
  const { getSubscription, incrementFreeUsage } = await import('@/lib/appwrite-server')
  const subscription = await getSubscription(userId)
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'

  if (!isActive) {
    const FREE_LIFETIME_LIMIT = 50
    try {
      const newCount = await incrementFreeUsage(userId)
      if (newCount > FREE_LIFETIME_LIMIT) {
        return new Response(
          JSON.stringify({
            error: 'free_limit_reached',
            message: 'You have used all 50 free messages. Upgrade for unlimited conversations.',
          }),
          { status: 429 }
        )
      }
    } catch (usageErr) {
      // Fail CLOSED: deny rather than grant free AI on an unverifiable counter.
      console.error('[stream] free-usage check failed — denying:', usageErr)
      return new Response(
        JSON.stringify({ error: 'usage_unavailable', message: 'Unable to verify your usage right now. Please try again shortly.' }),
        { status: 503 }
      )
    }
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 })
  }

  const parsed = z.object({
    userText: z.string().max(4000),
    state: z.unknown(),
    history: z.array(z.any()).max(80).optional(),
    userName: z.string().max(100).optional(),
  }).safeParse(body)

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 })
  }

  const { userText, state, history = [], userName } = parsed.data as {
    userText: string
    state: ConversationState
    history: any[]
    userName?: string
  }

  if (!userText || !state) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 })
  }

  const systemInstruction = getSystemInstruction(state)
  const prompt = buildConversationPrompt(userText, state, userName)

  // Build messages array
  const messages = history.map((h: any) => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: h.parts || [{ text: '' }],
  }))
  messages.push({ role: 'user', parts: [{ text: prompt }] })

  const model = process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash'
  const modelName = model.startsWith('gemini') ? model : `gemini-${model}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`

  const requestBody = {
    contents: messages,
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 1024 },
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
  }

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify(requestBody),
    })

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('[stream] Gemini error:', geminiRes.status, err.slice(0, 200))
      return new Response(JSON.stringify({ error: 'ai_unavailable' }), { status: 503 })
    }

    // Pipe the SSE stream directly to the client
    const readable = geminiRes.body
    if (!readable) {
      return new Response(JSON.stringify({ error: 'no_stream' }), { status: 503 })
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('[stream] Error:', err)
    return new Response(JSON.stringify({ error: 'ai_unavailable' }), { status: 503 })
  }
}
