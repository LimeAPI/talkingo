/**
 * Universal AI Provider Adapter
 * 
 * Supports Google Gemini (Direct), OpenRouter, and any OpenAI-compatible API.
 * Switch providers by changing NEXT_PUBLIC_AI_PROVIDER and AI_API_KEY in .env
 */

import 'server-only'

export type AIProvider = 'google' | 'openrouter' | 'openai'

/** Default timeout for AI API calls (30 seconds) */
const AI_TIMEOUT_MS = 30_000

interface ChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system'
  parts?: Array<{ text: string }> // Google format
  content?: string // OpenAI format
}

interface AIRequest {
  model: string
  messages: ChatMessage[]
  systemInstruction?: string
  temperature?: number
  maxTokens?: number
  /** Set to 'text' for plain text responses (e.g., onboarding conversation). Defaults to 'json'. */
  responseFormat?: 'json' | 'text'
  /** Timeout in ms. Defaults to 30s. */
  timeoutMs?: number
}

export async function callAIProvider(request: AIRequest): Promise<string> {
  const provider = (process.env.NEXT_PUBLIC_AI_PROVIDER || 'google') as AIProvider
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY
  
  if (!apiKey) throw new Error('AI_API_KEY is not configured')

  if (provider === 'google') {
    return callGoogleDirect(request, apiKey)
  } else {
    return callOpenAICompatible(request, apiKey, provider)
  }
}

async function callGoogleDirect(request: AIRequest, apiKey: string): Promise<string> {
  const modelName = request.model.startsWith('gemini') ? request.model : `gemini-${request.model}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`

  // Convert messages to Google format
  const contents = request.messages.map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: msg.parts || [{ text: msg.content || '' }]
  }))

  const body: any = {
    contents,
    generationConfig: {
      temperature: request.temperature ?? 0.85,
      maxOutputTokens: request.maxTokens ?? 4096,
      // Only force JSON mime type for non-conversation calls (assessment, recap, etc.)
      // Conversation calls benefit from free-form thinking → JSON at the end
      ...(request.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
      thinkingConfig: { thinkingBudget: 1024 },
    },
  }

  if (request.systemInstruction) {
    body.systemInstruction = { parts: [{ text: request.systemInstruction }] }
  }

  // Abort if the request takes too long
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? AI_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google AI Error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } finally {
    clearTimeout(timeout)
  }
}

async function callOpenAICompatible(request: AIRequest, apiKey: string, provider: AIProvider): Promise<string> {
  const baseUrl = provider === 'openrouter' 
    ? 'https://openrouter.ai/api/v1' 
    : 'https://api.openai.com/v1'

  const url = `${baseUrl}/chat/completions`

  // Convert messages to OpenAI format
  const messages = request.messages.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : msg.role,
    content: msg.content || msg.parts?.[0]?.text || ''
  }))

  if (request.systemInstruction) {
    messages.unshift({ role: 'system', content: request.systemInstruction })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }

  // OpenRouter specific headers for better routing/cost tracking
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'https://talkingo.app'
    headers['X-Title'] = 'Talkingo'
  }

  // Abort if the request takes too long
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? AI_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model,
        messages,
        temperature: request.temperature ?? 0.85,
        max_tokens: request.maxTokens ?? 2048,
        ...(request.responseFormat !== 'text' ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`${provider} Error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeout)
  }
}
