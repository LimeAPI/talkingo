import type {
  Correction,
  GeminiConversationResponse,
  GeminiOpenerResponse,
  GeminiAssessmentResponse,
  VocabItem,
  CefrLevel,
  LanguageLevel,
  SessionRecap,
  DomainScores,
  SkillDomain,
  NativeAlternative,
  RegisterAlternatives,
  CharacterMemory,
} from '../types'

function tryParseJson(raw: string): any {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : raw)
  } catch {
    return null
  }
}

const VALID_CEFR: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const VALID_LEVEL: LanguageLevel[] = ['beginner', 'intermediate', 'advanced']
const DOMAINS: SkillDomain[] = ['vocabulary', 'grammar', 'fluency', 'listening']
const VALID_CORRECTION_TYPES = ['grammar', 'vocabulary', 'pronunciation', 'naturalness'] as const
const VALID_NATIVE_REGISTERS = ['casual', 'natural', 'formal', 'expressive'] as const

function parseCefr(v: unknown, fallback: CefrLevel = 'B1'): CefrLevel {
  return VALID_CEFR.includes(v as CefrLevel) ? (v as CefrLevel) : fallback
}

function parseDomainScores(raw: unknown, fallback: CefrLevel = 'A1'): DomainScores {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return {
    vocabulary: parseCefr(obj.vocabulary, fallback),
    grammar:    parseCefr(obj.grammar,    fallback),
    fluency:    parseCefr(obj.fluency,    fallback),
    listening:  parseCefr(obj.listening,  fallback),
  }
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
      // If we know the user's text, drop any correction whose "original" phrase
      // doesn't appear in it — this catches stale/hallucinated corrections from
      // previous turns leaking into the current response.
      if (userText && userText.trim().length > 0) {
        const haystack = userText.toLowerCase()
        const needle = c.original.toLowerCase()
        // Allow partial word matches (e.g. "buyed" inside "I buyed it")
        if (!haystack.includes(needle)) return false
      }
      return true
    })
}

function parseNativeAlternatives(raw: unknown): NativeAlternative[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n) => ({
      userPhrase: String(n.userPhrase ?? ''),
      nativeAlternative: String(n.nativeAlternative ?? ''),
      why: String(n.why ?? ''),
      register: VALID_NATIVE_REGISTERS.includes(n.register as any)
        ? (n.register as NativeAlternative['register'])
        : 'natural',
    }))
    .filter((n) => n.userPhrase && n.nativeAlternative)
    .slice(0, 5)
}

export function parseConversationResponse(raw: string, userText?: string): GeminiConversationResponse {
  const parsed = tryParseJson(raw) ?? {}

  // Parse teachingNote if present
  let teachingNote: GeminiConversationResponse['teachingNote'] = undefined
  if (parsed.teachingNote && typeof parsed.teachingNote === 'object' && parsed.teachingNote.type && parsed.teachingNote.content) {
    const validTypes = ['correction', 'expression', 'grammar', 'idiom', 'culture']
    if (validTypes.includes(parsed.teachingNote.type)) {
      teachingNote = {
        type: parsed.teachingNote.type,
        title: String(parsed.teachingNote.title || ''),
        content: String(parsed.teachingNote.content || ''),
      }
    }
  }

  return {
    aiResponse: parsed.response || raw || "Sorry, could you say that again?",
    translation: typeof parsed.translation === 'string' ? parsed.translation : undefined,
    corrections: parseCorrections(parsed.corrections, userText),
    vocab: Array.isArray(parsed.vocab) ? (parsed.vocab as VocabItem[]) : [],
    emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'warm',
    unitComplete: parsed.unitComplete === true,
    domainSignals: undefined,
    teachingNote,
  }
}

export function parseOpenerResponse(raw: string): GeminiOpenerResponse {
  const parsed = tryParseJson(raw) ?? {}
  return {
    aiResponse: parsed.response || raw || 'Hi!',
    translation: typeof parsed.translation === 'string' ? parsed.translation : undefined,
    emotion: parsed.emotion || 'warm',
    vocab: Array.isArray(parsed.vocab) ? (parsed.vocab as VocabItem[]) : [],
  }
}

export function parseAssessmentResponse(raw: string): GeminiAssessmentResponse {
  const parsed = tryParseJson(raw) ?? {}
  const cefr = parseCefr(parsed.cefr, 'B1')
  const level: LanguageLevel = VALID_LEVEL.includes(parsed.level)
    ? parsed.level
    : cefr === 'A1' || cefr === 'A2' ? 'beginner'
    : cefr === 'C1' || cefr === 'C2' ? 'advanced'
    : 'intermediate'
  return {
    cefr,
    level,
    domainScores: parseDomainScores(parsed.domainScores, cefr),
    weakPatterns: Array.isArray(parsed.weakPatterns) ? parsed.weakPatterns.slice(0, 5) : [],
    encouragement: typeof parsed.encouragement === 'string' && parsed.encouragement
      ? parsed.encouragement
      : "Nice start — let's keep going.",
  }
}

export function parseRecapResponse(
  raw: string,
  fallback: { unitId: string; unitTitle: string; durationSeconds: number }
): SessionRecap {
  const parsed = tryParseJson(raw) ?? {}
  const domainDeltas: Partial<Record<SkillDomain, number>> = {}
  if (parsed.domainDeltas && typeof parsed.domainDeltas === 'object') {
    for (const d of DOMAINS) {
      const v = Number(parsed.domainDeltas[d])
      if (v === -1 || v === 0 || v === 1) domainDeltas[d] = v
    }
  }

  const planted = parsed.plantedPhraseRecap
  const plantedPhraseRecap = planted && typeof planted === 'object' && planted.term
    ? {
        term: String(planted.term),
        gloss: String(planted.gloss ?? ''),
        timesUsed: Math.max(0, Number(planted.timesUsed ?? 0) | 0),
      }
    : null

  return {
    durationSeconds: fallback.durationSeconds,
    unitId: fallback.unitId,
    unitTitle: fallback.unitTitle,
    vocabSeen: Array.isArray(parsed.vocabSeen) ? parsed.vocabSeen : [],
    topCorrections: parseCorrections(parsed.topCorrections),
    grammarTried: Array.isArray(parsed.grammarTried) ? parsed.grammarTried : [],
    encouragement: typeof parsed.encouragement === 'string' && parsed.encouragement
      ? parsed.encouragement : 'Good session. Keep going.',
    unitComplete: parsed.unitComplete === true,
    nextFocus: typeof parsed.nextFocus === 'string' && parsed.nextFocus
      ? parsed.nextFocus : 'Try one new structure in your next session.',
    nativeWouldSay: parseNativeAlternatives(parsed.nativeWouldSay),
    plantedPhraseRecap,
    domainDeltas: Object.keys(domainDeltas).length > 0 ? domainDeltas : undefined,
  }
}

// ─── Register alternatives ───────────────────────────────────────────────────

export function parseRegisterAlternatives(raw: string): RegisterAlternatives {
  const parsed = tryParseJson(raw) ?? {}
  return {
    casual: typeof parsed.casual === 'string' && parsed.casual ? parsed.casual : '',
    natural: typeof parsed.natural === 'string' && parsed.natural ? parsed.natural : '',
    expressive: typeof parsed.expressive === 'string' && parsed.expressive ? parsed.expressive : '',
  }
}

// ─── Memory update ───────────────────────────────────────────────────────────

export interface MemoryUpdateResult {
  summary: string
  newFacts: string[]
  lastTopics: string[]
}

export function parseMemoryUpdate(raw: string): MemoryUpdateResult {
  const parsed = tryParseJson(raw) ?? {}
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1500) : '',
    newFacts: Array.isArray(parsed.newFacts)
      ? parsed.newFacts.filter((f: any) => typeof f === 'string' && f.trim()).slice(0, 8)
      : [],
    lastTopics: Array.isArray(parsed.lastTopics)
      ? parsed.lastTopics.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 5)
      : [],
  }
}
