import { NextRequest } from 'next/server'
import {
  getSystemInstruction,
  buildConversationPrompt,
} from '@talkingo/shared/gemini'
import type { ConversationState } from '@talkingo/shared/types'

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
  const { verifyAuth, checkRateLimit } = await import('@/lib/api/auth-guard')
  const userId = await verifyAuth(req)
  if (!userId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  // ── Rate limit: 60 requests per minute per user ──────────────────────
  const { allowed } = checkRateLimit(`stream:${userId}`, 60, 60_000)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 })
  }

  const { userText, state, history = [], userName } = body as {
    userText: string
    state: ConversationState
    history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`

  const requestBody = {
    contents: messages,
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 1024 },
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
  }

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
