/**
 * Talkingo 12-Level System
 *
 * Speaking-focused progression. Each level maps to one of 5 AI behavior tiers.
 * The AI behavior is kept to 2-3 sentences — just the language ratio and what
 * "speaking skill" means at this stage. No teaching manuals, no rules lists.
 *
 * Tier 1 (L1-2):  Full native, target words woven in → courage to try
 * Tier 2 (L3-4):  Mixed languages, lean target → forming own sentences
 * Tier 3 (L5-6):  Mostly target, native only when stuck → flow and speed
 * Tier 4 (L7-9):  Full target, natural speed → nuance and register
 * Tier 5 (L10-12): Just a friend, no teaching → peer conversation
 */

export interface TalkingoLevel {
  level: number
  name: string
  description: string
  /** What the user should be able to do at this level */
  canDo: string
  /** How the AI should behave — short, clear, no contradictions */
  aiBehavior: string
  /** Ratio of native language the AI uses (0-100) */
  nativeRatio: number
  /** Expected user response length */
  expectedOutput: string
}

export const TALKINGO_LEVELS: TalkingoLevel[] = [
  // ── Tier 1: Full native, build courage (L1-2) ────────────────────────────
  {
    level: 1,
    name: 'First Words',
    description: 'Learning your first words and sounds',
    canDo: 'Repeat words, say hello/goodbye, numbers 1-10, yes/no',
    aiBehavior: `Speak entirely in the user's native language. Introduce target language words and phrases naturally inside your sentences — the way you'd explain a foreign word to a friend who's never heard it. When you use a target language word, always say what it means right after in the native language. Keep your turns short. Never ask them to repeat anything — just keep using the target phrases naturally so they hear them again and again. Remember: native language is your medium, not your purpose. Every turn should teach or reinforce something in the target language — never just chat in native with nothing new.`,
    nativeRatio: 95,
    expectedOutput: 'Single words, short attempts',
  },
  {
    level: 2,
    name: 'Building Blocks',
    description: 'Forming your first phrases',
    canDo: 'Introduce themselves, basic questions (what/where), simple phrases',
    aiBehavior: `Speak mostly in the user's native language. Weave in target language phrases as ready-to-use chunks — greetings, "my name is...", "I want...". When you use a target phrase, say what it means right after so the user always knows. When they try, acknowledge it warmly and continue the conversation. If they speak in their native language, that's fine — respond naturally and model the target version within your reply. Your job is to get target language words into their mouth — native is how you help them get there, not where you stay.`,
    nativeRatio: 80,
    expectedOutput: '2-4 word phrases, memorized chunks',
  },

  // ── Tier 2: Mixed languages, own sentences (L3-4) ────────────────────────
  {
    level: 3,
    name: 'Survival Mode',
    description: 'Handling basic real-life situations',
    canDo: 'Order food, ask directions, express basic needs, present tense',
    aiBehavior: `Mix both languages — lean toward the target language for simple things, switch to native when explaining or when they seem lost. Speaking skill here means forming their own short sentences, not just repeating yours. Ask simple questions they need to construct answers for. When they make mistakes, say what they meant in correct form as part of your natural reply.`,
    nativeRatio: 40,
    expectedOutput: 'Simple sentences (5-8 words), present tense',
  },
  {
    level: 4,
    name: 'Getting Comfortable',
    description: 'Talking about your daily life',
    canDo: 'Describe daily routines, talk about past events simply, express opinions',
    aiBehavior: `Speak mostly in the target language. Use native only when explaining something genuinely confusing. Speaking skill here means producing 1-2 sentence answers about their own life. Ask about their day, their opinions, what happened yesterday. If they give one-word answers, be genuinely curious — ask follow-ups that make them want to say more.`,
    nativeRatio: 25,
    expectedOutput: '1-2 sentences, past + present tense',
  },

  // ── Tier 3: Target language, flow and speed (L5-6) ────────────────────────
  {
    level: 5,
    name: 'Conversation Ready',
    description: 'Sustaining real conversations',
    canDo: 'Hold a 5-minute conversation, ask follow-ups, describe experiences, future plans',
    aiBehavior: `Speak in the target language. Only switch to native if they're genuinely stuck and ask for help. Speaking skill here means flow — keeping a conversation going without long pauses to think. Ask questions that require more than yes/no. Be curious about their stories. Keep the conversation moving so they don't overthink.`,
    nativeRatio: 10,
    expectedOutput: '2-3 sentences, all basic tenses, connectors',
  },
  {
    level: 6,
    name: 'Finding Flow',
    description: 'Speaking with confidence and personality',
    canDo: 'Tell stories, express emotions, use connectors, conditional (if...)',
    aiBehavior: `Speak fully in the target language. Speaking skill here means expressing personality — telling stories, showing emotion, having opinions. Use idioms and expressions naturally. If they sound too "textbook," model more natural alternatives in your reply. Push for why, how, and what-if questions that make them think and express complex ideas.`,
    nativeRatio: 5,
    expectedOutput: '3-4 sentences, storytelling, conditionals, idioms',
  },

  // ── Tier 4: Full target, nuance and register (L7-9) ──────────────────────
  {
    level: 7,
    name: 'Confident Speaker',
    description: 'Debating, joking, and expressing complex ideas',
    canDo: 'Debate opinions, hypotheticals, humor, formal vs casual register',
    aiBehavior: `Full target language at natural pace. Speaking skill here means nuance — choosing the right word, adjusting register, using humor. Challenge their ideas. Play devil's advocate. Use sarcasm and see if they catch it. If their expression is correct but unnatural, model a better version in your reply.`,
    nativeRatio: 0,
    expectedOutput: 'Paragraphs, complex structures, register awareness',
  },
  {
    level: 8,
    name: 'Nuance Hunter',
    description: 'Understanding subtle differences and cultural depth',
    canDo: 'Subtle word differences, cultural references, wordplay, implied meaning',
    aiBehavior: `Full target language at native speed. Speaking skill here means precision and cultural awareness — knowing when to use one word over a synonym, catching implied meaning, understanding cultural context. Discuss abstract topics. Use wordplay. Only point out things that would genuinely make a native speaker pause.`,
    nativeRatio: 0,
    expectedOutput: 'Nuanced expression, abstract topics, cultural awareness',
  },
  {
    level: 9,
    name: 'Almost Native',
    description: 'Speaking with native-like fluency and naturalness',
    canDo: 'Idioms, slang, regional expressions, fast natural speech, humor',
    aiBehavior: `Speak as you would to a native friend — fast, with slang, filler words, contractions, regional expressions. Speaking skill here means sounding natural, not just correct. Only mention something if it would genuinely make a native do a double-take.`,
    nativeRatio: 0,
    expectedOutput: 'Native-like speech with slang, idioms, natural rhythm',
  },

  // ── Tier 5: Peer, no teaching (L10-12) ───────────────────────────────────
  {
    level: 10,
    name: 'Native Vibes',
    description: 'Cultural fluency and professional command',
    canDo: 'Cultural humor, double meanings, professional/academic register, persuasion',
    aiBehavior: `You're a peer, not a teacher. Just have a conversation. Speak naturally at full depth — politics, philosophy, art, anything. No simplification. No corrections unless they ask. Help them develop their personal style and voice in the language.`,
    nativeRatio: 0,
    expectedOutput: 'Full native command, personal style, professional register',
  },
  {
    level: 11,
    name: 'Polished',
    description: 'Mastering style, persuasion, and eloquence',
    canDo: 'Persuasive speech, storytelling with style, literary language, negotiation',
    aiBehavior: `Pure peer conversation. Focus on eloquence and style — help them become not just fluent but beautiful in their expression. Discuss rhetoric, storytelling, how to persuade. No teaching unless asked.`,
    nativeRatio: 0,
    expectedOutput: 'Eloquent, stylistically varied, rhetorically skilled',
  },
  {
    level: 12,
    name: 'Mastery',
    description: 'Complete language mastery — you ARE a speaker of this language',
    canDo: 'Everything. Indistinguishable from native. Cultural insider.',
    aiBehavior: `You're just a friend having a conversation. Zero teaching. Just be interesting, be real, and talk about whatever comes up.`,
    nativeRatio: 0,
    expectedOutput: 'Native-level in all contexts',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLevelByNumber(level: number): TalkingoLevel {
  return TALKINGO_LEVELS[Math.max(0, Math.min(11, level - 1))]
}

export function getLevelName(level: number): string {
  return getLevelByNumber(level).name
}
