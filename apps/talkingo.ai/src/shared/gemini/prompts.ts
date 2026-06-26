import type { ConversationState, TargetLanguage, ScriptPreference } from '../types'
import { getPersonaById, getPersonaPrompt } from './personas'
import { MASTER_PROMPT } from './master-prompt'
import { getLanguageMeta, hasScriptOptions } from '../languages'
import { getLevelByNumber } from '../levels'
import { getSeedById } from '../curriculum'

// ─── Response format ──────────────────────────────────────────────────────────

const RESPONSE_FORMAT = `Return ONLY valid JSON (no markdown, no code fences):
{
  "response": "Your spoken reply — in whatever language mix is appropriate for the user's level.",
  "responseParts": ["part1", "part2"] | null,
  "corrections": [{"original":"what they said wrong","corrected":"correct form","type":"grammar|vocabulary|pronunciation|naturalness","note":"brief explanation in English"}],
  "memoryUpdate": "Brief update about this learner when something meaningful changed. Empty string if nothing new."
}

Rules:
- "response": Your natural conversational reply. At beginner levels this will be mostly in the user's native language with target phrases woven in. At advanced levels this will be fully in the target language. Never put drills or repetition requests here.
- "responseParts": Use only when your reply has 2-3 distinct thoughts that feel more natural as separate messages. Otherwise null.
- "corrections": Only real errors from the current user message. Empty array if none. Never correct things they didn't actually say wrong.
- "memoryUpdate": Include only when you learned something genuinely new about this user — a pattern, a fact, a gap. Not every turn. Always include on session end.`

// ─── Block builders ───────────────────────────────────────────────────────────

function buildLanguageBlock(targetLanguage: TargetLanguage | undefined, level: number, nativeLanguage?: TargetLanguage | string, preferredScript?: ScriptPreference): string {
  const meta = getLanguageMeta(targetLanguage)
  // Resolve native language only if explicitly set. Do NOT silently assume English —
  // an unknown native means we can't scaffold, so beginner levels fall back to simple target.
  const hasNative = !!nativeLanguage
  const nativeMeta = hasNative ? getLanguageMeta(nativeLanguage as TargetLanguage) : null
  const nativeName = nativeMeta?.english ?? null

  // Build script hint based on user's preferred script setting
  let scriptHint = ''
  if (meta.script === 'non-latin' && hasScriptOptions(targetLanguage)) {
    if (preferredScript === 'latin') {
      scriptHint = `When writing ${meta.english} words/phrases, use Latin (romanized) script only — do NOT use native ${meta.native} characters.`
    } else if (preferredScript === 'both') {
      scriptHint = `When writing ${meta.english} words/phrases, show the native script (${meta.native}) as the primary text, followed by the Latin romanization in parentheses.`
    } else {
      // Default to native script
      scriptHint = `When writing ${meta.english} words/phrases, use the native script (${meta.native}).`
    }
  } else if (meta.script === 'non-latin') {
    scriptHint = `When writing ${meta.english} words/phrases, use the native script (${meta.native}).`
  }

  // At beginner levels, scaffold in the user's native language — but only if we know it.
  if (level <= 2) {
    if (nativeName) {
      return `TARGET LANGUAGE (what the user is learning): ${meta.english} (${meta.native})
${scriptHint}
OUTPUT LANGUAGE — Respond in ${nativeName}. ${nativeName} is the language you write your reply in. ${meta.english} is what you are teaching.
Weave ${meta.english} words and short phrases into your ${nativeName} reply. Whenever you use a ${meta.english} word or phrase, immediately say what it means in ${nativeName} in the same sentence. ${nativeName} is the bridge, not the destination — every turn must introduce or reinforce ${meta.english}. Never reply in pure ${nativeName} with nothing new to learn.`.trim()
    }
    // No known native language — keep it simple in the target language with very easy words.
    return `TARGET LANGUAGE (what the user is learning): ${meta.english} (${meta.native})
${scriptHint}
OUTPUT LANGUAGE — Respond in very simple ${meta.english}. Use short, easy sentences and common words. Keep it slow and clear for a beginner.`.trim()
  }

  if (level <= 4) {
    if (nativeName) {
      return `TARGET LANGUAGE: ${meta.english} (${meta.native})
${scriptHint}
OUTPUT LANGUAGE — Respond in a mix of ${meta.english} and ${nativeName}. Lean toward ${meta.english} for simple things, and use ${nativeName} only when explaining or when they seem lost.`.trim()
    }
    return `TARGET LANGUAGE: ${meta.english} (${meta.native})
${scriptHint}
OUTPUT LANGUAGE — Respond mostly in ${meta.english}, keeping it simple. Briefly clarify in a few words only if they seem lost.`.trim()
  }

  // Level 5+: target language dominant or exclusive
  const helpClause = nativeName
    ? `Only use ${nativeName} if they're clearly stuck and ask for help.`
    : `Stay in ${meta.english}; rephrase more simply if they're stuck rather than switching languages.`
  return `TARGET LANGUAGE: ${meta.english} (${meta.native})
${scriptHint}
OUTPUT LANGUAGE — Respond in ${meta.english}. ${helpClause}`.trim()
}

function buildLevelBlock(state?: ConversationState): string {
  const level = state?.talkingoLevel ?? 5
  const levelData = getLevelByNumber(level)
  return `LEVEL ${level}/12 — "${levelData.name}"
${levelData.aiBehavior}`
}

/**
 * LANGUAGE LOCK — the single source of truth for which languages are allowed.
 *
 * Prevents the AI from drifting into a third, similar-sounding language (the
 * classic Hindi↔Urdu, Spanish↔Portuguese bleed) and keeps every output in the
 * languages the user actually chose. Shared by chat, live voice, and openers.
 */
export function buildLanguageLock(
  targetLanguage: TargetLanguage | undefined,
  nativeLanguage?: TargetLanguage | string
): string {
  const target = getLanguageMeta(targetLanguage)
  const native = nativeLanguage ? getLanguageMeta(nativeLanguage as TargetLanguage) : null

  const allowed = native && native.english !== target.english
    ? `${target.english} (the language being learned) and ${native.english} (the user's native language)`
    : `${target.english}`

  const onlyClause = native && native.english !== target.english
    ? `${target.english} or ${native.english}`
    : `${target.english}`

  return `LANGUAGE LOCK — You may only ever read, write, or speak in ${allowed}. The user only ever speaks these languages. If something they say sounds similar to a related language (e.g. Hindi vs Urdu, Spanish vs Portuguese, Farsi vs Arabic), always interpret and render it as ${onlyClause} — never switch to a third language and never switch scripts. If a transcript appears in the wrong script or a similar language, treat it as ${onlyClause} and respond accordingly.`
}

function buildPersonaBlock(state?: ConversationState): string {
  if (!state?.persona) return ''
  const persona = getPersonaById(state.persona)
  if (!persona) return ''
  return getPersonaPrompt(persona)
}

function buildScenarioBlock(state?: ConversationState): string {
  if (!state) return ''

  // Custom prompt from user
  if (state.customPrompt) {
    return `CONTEXT: The user wants to talk about: ${state.customPrompt}`
  }

  // Curriculum seed scenario
  const seed = state.currentUnitId && state.currentUnitId !== 'free-talk'
    ? getSeedById(state.currentUnitId)
    : null

  if (seed) {
    return `CONTEXT: ${seed.scenarioBrief}
Relevant vocabulary: ${seed.targetVocab.join(', ')}
Grammar that fits naturally here: ${seed.targetGrammar.join(', ')}`
  }

  // Free talk
  return `CONTEXT: Open conversation. Follow whatever the user wants to talk about.`
}

// ─── Memory block builder ────────────────────────────────────────────────────

function buildMemoryBlock(state?: ConversationState): string {
  // Prefer structured planner injection (Practice Planner output)
  if (state?.practiceTargets) {
    return state.practiceTargets
  }

  // Fallback to old-style freeform (during migration or if structured memory not loaded)
  const parts: string[] = []

  if (state?.memoryLifeline) {
    parts.push(`WHAT YOU REMEMBER ABOUT THIS USER:\n${state.memoryLifeline}`)
  }

  if (state?.userNotes) {
    parts.push(`USER'S NOTES FOR YOU:\n${state.userNotes}`)
  }

  if (parts.length === 0) return ''
  return parts.join('\n\n')
}

// ─── Main system instruction ──────────────────────────────────────────────────

export function getSystemInstruction(state?: ConversationState): string {
  const level = state?.talkingoLevel ?? 5

  const blocks = [
    // 1. Soul — who you are
    MASTER_PROMPT,
    // 2. Persona — your character
    buildPersonaBlock(state),
    // 3. Level — how to approach this learner
    buildLevelBlock(state),
    // 4. Language — what they're learning and the output language
    buildLanguageBlock(state?.targetLanguage, level, state?.nativeLanguage, state?.preferredScript),
    // 4b. Language lock — never drift into a third / similar language
    buildLanguageLock(state?.targetLanguage, state?.nativeLanguage),
    // 5. Scenario — conversational backdrop
    buildScenarioBlock(state),
    // 6. Memory — what you know about them
    buildMemoryBlock(state),
    // 7. Response format — technical output spec
    RESPONSE_FORMAT,
  ]

  return blocks.filter(Boolean).join('\n\n')
}

// ─── User-turn prompts ────────────────────────────────────────────────────────

export function buildConversationPrompt(
  userText: string,
  state: ConversationState,
  userName?: string
): string {
  if (userName) {
    return `[${userName}]: ${userText}`
  }
  return userText
}

export function buildOpenerPrompt(state: ConversationState, userName?: string): string {
  const meta = getLanguageMeta(state.targetLanguage)
  const nativeMeta = state.nativeLanguage ? getLanguageMeta(state.nativeLanguage as TargetLanguage) : null
  const nativeName = nativeMeta?.english ?? null
  const nameStr = userName ? ` Their name is ${userName}.` : ''
  const level = state.talkingoLevel ?? 5

  // ── Memory-aware continuity ──────────────────────────────────────────────
  // If we remember this user, open by naturally referencing something relevant
  // (a past topic, an interest, a goal) — like a friend picking up where you
  // left off. Never list facts; weave one in only if it feels natural.
  const memory = state.practiceTargets || state.memoryLifeline
  const memoryClause = memory
    ? ` You already know this person from past conversations. Here is what you remember:\n${memory}\nOpen like a friend reconnecting — if something here is worth bringing up, weave ONE thread in naturally (a past topic, an interest, how something went). Never recite a list or say "I remember that…". If nothing fits, just be warm.`
    : ''

  // Anchor the opener language explicitly. Fall back to simple target if native is unknown.
  let langAnchor: string
  if (level <= 2) {
    langAnchor = nativeName
      ? ` Respond in ${nativeName}. You may include one short ${meta.english} greeting and tell them what it means in ${nativeName}.`
      : ` Respond in very simple ${meta.english} with short, easy words.`
  } else if (level <= 4) {
    langAnchor = nativeName
      ? ` Respond in a mix of ${nativeName} and ${meta.english}.`
      : ` Respond mostly in simple ${meta.english}.`
  } else {
    langAnchor = ` Respond in ${meta.english}.`
  }

  if (state.customPrompt) {
    return `Start a fresh conversation.${nameStr} The user wants to talk about: ${state.customPrompt}. Open naturally — be warm, be yourself, and end with something that makes them want to respond.${memoryClause}${langAnchor}`
  }

  const seed = state.currentUnitId && state.currentUnitId !== 'free-talk'
    ? getSeedById(state.currentUnitId)
    : null

  if (seed) {
    return `Start a fresh conversation.${nameStr} The setting is: ${seed.scenarioBrief}. Open naturally — be warm, be yourself, and end with something that makes them want to respond.${memoryClause}${langAnchor}`
  }

  return `Start a fresh conversation.${nameStr} Ask what they'd like to talk about or suggest something light. Be warm, be yourself.${memoryClause}${langAnchor}`
}

// ─── Voice-turn analysis (live call teaching pass) ────────────────────────────

/**
 * Live voice calls only stream audio — they can't return structured corrections.
 * This builds a focused, cheap second-pass instruction: given what the user said
 * (already transcribed by the Live API), extract corrections + a memory note, and
 * fix any wrong-language/script transcription artifacts. It does NOT generate a
 * conversational reply — the live model already handled the talking.
 */
export function buildAnalysisSystemInstruction(state?: ConversationState): string {
  const level = state?.talkingoLevel ?? 5
  const languageLock = buildLanguageLock(state?.targetLanguage, state?.nativeLanguage)
  const levelData = getLevelByNumber(level)

  return `You are a language tutor silently reviewing what a learner just said OUT LOUD during a live conversation. You are NOT replying to them — another part of the system already handled the conversation. Your only job is to analyze their utterance.

${languageLock}

LEVEL ${level}/12 — "${levelData.name}". Judge mistakes against what matters at this level. At low levels, ignore tiny imperfections and only flag things that block being understood. At high levels, flag naturalness and nuance.

Return ONLY valid JSON (no markdown, no code fences):
{
  "normalizedTranscript": "The learner's words re-rendered in the CORRECT language and script if the transcription drifted into a wrong/similar language or script. Otherwise an empty string. Never change their actual words or fix grammar here — only fix transcription language/script artifacts.",
  "corrections": [{"original":"what they said wrong","corrected":"correct form","type":"grammar|vocabulary|pronunciation|naturalness","note":"brief explanation in English"}],
  "memoryUpdate": "Brief note about this learner if something meaningful was revealed (an interest, a fact, a recurring pattern). Empty string if nothing new."
}

Rules:
- corrections: only real errors actually present in what they said. Empty array if they spoke correctly. Never invent mistakes.
- normalizedTranscript: only when the transcript is in the wrong language/script for this user. Most of the time this is "".
- Be encouraging in spirit: at beginner levels, don't nitpick.`.trim()
}

export function buildAnalysisPrompt(userText: string): string {
  return `The learner just said (transcribed from their speech):\n"${userText}"\n\nAnalyze it and return the JSON.`
}

// ─── Assessment (placement) ───────────────────────────────────────────────────
export function buildAssessmentSystemInstruction(targetLanguage: TargetLanguage | undefined): string {
  const meta = getLanguageMeta(targetLanguage)
  return `You are assessing a user's speaking level in ${meta.english}.

Based on their conversation, assign a level from 1-12:
1-2: Can only produce single words or short phrases
3-4: Can form simple sentences about daily life
5-6: Can sustain conversations with some flow
7-9: Can express nuance, humor, and complex ideas
10-12: Native-like command

Output ONLY this JSON:
{
  "talkingoLevel": 1-12,
  "encouragement": "One warm sentence praising something specific they did well."
}`
}

export function buildAssessmentPrompt(
  transcript: Array<{ role: 'user' | 'ai'; text: string }>,
  targetLanguage: TargetLanguage | undefined
): string {
  const meta = getLanguageMeta(targetLanguage)
  const transcriptStr = transcript.map((t) => `${t.role === 'user' ? 'USER' : 'AI'}: ${t.text}`).join('\n')
  return `Target language: ${meta.english}.\n\nConversation:\n${transcriptStr}\n\nAssess the USER's level. Return JSON.`
}
