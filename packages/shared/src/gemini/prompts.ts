import type { ConversationState, CefrLevel, TargetLanguage, DomainScores, SkillDomain } from '../types'
import { getPersonaById, getPersonaPrompt } from './personas'
import { MASTER_PROMPT } from './master-prompt'
import { getLanguageMeta } from '../languages'
import { getSeedById, SEEDS, type ConversationSeed, cefrIndex } from '../curriculum'
import { buildL1PromptBlock } from '../curriculum/l1-interference'
import { cefrToLanguageLevel } from '../utils'
import { getLevelByNumber, cefrToTalkingoLevel } from '../levels'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function getOverallCefr(state?: ConversationState): CefrLevel {
  if (state?.cefr) return state.cefr
  if (state?.domainScores) {
    // Calculate average from domain scores if available
    const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    const levels = [
      state.domainScores.vocabulary,
      state.domainScores.grammar,
      state.domainScores.fluency,
      state.domainScores.listening,
    ]
    const avgIndex = levels.reduce((sum, level) => sum + CEFR_ORDER.indexOf(level), 0) / levels.length
    const roundedIndex = Math.round(avgIndex)
    return CEFR_ORDER[Math.min(Math.max(roundedIndex, 0), CEFR_ORDER.length - 1)]
  }
  // Fallback to LanguageLevel with proper mapping
  const level = state?.level
  if (level === 'beginner') return 'A1'
  if (level === 'advanced') return 'C1'
  return 'B1' // intermediate default
}

function getSeedForState(state?: ConversationState): ConversationSeed | null {
  const id = state?.currentUnitId
  if (!id || id === 'free-talk') return null  // No scenario for free talk
  
  // Check if this is a custom scenario (starts with 'custom-')
  if (id.startsWith('custom-')) {
    // For custom scenarios, create a virtual seed using the topic as title
    const customTitle = state?.topic && !state.topic.includes('custom-') ? state.topic : 'Custom conversation'
    return {
      id,
      title: customTitle,
      blurb: 'User-defined conversation scenario',
      cefrRange: ['A2', 'B1'],
      prerequisites: [],
      domains: ['fluency'],
      scenarioBrief: `Have a natural conversation about: ${customTitle}. Adapt to the user's level and interests.`,
      targetGrammar: [],
      targetVocab: [],
      successCue: 'User engages meaningfully with the topic.',
    }
  }
  
  const seed = getSeedById(id)
  return seed || null
}

// ─── Response format ──────────────────────────────────────────────────────────

const RESPONSE_FORMAT = `═══ RESPONSE FORMAT ═══

Return ONLY valid JSON (no markdown, no code fences):
{
  "response": "Your reply IN THE TARGET LANGUAGE. Use markdown (**bold** for key words, * for lists) when teaching.",
  "corrections": [{"original":"wrong","corrected":"right","type":"grammar|vocabulary|pronunciation|naturalness","note":"max 15 words English"}],
  "vocab": [{"term":"new word/phrase","gloss":"English meaning","example":"optional"}],
  "teachingNote": {"type":"correction|expression|grammar|idiom|culture","title":"short title","content":"the teaching point in English or native language for beginners"} | null
}

Field rules:
- "response": ALWAYS in the target language. Use **bold** for vocabulary you want to highlight.
- "corrections": ONLY errors from the current user message. If no errors, return [].
- "vocab": words YOU introduced this turn. If none, return [].
- "teachingNote": A SINGLE teaching card shown below your message. Use it ONLY when you have something genuinely useful to teach — NOT every turn. Types:
  * "correction" — when you corrected an important error (explain WHY briefly)
  * "expression" — when you used a native expression the user should learn
  * "grammar" — when a grammar point needs a brief explanation
  * "idiom" — when you introduced an idiom worth remembering
  * "culture" — when there's a cultural/linguistic nuance to share
  Set to null when there's nothing special to teach this turn. Don't overcorrect or over-teach — only when it genuinely helps.
- Treat each user message as a natural continuation. Resolve pronouns/references from history.
- NEVER repeat the same question pattern. Vary hooks naturally.`

// ─── Block builders ───────────────────────────────────────────────────────────

function buildLanguageBlock(targetLanguage: TargetLanguage | undefined): string {
  const meta = getLanguageMeta(targetLanguage)
  const scriptHint = meta.script === 'non-latin'
    ? `- ${meta.english} uses a non-Latin script. Always write "response" in the native script. Romanization only in "vocab" entries.`
    : `- ${meta.english} uses a Latin-based script. Do not romanize.`
  return `TARGET LANGUAGE: ${meta.english} (endonym: ${meta.native}, BCP-47: ${meta.bcp47}, direction: ${meta.direction}).
${scriptHint}
- Write EVERYTHING in "response" in ${meta.english}. Never default to English.
- If the user types/speaks in another language, gently nudge them back in ${meta.english}. VARY your nudge every time — never repeat the same redirect phrase. Examples: translate what they said and continue, ask a follow-up in ${meta.english}, playfully tease them for switching.
- "translation" MUST be a faithful English translation of "response".`
}

/** Build the level instruction block using Talkingo's 12-level system */
function buildTalkingoLevelBlock(state?: ConversationState): string {
  // Determine the user's Talkingo level
  let level = 5 // default: Conversation Ready
  if (state?.talkingoLevel) {
    level = state.talkingoLevel
  } else if (state?.cefr) {
    level = cefrToTalkingoLevel(state.cefr)
  } else if (state?.level) {
    if (state.level === 'beginner') level = 2
    else if (state.level === 'advanced') level = 9
    else level = 5
  }

  const levelData = getLevelByNumber(level)
  return `${levelData.aiBehavior}

USER'S CURRENT LEVEL: ${level}/12 — "${levelData.name}"
Expected user output: ${levelData.expectedOutput}
Advance when: ${levelData.advanceCriteria}`
}

function buildDomainLevelBlock(state?: ConversationState): string {
  const domains = state?.domainScores
  const overall = getOverallCefr(state)

  // Strict output constraints per level — this controls what the AI PRODUCES
  const outputConstraints: Record<CefrLevel, string> = {
    A1: 'YOUR OUTPUT: Max 1-2 sentences, 5-8 words each. Present tense ONLY. Top 300 most common words. No idioms, no complex grammar. Simple questions (yes/no, "what?", "who?"). Speak as if to a 5-year-old learning their first words.',
    A2: 'YOUR OUTPUT: Max 2-3 short sentences. Past + present tense. Simple connectors (and, but, because). Everyday vocabulary only. One new word per turn max. Questions: "what did you...?", "do you like...?"',
    B1: 'YOUR OUTPUT: 2-4 sentences. All basic tenses + first conditional. Common idioms OK with context. Moderate vocabulary. Can ask "why" and "how" questions.',
    B2: 'YOUR OUTPUT: Natural length. Complex sentences, hedging, abstract topics. Rich vocabulary, collocations. Push for elaboration.',
    C1: 'YOUR OUTPUT: Native-speed prose. Idioms, irony, register shifts. Sophisticated structures. Challenge them.',
    C2: 'YOUR OUTPUT: Fully natural. Treat as peer. Nuance, wordplay, cultural depth.',
  }

  if (!domains) {
    // Fallback to single CEFR
    const guidance: Record<CefrLevel, string> = {
      A1: 'STRICT: Use ONLY top 200 words. No subordinate clauses. Ask yes/no or one-word-answer questions. If a word has a simpler synonym, USE the simpler one.',
      A2: 'Use everyday vocabulary ONLY. No abstract words. Simple direct questions. Introduce max 1 new word per turn.',
      B1: 'Full sentences. Past, present, future, conditional. Introduce idioms occasionally.',
      B2: 'Natural pace. Complex sentences. Hedging, abstract topics.',
      C1: 'Native-speed prose. Idioms, irony, register shifts.',
      C2: 'Fully natural. Treat as a peer.',
    }
    return `LEVEL: CEFR ${overall}
${outputConstraints[overall]}
- ${guidance[overall]}`
  }

  // Per-domain scaffolding — the real adaptive signal
  const domainGuidance: Record<SkillDomain, Record<CefrLevel, string>> = {
    vocabulary: {
      A1: 'Use ONLY the 200 most common words in your response. Introduce max 1 new word per turn — repeat it twice naturally.',
      A2: 'Use everyday vocabulary. Introduce 1–2 new words per turn. No abstract or academic words.',
      B1: 'Use varied vocabulary. Introduce idioms with gloss. 2–3 new words per turn.',
      B2: 'Use rich vocabulary including collocations. Introduce 1–2 advanced words per turn.',
      C1: 'Use sophisticated vocabulary, idioms, and register variation freely.',
      C2: 'Full native vocabulary range.',
    },
    grammar: {
      A1: 'Present tense ONLY in your response. Simple SVO. No relative clauses, no conditionals, no passive.',
      A2: 'Past + present in your response. Simple connectors only (and, but, because).',
      B1: 'Past, present, future, first conditional.',
      B2: 'Full tense range, passive, reported speech.',
      C1: 'Complex grammar including subjunctive, inversion.',
      C2: 'Native grammar range.',
    },
    fluency: {
      A1: 'Keep YOUR turns to 1-2 sentences MAX. Give them time. Ask ONE simple question. Never overwhelm.',
      A2: 'Keep YOUR turns to 2-3 sentences. Use simple connectors to model flow. One question at a time.',
      B1: 'Medium turns (3–4 sentences). Model natural conversation rhythm.',
      B2: 'Natural turn length. Encourage longer responses. Push for elaboration.',
      C1: 'Full natural pace. Challenge them to sustain longer turns.',
      C2: 'Native pace and rhythm.',
    },
    listening: {
      A1: 'Speak very slowly in your response. Use the SIMPLEST possible words. Repeat key words. Never use words they haven\'t seen before without immediate context.',
      A2: 'Speak slowly. Paraphrase if they seem confused. Check comprehension gently. Use familiar vocabulary.',
      B1: 'Normal slow pace. Occasionally use slightly complex structures to stretch them.',
      B2: 'Natural pace. Use idioms and complex structures. Check comprehension rarely.',
      C1: 'Full natural pace including idioms, irony, and register shifts.',
      C2: 'Native pace and complexity.',
    },
  }

  const lines = (Object.entries(domains) as [SkillDomain, CefrLevel][]).map(([domain, cefr]) =>
    `- ${domain.toUpperCase()} (${cefr}): ${domainGuidance[domain][cefr]}`
  )

  // Output constraint based on overall level — this is the most important rule
  const levelOutputRule: Record<CefrLevel, string> = {
    A1: 'YOUR OUTPUT: Max 1-2 sentences, 5-8 words each. Present tense ONLY. Top 300 words. No idioms. Simple SVO. The user must understand 90%+ without translation.',
    A2: 'YOUR OUTPUT: Max 2-3 short sentences. Past + present. Simple connectors. Everyday words only. One new word per turn max.',
    B1: 'YOUR OUTPUT: 2-4 sentences. All basic tenses + conditional. Common idioms OK. Moderate vocabulary.',
    B2: 'YOUR OUTPUT: Natural length. Complex sentences, abstract topics. Rich vocabulary.',
    C1: 'YOUR OUTPUT: Native-speed. Idioms, irony, register shifts.',
    C2: 'YOUR OUTPUT: Fully natural. Peer-level.',
  }

  return `${levelOutputRule[overall]}

PER-DOMAIN CALIBRATION — apply ALL simultaneously:
${lines.join('\n')}

This user is NOT uniformly at one level. Scaffold each dimension independently.`
}

function buildSeedBlock(seed: ConversationSeed | null): string {
  if (!seed) return ''  // Free talk mode - no scenario constraints
  
  const heatBlock = seed.heatMoments && seed.heatMoments.length > 0
    ? `\n\nSCRIPTED HEAT MOMENTS (the secret ingredient — never reveal these to the user):\n${seed.heatMoments.map((h, i) =>
  `  ${i + 1}. After the user has taken ${h.triggerAfterTurn} turn${h.triggerAfterTurn === 1 ? '' : 's'}, naturally introduce this beat: "${h.beat}" — expect a ${h.expectedRegister} response from the user. Do NOT announce the beat. Weave it in like it just happened.`
).join('\n')}`
    : ''

  return `CONVERSATION CONTEXT: "${seed.title}" (CEFR range: ${seed.cefrRange[0]}–${seed.cefrRange[1]})
Topic guidance: ${seed.scenarioBrief}
Natural vocabulary to weave in: ${seed.targetVocab.join(', ')}

Use this as loose context, not a rigid script. Let the conversation flow naturally.${heatBlock}`
}

function buildCorrectionBlock(state?: ConversationState): string {
  const style = state?.correctionStyle ?? 'silent'
  if (style === 'direct') {
    return `CORRECTION DELIVERY: direct.
- For every error found, include it in "corrections" AND address it in "response".
- Recast the correct form, then briefly explain if it's a pattern error.
- Keep the conversation flowing — correct inline, don't lecture.`
  }
  return `CORRECTION DELIVERY: recast (silent).
- Model the correct form naturally in "response" without stopping the conversation.
- Log all errors in "corrections" — the UI shows them separately.
- For repeated/serious errors: you MAY address directly in "response" too.`
}

function buildSRSBlock(state?: ConversationState): string {
  const mastered = state?.masteredWords?.slice(-40) ?? []
  const review = state?.reviewWords ?? []
  const weak = state?.weakPatterns ?? []

  const parts: string[] = []
  if (mastered.length > 0) {
    parts.push(`WORDS THEY ALREADY KNOW (do not re-teach): ${mastered.join(', ')}`)
  }
  if (review.length > 0) {
    parts.push(`WORDS DUE FOR REVIEW (weave these in naturally this session — they've seen them before but need reinforcement): ${review.join(', ')}`)
  }
  if (weak.length > 0) {
    parts.push(`RECURRING WEAKNESSES (gently target these): ${weak.join('; ')}`)
  }
  if (parts.length === 0) return ''
  return `LEARNER MEMORY PROFILE\n${parts.join('\n')}`
}

function buildPlantedPhraseBlock(state?: ConversationState): string {
  const phrase = state?.plantedPhrase
  if (!phrase) return ''
  return `AMBIENT VOCABULARY INJECTION (Feature 2 — comprehensible input)
- Naturally use the phrase "${phrase.term}" (means: ${phrase.gloss}) approximately ${phrase.targetUses} times this conversation.
- Use it in obviously different contexts so the meaning becomes inferable.
- DO NOT define it. DO NOT translate it. DO NOT mark it out as new vocabulary.
- DO NOT include "${phrase.term}" in the "vocab" array — the user is meant to figure it out from context.
- If the user asks what it means, deflect lightly in character and use it again in a clearer context.`
}

function buildCharacterMemoryBlock(state?: ConversationState): string {
  const mem = state?.characterMemory
  if (!mem || !mem.summary) return ''
  const factsLine = mem.factsToReference.length > 0
    ? `Facts you remember about them (use ONE of these naturally, do not list them):\n${mem.factsToReference.map((f) => `- ${f}`).join('\n')}`
    : ''
  const topicsLine = mem.lastTopics.length > 0
    ? `Last time you talked about: ${mem.lastTopics.join(', ')}.`
    : ''
  return `CHARACTER MEMORY — what YOU (the persona) remember about this user from past sessions
${mem.summary}

${factsLine}
${topicsLine}

When opening, you MAY reference one of these naturally ("hey, how did the interview go?"). Never dump all of them. Pick the most relevant one. If nothing fits the moment, just say hello as you normally would.`
}

function buildScaffoldingBlock(state?: ConversationState): string {
  const sessionNum = state?.sessionNumber
  if (!sessionNum) return ''

  let level: string
  let instruction: string
  if (sessionNum <= 10) {
    level = 'early'
    instruction = 'Lead actively. Correct frequently. Provide lots of examples and scaffolding. The user is new — guide them closely.'
  } else if (sessionNum <= 25) {
    level = 'intermediate'
    instruction = 'Guide more than lead. Before correcting, occasionally ask "can you spot the error?" Let the user take more initiative.'
  } else {
    level = 'advanced'
    instruction = 'Let them drive. Only correct significant errors. Ask them to self-assess first: "Did that sound right to you?" Reduce scaffolding.'
  }

  return `TEACHING SCAFFOLDING (session ${sessionNum} — ${level} stage)
${instruction}`
}

function buildLessonPathBlock(state?: ConversationState): string {
  const lesson = state?.lessonPath
  if (!lesson) return ''
  return `═══════════════════════════════════════════════════════════════════════════
ACTIVE LESSON: "${lesson.title}" — Step ${lesson.currentStep} of ${lesson.totalSteps}
═══════════════════════════════════════════════════════════════════════════

Progress so far: ${lesson.summary || 'Just starting.'}

CURRENT STEP GOAL: ${lesson.currentStepGoal}
HOW TO TEACH THIS STEP: ${lesson.currentStepApproach}
HOW TO CHECK UNDERSTANDING: ${lesson.currentStepCheck}

LESSON RULES:
- Follow this step's goal. Do NOT skip ahead.
- If the user asks a question or has a doubt — answer it, then return to the lesson.
- Do NOT advance to the next step until the user demonstrates understanding per the check criteria.
- If user fails the check twice, re-explain differently with simpler examples. After 3 failures, say "This one's tricky. Let's move on and come back to it." and advance.
- If user says "skip" or "next" — advance to next step.
- If user says "go slower" — give more examples before the check.
- If user says "I know this" or "speed up" — do a quick check and advance if they pass.
- When you complete the FINAL step successfully, congratulate them and mark the lesson complete.
- Stay in character throughout. Teach in YOUR persona's style.
═══════════════════════════════════════════════════════════════════════════`
}

function buildPersonaBlock(state?: ConversationState): string {
  if (!state?.persona) return ''
  const persona = getPersonaById(state.persona)
  if (!persona) return ''
  return `\n\n${getPersonaPrompt(persona)}`
}

// ─── Main system instruction ──────────────────────────────────────────────────

export function getSystemInstruction(state?: ConversationState, customMasterPrompt?: string): string {
  const seed = getSeedForState(state)
  const hasLessonPath = !!state?.lessonPath
  
  const blocks = [
    customMasterPrompt || MASTER_PROMPT,
    RESPONSE_FORMAT,
    buildLanguageBlock(state?.targetLanguage),
    // Use Talkingo 12-level system (replaces old CEFR block)
    buildTalkingoLevelBlock(state),
    // Lesson path replaces seed/scenario when active
    hasLessonPath ? buildLessonPathBlock(state) : buildSeedBlock(seed),
    buildCorrectionBlock(state),
    buildSRSBlock(state),
    // Planted phrases disabled during lessons (too much cognitive load)
    hasLessonPath ? '' : buildPlantedPhraseBlock(state),
    buildCharacterMemoryBlock(state),
    // L1 awareness — helps AI explain errors using native language knowledge
    buildL1PromptBlock(state?.nativeLanguage),
  ]
  
  // Add persona if selected
  if (state?.persona) {
    const persona = getPersonaById(state.persona)
    if (persona) {
      blocks.push(getPersonaPrompt(persona))
    }
  }
  
  return blocks.filter(Boolean).join('\n\n')
}

// ─── User-turn prompts ────────────────────────────────────────────────────────

export function buildConversationPrompt(
  userText: string,
  state: ConversationState,
  userName?: string
): string {
  // Keep the per-turn prompt MINIMAL — only truly dynamic signals that change
  // between turns. All stable rules live in the system instruction (which is
  // cached by Gemini's implicit caching, saving tokens).
  //
  // The user's text is sent as a clean message so the model treats it as part
  // of the natural conversation flow, enabling proper pronoun/reference resolution.

  const dynamicParts: string[] = []

  // Adaptive hint only appears when error rate is high (rare, dynamic)
  if ((state as any)._adaptiveHint === 'high-error-rate') {
    dynamicParts.push('[ADAPTIVE: User error rate is high this session — prioritize encouragement and simplification.]')
  }

  // User name reminder (lightweight, helps personalization)
  if (userName) {
    dynamicParts.push(`[User: ${userName}]`)
  }

  // If there are dynamic signals, prepend them as a brief context line
  if (dynamicParts.length > 0) {
    return `${dynamicParts.join(' ')}\n\n${userText}`
  }

  return userText
}

export function buildOpenerPrompt(state: ConversationState, userName?: string): string {
  const seed = getSeedForState(state)
  const lesson = state?.lessonPath
  const scenarioInfo = lesson 
    ? `Active Lesson: ${lesson.title} (Step ${lesson.currentStep}/${lesson.totalSteps})`
    : seed 
      ? `Scenario: ${seed.title}` 
      : 'Mode: Free conversation (no specific topic)'
  const userInfo = userName ? `\n- User name: ${userName}` : ''
  return `Open a fresh session. The user just arrived.

Context:
- Target language: ${getLanguageMeta(state.targetLanguage).english}
- ${scenarioInfo}${userInfo}
- Correction style: ${state.correctionStyle}

Open IN THE TARGET LANGUAGE. If the user selected a specific lesson or topic, acknowledge it naturally and warmly to show you share their intent. Don't pretend you don't know why they are here. Be a person, not a chatbot. End with a question or a hook that leads into the learning goal. Return JSON.`
}

// ─── Assessment (placement) ───────────────────────────────────────────────────

export function buildAssessmentSystemInstruction(targetLanguage: TargetLanguage | undefined): string {
  const meta = getLanguageMeta(targetLanguage)
  return `You are a placement examiner for ${meta.english}.

The user has just had a short conversation. Judge their command of ${meta.english} across FOUR domains independently:
- vocabulary: range and precision of words used
- grammar: accuracy of structures
- fluency: length, complexity, and naturalness of responses
- listening: how well they followed and responded to your prompts

If they answered in English instead of ${meta.english}, treat all domains as A1.

Output ONLY this JSON:
{
  "cefr": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "level": "beginner" | "intermediate" | "advanced",
  "domainScores": {
    "vocabulary": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
    "grammar": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
    "fluency": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
    "listening": "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
  },
  "weakPatterns": ["short tag 1", "short tag 2"],
  "encouragement": "One warm sentence in English praising something specific."
}

Mapping: A1/A2 → beginner. B1/B2 → intermediate. C1/C2 → advanced.
"cefr" should be the average/median of the four domain scores.`
}

export function buildAssessmentPrompt(
  transcript: Array<{ role: 'user' | 'ai'; text: string }>,
  targetLanguage: TargetLanguage | undefined
): string {
  const meta = getLanguageMeta(targetLanguage)
  const transcriptStr = transcript.map((t) => `${t.role === 'user' ? 'USER' : 'AI'}: ${t.text}`).join('\n')
  return `Target language: ${meta.english}.

Conversation transcript:
${transcriptStr}

Assess the USER's language across all four domains. Return JSON per instructions.`
}

// ─── Onboarding conversation ──────────────────────────────────────────────────

export function buildOnboardingSystemInstruction(targetLanguage: TargetLanguage | undefined): string {
  const meta = getLanguageMeta(targetLanguage)
  return `You are a friendly native speaker of ${meta.english} having a casual first conversation with someone who wants to learn your language.

CRITICAL RULES:
1. Speak ONLY in ${meta.english}. Never switch to English.
2. Do NOT simplify your language to match theirs. Speak at a natural B1 pace throughout.
3. The gap between what you say and what they can follow IS the assessment signal.
4. Have a genuine, warm conversation — ask about their life, interests, plans.
5. Keep your turns short (2–3 sentences max) so they have room to respond.
6. After exactly 5 turns, end naturally ("It was great chatting! I'll see you soon.").
7. Do NOT announce that this is a test or assessment.

This is a natural conversation, not a lesson. The user's responses will be analysed afterwards to place them at the right level.

Return ONLY plain text (no JSON). Just speak naturally.`
}

export function buildOnboardingOpenerPrompt(
  targetLanguage: TargetLanguage | undefined,
  learningGoal: string | undefined
): string {
  const meta = getLanguageMeta(targetLanguage)
  const goalHint = learningGoal
    ? `The user mentioned they want to learn ${meta.english} for: ${learningGoal}. Use this to make the conversation relevant.`
    : ''
  return `Start the conversation. Greet them warmly and ask one simple question about their life or interests. Speak in ${meta.english}. Keep it to 2 sentences. ${goalHint}`
}

// ─── Session recap ────────────────────────────────────────────────────────────

export function buildRecapSystemInstruction(): string {
  return `You write end-of-session recaps for a language-learning app. You see the full transcript, the scenario, and the corrections logged. Write the recap IN ENGLISH. Be specific and concrete — never generic praise.

Output ONLY this JSON:
{
  "vocabSeen": [{"term":"...", "gloss":"...", "romanization":"... (only non-Latin)", "example":"..."}],
  "topCorrections": [{"original":"...", "corrected":"...", "type":"grammar|vocabulary|pronunciation|naturalness", "note":"..."}],
  "grammarTried": ["pattern 1", "pattern 2"],
  "encouragement": "2–3 sentences. Mention something they did WELL by name.",
  "unitComplete": true | false,
  "nextFocus": "One short sentence about what to focus on next session.",
  "nativeWouldSay": [
    {
      "userPhrase": "what the user actually said (target language)",
      "nativeAlternative": "what a native would say instead (target language)",
      "why": "one short sentence why the user's version sounds textbook-stiff or unnatural",
      "register": "casual" | "natural" | "formal" | "expressive"
    }
  ],
  "plantedPhraseRecap": null | {
    "term": "the phrase that was planted ambiently",
    "gloss": "english meaning",
    "timesUsed": 3
  },
  "domainDeltas": {
    "vocabulary": -1 | 0 | 1,
    "grammar": -1 | 0 | 1,
    "fluency": -1 | 0 | 1,
    "listening": -1 | 0 | 1
  }
}

CRITICAL — the "nativeWouldSay" field is the highest-value feedback we can give:
- Look for phrases the user said that are GRAMMATICALLY CORRECT but unnatural / textbook-stiff / pragmatically wrong / over-formal / over-direct.
- Examples: "I am very hungry" → "I'm starving"; "I will go to sleep now" → "I'm gonna crash"; over-use of full forms instead of contractions; literal translations; word choices that read like a dictionary not a person.
- Surface 2–4 of these per session. NEVER fewer than 1 unless the user truly spoke like a native.
- Skip beginners (A1) — their priority is correctness, not naturalness. For A1/A2 users, return [].
- For each, give a concrete native alternative and a one-sentence "why".

"plantedPhraseRecap": if the system instruction told you to plant a phrase this session, report the phrase + gloss + how many times you actually used it. Otherwise return null.

"domainDeltas": +1 = performed above their current domain level, 0 = as expected, -1 = struggled.`
}

export function buildRecapPrompt(args: {
  targetLanguage?: TargetLanguage
  unitId?: string
  unitTitle: string
  domainScores?: Record<string, string>
  transcript: Array<{ role: 'user' | 'ai'; text: string }>
  corrections: Array<{ original: string; corrected: string; type: string; note?: string }>
  vocabIntroduced: Array<{ term: string; gloss: string }>
  durationSeconds: number
  plantedPhrase?: { term: string; gloss: string; targetUses: number } | null
  cefr?: string
}): string {
  const meta = getLanguageMeta(args.targetLanguage)
  const transcriptStr = args.transcript.map((t) => `${t.role === 'user' ? 'USER' : 'AI'}: ${t.text}`).join('\n')
  const domainStr = args.domainScores ? JSON.stringify(args.domainScores) : 'not available'
  const plantedStr = args.plantedPhrase
    ? `PLANTED PHRASE THIS SESSION: "${args.plantedPhrase.term}" (gloss: ${args.plantedPhrase.gloss}, target uses: ${args.plantedPhrase.targetUses}). Count actual uses in the AI turns and report in plantedPhraseRecap.`
    : 'No phrase was planted this session — set plantedPhraseRecap to null.'
  return `Target language: ${meta.english}
Scenario: ${args.unitTitle}
User CEFR: ${args.cefr ?? 'unknown'}
Domain scores going in: ${domainStr}
Duration: ${Math.round(args.durationSeconds / 60)} min

${plantedStr}

Transcript:
${transcriptStr}

Corrections logged:
${JSON.stringify(args.corrections, null, 2)}

Vocab introduced:
${JSON.stringify(args.vocabIntroduced, null, 2)}

Return JSON per instructions. Remember: nativeWouldSay is the highest-value field — surface real "textbook-stiff" phrases unless the user is A1/A2.`
}

// ─── Register alternatives ("Say it like a native") ──────────────────────────

export function buildRegisterAlternativesSystemInstruction(
  targetLanguage: TargetLanguage | undefined
): string {
  const meta = getLanguageMeta(targetLanguage)
  return `You are a ${meta.english} native speaker. The user just said something in ${meta.english} and wants to know how a native would phrase the same idea across three different registers.

Output ONLY this JSON:
{
  "casual": "How you'd say it to a close friend (slang, contractions, fragments OK)",
  "natural": "How you'd say it to someone you don't know well (everyday adult speech)",
  "expressive": "How you'd say it to be funny, dramatic, or emphatic (idioms, exaggeration)"
}

Rules:
- All three rewrites must convey the SAME core meaning.
- Each must sound like a real ${meta.english} native, not a textbook.
- Vary actual word choice — don't just swap one word per version.
- Keep each under 20 words.
- Write in ${meta.english} only. No English glosses.`
}

export function buildRegisterAlternativesPrompt(
  userPhrase: string,
  targetLanguage: TargetLanguage | undefined,
  conversationContext?: string
): string {
  const meta = getLanguageMeta(targetLanguage)
  const ctx = conversationContext
    ? `\nConversation context (the AI's previous turn): "${conversationContext}"\n`
    : ''
  return `User said in ${meta.english}: "${userPhrase}"${ctx}
Give three native rewrites in ${meta.english}. Return JSON per instructions.`
}

// ─── Character memory update (rolling summary) ───────────────────────────────

export function buildMemoryUpdateSystemInstruction(personaName: string): string {
  return `You are ${personaName}, updating your mental notes about a friend you've been chatting with for language practice.

You will be given:
- Your previous summary (or empty if first session)
- The list of facts you already know
- The full transcript of your latest conversation

Your job: produce an updated rolling summary as if YOU (${personaName}) were keeping a journal about this person, in YOUR voice.

Output ONLY this JSON:
{
  "summary": "A 100-200 word rolling summary. MERGE new information into the existing narrative. Do not just append; rewrite the story to include today's events.",
  "newFacts": ["concrete new fact 1", "concrete new fact 2"],
  "lastTopics": ["topic 1", "topic 2", "topic 3"]
}

Rules:
- CONSOLIDATION: If a fact is already in the summary, do not add it again to 'newFacts'.
- FACT LIMIT: Keep 'newFacts' to a maximum of 3 high-value items per session.
- OVERWRITE LOGIC: The 'summary' should replace the old one entirely. It must remain between 100-200 words.
- Only add facts that were actually said in the transcript.
- Keep facts short and specific: "has a cat named Miso", NOT "likes animals".
- "lastTopics" = 2-4 topics actually discussed this session, used to open the next one.
- Write in English regardless of target language.`
}

export function buildMemoryUpdatePrompt(args: {
  personaName: string
  previousSummary: string
  knownFacts: string[]
  transcript: Array<{ role: 'user' | 'ai'; text: string }>
}): string {
  const transcriptStr = args.transcript.map((t) => `${t.role === 'user' ? 'USER' : args.personaName.toUpperCase()}: ${t.text}`).join('\n')
  const factsStr = args.knownFacts.length > 0
    ? args.knownFacts.map((f) => `- ${f}`).join('\n')
    : '(none yet)'
  return `Previous summary:
${args.previousSummary || '(none yet — this is the first session)'}

Facts you already know:
${factsStr}

Latest conversation transcript:
${transcriptStr}

Update your notes. Return JSON per instructions.`
}

// ─── Fallback openers ─────────────────────────────────────────────────────────

export const FALLBACK_OPENERS: Record<string, string> = {
  food: "Tell me — what did you have to eat today?",
  travel: "Have you ever been somewhere that completely surprised you?",
  music: "What's a song that's stuck in your head right now?",
  sports: "Did you catch any good matches lately?",
  work: "What kind of week have you been having?",
  general: "Hey! What's been keeping you busy lately?",
}
