import type {
  Correction,
  GeminiConversationResponse,
  GeminiOpenerResponse,
  GeminiAssessmentResponse,
} from '../types'

function tryParseJson(raw: string): any {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : raw)
  } catch {
    return null
  }
}

const VALID_TALKINGO_LEVELS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const VALID_CORRECTION_TYPES = ['grammar', 'vocabulary', 'pronunciation', 'naturalness'] as const

function parseTalkingoLevel(v: unknown, fallback: number = 5): number {
  const n = Number(v)
  return VALID_TALKINGO_LEVELS.includes(n) ? n : fallback
}

const VALID_ROOT_CAUSES = ['careless', 'knowledge-gap', 'l1-interference', 'overgeneralization'] as const

function parseCorrections(raw: unknown, userText?: string): Correction[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      original: String(c.original ?? ''),
      corrected: String(c.corrected ?? ''),
      type: VALID_CORRECTION_TYPES.includes(c.type as any)
        ? (c.type as Correction['type'])
        : 'grammar',
      rootCause: VALID_ROOT_CAUSES.includes(c.rootCause as any)
        ? (c.rootCause as Correction['rootCause'])
        : undefined,
      note: typeof c.note === 'string' ? c.note : undefined,
    }))
    .filter((c) => {
      if (!c.original || !c.corrected) return false
      if (userText && userText.trim().length > 0) {
        const haystack = userText.toLowerCase()
        const needle = c.original.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
}

export function parseConversationResponse(raw: string, userText?: string): GeminiConversationResponse {
  const parsed = tryParseJson(raw) ?? {}

  // Extract responseParts for multi-bubble delivery
  let responseParts: string[] | undefined = undefined
  if (Array.isArray(parsed.responseParts) && parsed.responseParts.length >= 2) {
    const validParts = parsed.responseParts
      .filter((p: unknown) => typeof p === 'string' && p.trim().length > 0)
      .map((p: string) => p.trim())
      .slice(0, 3) // Max 3 parts
    if (validParts.length >= 2) {
      responseParts = validParts
    }
  }

  return {
    aiResponse: parsed.response || raw || "Sorry, could you say that again?",
    corrections: parseCorrections(parsed.corrections, userText),
    unitComplete: parsed.unitComplete === true,
    memoryUpdate: typeof parsed.memoryUpdate === 'string' && parsed.memoryUpdate.trim()
      ? parsed.memoryUpdate.trim()
      : undefined,
    responseParts,
  }
}

export interface GeminiAnalysisResponse {
  normalizedTranscript?: string
  corrections: Correction[]
  memoryUpdate?: string
}

/**
 * Parse the live voice-turn analysis response.
 * No conversational reply — just corrections, an optional cleaned transcript,
 * and an optional memory note.
 */
export function parseAnalysisResponse(raw: string, userText?: string): GeminiAnalysisResponse {
  const parsed = tryParseJson(raw) ?? {}
  const normalized = typeof parsed.normalizedTranscript === 'string' && parsed.normalizedTranscript.trim()
    ? parsed.normalizedTranscript.trim()
    : undefined
  // If the transcript was normalized, corrections refer to the corrected text,
  // so don't substring-filter against the (possibly wrong-language) original.
  const filterText = normalized ? undefined : userText
  return {
    normalizedTranscript: normalized,
    corrections: parseCorrections(parsed.corrections, filterText),
    memoryUpdate: typeof parsed.memoryUpdate === 'string' && parsed.memoryUpdate.trim()
      ? parsed.memoryUpdate.trim()
      : undefined,
  }
}

export function parseOpenerResponse(raw: string): GeminiOpenerResponse {  const parsed = tryParseJson(raw) ?? {}
  return {
    aiResponse: parsed.response || raw || 'Hi!',
  }
}

export function parseAssessmentResponse(raw: string): GeminiAssessmentResponse {
  const parsed = tryParseJson(raw) ?? {}
  const talkingoLevel = parseTalkingoLevel(parsed.talkingoLevel, 5)
  return {
    talkingoLevel,
    encouragement: typeof parsed.encouragement === 'string' && parsed.encouragement
      ? parsed.encouragement
      : "Nice start — let's keep going.",
  }
}
