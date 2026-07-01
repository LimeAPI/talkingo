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

/**
 * Normalize text for fuzzy matching: lowercase, strip diacritics, collapse
 * punctuation/whitespace. Lets "Je suis allé." match a transcript of
 * "je suis alle" without dropping a legitimate correction.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Decide whether a correction's `original` plausibly refers to something the
 * user actually said. This is an anti-hallucination guard, NOT an exact match.
 *
 * Passes when:
 *  - the normalized original is a substring of the normalized user text, OR
 *  - a majority (>= 60%) of the original's word tokens appear in the user text.
 *
 * The token-overlap path is what saves real corrections when STT, accents, or
 * punctuation make an exact substring match fail.
 */
function correctionRefersToUserText(original: string, userText: string): boolean {
  const haystack = normalizeForMatch(userText)
  const needle = normalizeForMatch(original)
  if (!needle) return false
  if (haystack.includes(needle)) return true

  const tokens = needle.split(' ').filter((t) => t.length > 1)
  if (tokens.length === 0) {
    // Single short token (e.g. "a", "el") — require an exact word presence.
    return new RegExp(`(^| )${needle}( |$)`).test(haystack)
  }
  const hits = tokens.filter((t) => haystack.includes(t)).length
  return hits / tokens.length >= 0.6
}

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
      // Drop no-op "corrections" where original and corrected are identical.
      if (normalizeForMatch(c.original) === normalizeForMatch(c.corrected)) return false
      if (userText && userText.trim().length > 0) {
        if (!correctionRefersToUserText(c.original, userText)) return false
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
    keyWords: parseKeyWords(parsed.keyWords),
  }
}

/**
 * Parse the optional `keyWords` array — target-language words/phrases the AI
 * used that are worth practicing. Tolerant of absence/garbage: keeps only
 * non-empty strings, trims, caps length (40 chars) and count (3). Returns
 * undefined when there's nothing usable so callers can skip cleanly.
 */
function parseKeyWords(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw
    .filter((w): w is string => typeof w === 'string')
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w.length <= 40)
    .slice(0, 3)
  return out.length > 0 ? out : undefined
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
