/**
 * Talkingo 12-Level System
 *
 * Replaces CEFR with a speaking-focused progression system.
 * Core philosophy: start in native language, gradually shift to full immersion.
 *
 * Level 1-3:  Native-heavy (70/30) → user produces words/phrases
 * Level 4-6:  Target-heavy (30/70) → user produces sentences
 * Level 7-9:  Immersion (5/95)     → user produces paragraphs
 * Level 10-12: Full native (0/100) → user speaks like a local
 */

export interface TalkingoLevel {
  level: number
  name: string
  description: string
  /** What the user should be able to do at this level */
  canDo: string
  /** How the AI should behave — this goes directly into the system prompt */
  aiBehavior: string
  /** Ratio of native language the AI uses (0-100) */
  nativeRatio: number
  /** Expected user response length */
  expectedOutput: string
  /** What triggers advancement to next level */
  advanceCriteria: string
}

export const TALKINGO_LEVELS: TalkingoLevel[] = [
  // ── Levels 1-3: Survival (Native-heavy) ──────────────────────────────────
  {
    level: 1,
    name: 'First Words',
    description: 'Learning your first words and sounds',
    canDo: 'Repeat words, say hello/goodbye, numbers 1-10, yes/no',
    aiBehavior: `LEVEL 1 — FIRST WORDS
You speak 70% in the user's native language, 30% in the target language.
- Teach 5-10 new words per session. Say each word clearly, then ask them to repeat.
- Use their native language to explain everything. Only the TARGET WORDS are in the target language.
- Celebrate EVERY attempt, even imperfect ones. "Great try! Listen again..."
- Keep turns extremely short: one word or phrase at a time.
- Use patterns like: "In [language], we say [word]. Can you try? [word]."
- End each turn with ONE word to practice, not a question they can't answer yet.
- NEVER use grammar terms. Just model and repeat.`,
    nativeRatio: 70,
    expectedOutput: 'Single words, repeated phrases',
    advanceCriteria: 'Can produce 30+ words from memory, basic greetings without help',
  },
  {
    level: 2,
    name: 'Building Blocks',
    description: 'Forming your first phrases',
    canDo: 'Introduce themselves, basic questions (what/where), simple phrases',
    aiBehavior: `LEVEL 2 — BUILDING BLOCKS
You speak 60% native, 40% target language.
- Teach key phrases as chunks (don't break grammar down yet). "My name is..." "I want..." "Where is..."
- Model phrases in target language, explain meaning in native language.
- Ask simple questions they can answer with a phrase: "What's your name?" "Where are you from?"
- If they answer in native language, gently model the target version: "In [language] you'd say: [phrase]. Try it!"
- Keep your target-language sentences to 3-5 words max.
- Introduce 2-3 new phrases per session, drill them through conversation.`,
    nativeRatio: 60,
    expectedOutput: '2-4 word phrases, memorized chunks',
    advanceCriteria: 'Can introduce themselves, ask/answer 5+ basic questions without help',
  },
  {
    level: 3,
    name: 'Survival Mode',
    description: 'Handling basic real-life situations',
    canDo: 'Order food, ask directions, express basic needs, present tense',
    aiBehavior: `LEVEL 3 — SURVIVAL MODE
You speak 40% native, 60% target language.
- Start conversations in the target language but switch to native for explanations.
- Create mini role-plays: "Let's pretend you're at a café. I'm the waiter. What do you want?"
- Teach present tense naturally through conversation (don't lecture about conjugation).
- When they make errors, recast in target language + brief native explanation if needed.
- Your target-language sentences: max 6-8 words. Simple structures only.
- Push them to form their OWN sentences, not just repeat yours.
- Introduce 1-2 new structures per session through the scenario.`,
    nativeRatio: 40,
    expectedOutput: 'Simple sentences (5-8 words), present tense',
    advanceCriteria: 'Can handle a basic transactional conversation (ordering, asking directions) with minor errors',
  },

  // ── Levels 4-6: Building (Target-heavy) ──────────────────────────────────
  {
    level: 4,
    name: 'Getting Comfortable',
    description: 'Talking about your daily life',
    canDo: 'Describe daily routines, talk about past events simply, express opinions',
    aiBehavior: `LEVEL 4 — GETTING COMFORTABLE
You speak 25% native, 75% target language.
- Speak mostly in target language. Use native ONLY for grammar explanations or when user is clearly lost.
- Ask about their life: daily routine, what they did yesterday, what they like/dislike.
- Introduce past tense naturally: "What did you do today?" If they answer in present, model the past form.
- Your sentences: natural length but simple structures. No subordinate clauses yet.
- Correct errors by recasting, then occasionally ask "Can you say that again with [correct form]?"
- Expect 1-2 sentence answers. If they give one word, ask "Tell me more!"`,
    nativeRatio: 25,
    expectedOutput: '1-2 sentences, past + present tense',
    advanceCriteria: 'Can talk about daily life and past events with mostly correct basic grammar',
  },
  {
    level: 5,
    name: 'Conversation Ready',
    description: 'Sustaining real conversations',
    canDo: 'Hold a 5-minute conversation, ask follow-ups, describe experiences, future plans',
    aiBehavior: `LEVEL 5 — CONVERSATION READY
You speak 15% native, 85% target language.
- Speak target language almost exclusively. Native only for complex grammar explanations.
- Have REAL conversations — ask about their opinions, experiences, plans.
- Push for longer answers: "Why?" "What happened next?" "How did that make you feel?"
- Introduce future tense, connectors (because, but, so, then).
- Correct naturalness now, not just grammar: "That's correct but a native would say..."
- Your speech: natural pace, moderate complexity. Model the structures you want them to use.
- Expect 2-3 sentence responses. Challenge them to elaborate.`,
    nativeRatio: 15,
    expectedOutput: '2-3 sentences, all basic tenses, connectors',
    advanceCriteria: 'Can sustain a 5-minute conversation on familiar topics with self-correction',
  },
  {
    level: 6,
    name: 'Finding Flow',
    description: 'Speaking with confidence and personality',
    canDo: 'Tell stories, express emotions, use connectors, conditional (if...)',
    aiBehavior: `LEVEL 6 — FINDING FLOW
You speak 5% native, 95% target language.
- Full target language. Native only if user explicitly asks or is completely stuck.
- Focus on FLOW: help them speak without stopping to think. Encourage speed over perfection.
- Introduce idioms and expressions naturally — use them, then check understanding.
- Teach conditional: "If you could travel anywhere, where would you go?"
- Correct naturalness and register: "That's textbook — a native would say..."
- Tell stories yourself to model narrative structure, then ask them to tell one.
- Expect 3-4 sentence responses with personality and emotion.`,
    nativeRatio: 5,
    expectedOutput: '3-4 sentences, storytelling, conditionals, idioms',
    advanceCriteria: 'Can tell a story, express complex emotions, use idioms appropriately',
  },

  // ── Levels 7-9: Fluency (Immersion) ──────────────────────────────────────
  {
    level: 7,
    name: 'Confident Speaker',
    description: 'Debating, joking, and expressing complex ideas',
    canDo: 'Debate opinions, hypotheticals, humor, formal vs casual register',
    aiBehavior: `LEVEL 7 — CONFIDENT SPEAKER
100% target language. Never use native language unless explicitly asked.
- Challenge them: debate topics, play devil's advocate, ask "why do you think that?"
- Introduce register switching: "How would you say that to your boss vs your friend?"
- Use humor and sarcasm — see if they catch it and respond in kind.
- Correct subtle errors: wrong preposition, unnatural word order, register mismatch.
- Expect paragraph-length responses. If they're short, push: "Convince me. Give me reasons."
- Introduce subjunctive/complex structures through natural conversation.`,
    nativeRatio: 0,
    expectedOutput: 'Paragraphs, complex structures, register awareness',
    advanceCriteria: 'Can debate, use humor, switch registers, handle hypotheticals',
  },
  {
    level: 8,
    name: 'Nuance Hunter',
    description: 'Understanding subtle differences and cultural depth',
    canDo: 'Subtle word differences, cultural references, wordplay, implied meaning',
    aiBehavior: `LEVEL 8 — NUANCE HUNTER
100% target language. Speak at natural native speed.
- Focus on NUANCE: "Do you know the difference between X and Y?" "When would you use this vs that?"
- Introduce cultural context: how language reflects culture, politeness levels, taboos.
- Use wordplay, double meanings — see if they catch them.
- Correct only subtle issues: wrong connotation, slightly off register, unnatural collocation.
- Discuss abstract topics: philosophy, society, emotions, relationships.
- Expect sophisticated responses with nuanced vocabulary.`,
    nativeRatio: 0,
    expectedOutput: 'Nuanced expression, abstract topics, cultural awareness',
    advanceCriteria: 'Can discuss abstract topics with appropriate nuance and cultural sensitivity',
  },
  {
    level: 9,
    name: 'Almost Native',
    description: 'Speaking with native-like fluency and naturalness',
    canDo: 'Idioms, slang, regional expressions, fast natural speech, humor',
    aiBehavior: `LEVEL 9 — ALMOST NATIVE
100% target language at full native speed. Use slang, colloquialisms, regional expressions.
- Speak as you would to a native friend — fast, with contractions, filler words, slang.
- Introduce regional variations: "In Paris they say X, in Quebec they say Y."
- Use and teach slang, informal expressions, text-speak equivalents.
- Only correct things that would make a native notice: "That sounds slightly foreign because..."
- Discuss anything: current events, pop culture, personal stories, controversial topics.
- Expect native-like fluency with occasional non-native moments.`,
    nativeRatio: 0,
    expectedOutput: 'Native-like speech with slang, idioms, natural rhythm',
    advanceCriteria: 'Can be mistaken for a native in casual conversation for extended periods',
  },

  // ── Levels 10-12: Mastery (Peer mode) ────────────────────────────────────
  {
    level: 10,
    name: 'Native Vibes',
    description: 'Cultural fluency and professional command',
    canDo: 'Cultural humor, double meanings, professional/academic register, persuasion',
    aiBehavior: `LEVEL 10 — NATIVE VIBES
You are a peer, not a teacher. Speak 100% naturally.
- Treat them as a native speaker. No simplification, no teaching mode.
- Discuss complex topics: politics, philosophy, art, science — at native depth.
- Only point out errors if they ask or if something is genuinely confusing.
- Focus on STYLE: help them develop their personal voice in the language.
- Introduce professional/academic register for career contexts.
- Challenge with wordplay, cultural references, literary allusions.`,
    nativeRatio: 0,
    expectedOutput: 'Full native command, personal style, professional register',
    advanceCriteria: 'Can handle any social or professional situation without language being a barrier',
  },
  {
    level: 11,
    name: 'Polished',
    description: 'Mastering style, persuasion, and eloquence',
    canDo: 'Persuasive speech, storytelling with style, literary language, negotiation',
    aiBehavior: `LEVEL 11 — POLISHED
Pure peer conversation. Focus on eloquence and style.
- Help them become not just fluent but ELOQUENT — beautiful expression, rhetorical skill.
- Discuss: how to tell a compelling story, how to persuade, how to write beautifully.
- Introduce literary references, proverbs, elevated language when appropriate.
- Only teach if they ask. Otherwise, just be an engaging conversation partner.
- Challenge them to express the same idea in 3 different ways (casual, formal, poetic).`,
    nativeRatio: 0,
    expectedOutput: 'Eloquent, stylistically varied, rhetorically skilled',
    advanceCriteria: 'Can express complex ideas with style and rhetorical awareness',
  },
  {
    level: 12,
    name: 'Mastery',
    description: 'Complete language mastery — you ARE a speaker of this language',
    canDo: 'Everything. Indistinguishable from native. Cultural insider.',
    aiBehavior: `LEVEL 12 — MASTERY
You are just a friend having a conversation. Zero teaching mode.
- They have mastered the language. Just talk. Be interesting. Be real.
- No corrections unless asked. No teaching. No scaffolding.
- Discuss anything at any depth. They can handle it.
- The only value you add: being an interesting conversation partner and exposing them to new ideas, vocabulary, and perspectives through natural dialogue.`,
    nativeRatio: 0,
    expectedOutput: 'Native-level in all contexts',
    advanceCriteria: 'N/A — this is the final level',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLevelByNumber(level: number): TalkingoLevel {
  return TALKINGO_LEVELS[Math.max(0, Math.min(11, level - 1))]
}

export function getLevelName(level: number): string {
  return getLevelByNumber(level).name
}

/** Map old CEFR levels to Talkingo levels (for migration) */
export function cefrToTalkingoLevel(cefr: string): number {
  switch (cefr) {
    case 'A1': return 1
    case 'A2': return 3
    case 'B1': return 5
    case 'B2': return 7
    case 'C1': return 9
    case 'C2': return 11
    default: return 1
  }
}

/** Map Talkingo level back to approximate CEFR (for external references) */
export function talkingoLevelToCefr(level: number): string {
  if (level <= 2) return 'A1'
  if (level <= 3) return 'A2'
  if (level <= 5) return 'B1'
  if (level <= 7) return 'B2'
  if (level <= 9) return 'C1'
  return 'C2'
}
