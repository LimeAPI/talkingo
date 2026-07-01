/**
 * Grammar tag system — controlled vocabulary for seed grammar metadata.
 *
 * Each grammar tag has:
 * - label: Human-readable name shown in the filter UI
 * - group: Grammatical category for grouping in the filter
 * - levelRange: Levels where this grammar naturally appears
 */

export interface GrammarTagInfo {
  label: string
  group: string
  levelRange: [number, number]
}

export const GRAMMAR_TAGS: Record<string, GrammarTagInfo> = {
  // ── Present ──────────────────────────────────────────────────────────────
  'present-simple-to-be': {
    label: 'Present Simple (to be)',
    group: 'Tenses: Present',
    levelRange: [1, 3],
  },
  'present-simple': {
    label: 'Present Simple',
    group: 'Tenses: Present',
    levelRange: [1, 5],
  },
  'present-continuous': {
    label: 'Present Continuous',
    group: 'Tenses: Present',
    levelRange: [2, 6],
  },

  // ── Past ─────────────────────────────────────────────────────────────────
  'past-simple': {
    label: 'Past Simple',
    group: 'Tenses: Past',
    levelRange: [2, 7],
  },
  'past-continuous': {
    label: 'Past Continuous',
    group: 'Tenses: Past',
    levelRange: [3, 7],
  },
  'past-perfect': {
    label: 'Past Perfect',
    group: 'Tenses: Past',
    levelRange: [5, 9],
  },
  'used-to': {
    label: 'Used To',
    group: 'Tenses: Past',
    levelRange: [4, 7],
  },

  // ── Future ───────────────────────────────────────────────────────────────
  'future-going-to': {
    label: 'Future (going to)',
    group: 'Tenses: Future',
    levelRange: [3, 6],
  },
  'future-will': {
    label: 'Future (will)',
    group: 'Tenses: Future',
    levelRange: [3, 6],
  },
  'future-perfect': {
    label: 'Future Perfect',
    group: 'Tenses: Future',
    levelRange: [7, 10],
  },

  // ── Perfect ──────────────────────────────────────────────────────────────
  'present-perfect': {
    label: 'Present Perfect',
    group: 'Tenses: Perfect',
    levelRange: [4, 8],
  },
  'present-perfect-continuous': {
    label: 'Present Perfect Continuous',
    group: 'Tenses: Perfect',
    levelRange: [6, 10],
  },

  // ── Conditionals ─────────────────────────────────────────────────────────
  'conditional-zero': {
    label: 'Zero Conditional',
    group: 'Conditionals',
    levelRange: [4, 7],
  },
  'conditional-first': {
    label: 'First Conditional',
    group: 'Conditionals',
    levelRange: [5, 8],
  },
  'conditional-second': {
    label: 'Second Conditional',
    group: 'Conditionals',
    levelRange: [6, 10],
  },
  'conditional-third': {
    label: 'Third Conditional',
    group: 'Conditionals',
    levelRange: [7, 11],
  },
  'conditional-mixed': {
    label: 'Mixed Conditionals',
    group: 'Conditionals',
    levelRange: [8, 12],
  },

  // ── Modals ───────────────────────────────────────────────────────────────
  'modals-can': {
    label: 'Can / Can\'t',
    group: 'Modals',
    levelRange: [1, 4],
  },
  'modals-must': {
    label: 'Must / Have to',
    group: 'Modals',
    levelRange: [2, 5],
  },
  'modals-should': {
    label: 'Should / Ought to',
    group: 'Modals',
    levelRange: [3, 7],
  },
  'modals-could': {
    label: 'Could / Would',
    group: 'Modals',
    levelRange: [3, 7],
  },
  'modals-might': {
    label: 'Might / May',
    group: 'Modals',
    levelRange: [4, 8],
  },
  'modals-hedging': {
    label: 'Hedging Modals',
    group: 'Modals',
    levelRange: [7, 12],
  },

  // ── Questions ────────────────────────────────────────────────────────────
  'questions-yesno': {
    label: 'Yes/No Questions',
    group: 'Questions',
    levelRange: [1, 3],
  },
  'questions-wh': {
    label: 'Wh- Questions',
    group: 'Questions',
    levelRange: [1, 4],
  },
  'questions-indirect': {
    label: 'Indirect Questions',
    group: 'Questions',
    levelRange: [5, 9],
  },
  'question-tags': {
    label: 'Question Tags',
    group: 'Questions',
    levelRange: [5, 9],
  },

  // ── Nouns & Determiners ──────────────────────────────────────────────────
  'plurals': {
    label: 'Plurals',
    group: 'Nouns & Determiners',
    levelRange: [1, 3],
  },
  'articles': {
    label: 'Articles (a/an/the)',
    group: 'Nouns & Determiners',
    levelRange: [1, 4],
  },
  'possessives': {
    label: 'Possessives',
    group: 'Nouns & Determiners',
    levelRange: [1, 4],
  },
  'quantifiers': {
    label: 'Quantifiers (some/any/much/many)',
    group: 'Nouns & Determiners',
    levelRange: [2, 5],
  },

  // ── Pronouns ─────────────────────────────────────────────────────────────
  'subject-pronouns': {
    label: 'Subject Pronouns',
    group: 'Pronouns',
    levelRange: [1, 3],
  },
  'object-pronouns': {
    label: 'Object Pronouns',
    group: 'Pronouns',
    levelRange: [2, 4],
  },
  'relative-pronouns': {
    label: 'Relative Pronouns',
    group: 'Pronouns',
    levelRange: [5, 9],
  },
  'reflexive-pronouns': {
    label: 'Reflexive Pronouns',
    group: 'Pronouns',
    levelRange: [4, 8],
  },

  // ── Adjectives & Adverbs ─────────────────────────────────────────────────
  'adjectives-basic': {
    label: 'Basic Adjectives',
    group: 'Adjectives & Adverbs',
    levelRange: [1, 4],
  },
  'comparatives': {
    label: 'Comparatives',
    group: 'Adjectives & Adverbs',
    levelRange: [3, 7],
  },
  'superlatives': {
    label: 'Superlatives',
    group: 'Adjectives & Adverbs',
    levelRange: [4, 7],
  },
  'adverbs-frequency': {
    label: 'Adverbs of Frequency',
    group: 'Adjectives & Adverbs',
    levelRange: [2, 5],
  },
  'adverbs-manner': {
    label: 'Adverbs of Manner',
    group: 'Adjectives & Adverbs',
    levelRange: [3, 6],
  },

  // ── Prepositions ─────────────────────────────────────────────────────────
  'prepositions-place': {
    label: 'Prepositions of Place',
    group: 'Prepositions',
    levelRange: [1, 4],
  },
  'prepositions-time': {
    label: 'Prepositions of Time',
    group: 'Prepositions',
    levelRange: [2, 5],
  },
  'prepositions-movement': {
    label: 'Prepositions of Movement',
    group: 'Prepositions',
    levelRange: [2, 5],
  },

  // ── Verbs ────────────────────────────────────────────────────────────────
  'imperatives': {
    label: 'Imperatives',
    group: 'Verbs',
    levelRange: [1, 4],
  },
  'gerunds': {
    label: 'Gerunds (-ing)',
    group: 'Verbs',
    levelRange: [3, 7],
  },
  'infinitives': {
    label: 'Infinitives (to + verb)',
    group: 'Verbs',
    levelRange: [3, 7],
  },
  'phrasal-verbs': {
    label: 'Phrasal Verbs',
    group: 'Verbs',
    levelRange: [5, 9],
  },
  'passive-present': {
    label: 'Passive Voice (Present)',
    group: 'Verbs: Passive',
    levelRange: [6, 9],
  },
  'passive-past': {
    label: 'Passive Voice (Past)',
    group: 'Verbs: Passive',
    levelRange: [6, 10],
  },
  'passive-perfect': {
    label: 'Passive Voice (Perfect)',
    group: 'Verbs: Passive',
    levelRange: [8, 12],
  },
  'reported-speech': {
    label: 'Reported Speech',
    group: 'Verbs',
    levelRange: [6, 10],
  },
  'subjunctive': {
    label: 'Subjunctive',
    group: 'Verbs',
    levelRange: [8, 12],
  },

  // ── Sentence Structure ───────────────────────────────────────────────────
  'conjunctions': {
    label: 'Conjunctions (and/but/or)',
    group: 'Sentence Structure',
    levelRange: [1, 4],
  },
  'connectors': {
    label: 'Connectors (because/so/although)',
    group: 'Sentence Structure',
    levelRange: [3, 7],
  },
  'relative-clauses': {
    label: 'Relative Clauses',
    group: 'Sentence Structure',
    levelRange: [5, 9],
  },
  'inversion': {
    label: 'Inversion',
    group: 'Sentence Structure',
    levelRange: [8, 12],
  },
  'cleft-sentences': {
    label: 'Cleft Sentences',
    group: 'Sentence Structure',
    levelRange: [8, 12],
  },

  // ── Discourse ────────────────────────────────────────────────────────────
  'discourse-markers': {
    label: 'Discourse Markers',
    group: 'Discourse',
    levelRange: [5, 12],
  },
  'hedging': {
    label: 'Hedging Language',
    group: 'Discourse',
    levelRange: [7, 12],
  },
  'emphasis': {
    label: 'Emphasis Structures',
    group: 'Discourse',
    levelRange: [8, 12],
  },
  'nominalization': {
    label: 'Nominalization',
    group: 'Discourse',
    levelRange: [9, 12],
  },

  // ── Special ──────────────────────────────────────────────────────────────
  'numbers-time': {
    label: 'Numbers & Time',
    group: 'Special',
    levelRange: [1, 4],
  },
  'there-is-are': {
    label: 'There is / There are',
    group: 'Special',
    levelRange: [1, 4],
  },
  'have-has': {
    label: 'Have / Has',
    group: 'Special',
    levelRange: [1, 4],
  },
  'like-gerund': {
    label: 'Like + Gerund',
    group: 'Special',
    levelRange: [1, 5],
  },
  'collocations': {
    label: 'Collocations',
    group: 'Special',
    levelRange: [6, 10],
  },
} as const

export type GrammarTag = keyof typeof GRAMMAR_TAGS

export function getGrammarTagLabel(tag: GrammarTag): string {
  return GRAMMAR_TAGS[tag]?.label ?? tag
}

export function getGrammarTagsByLevel(level: number): GrammarTag[] {
  return (Object.entries(GRAMMAR_TAGS) as [GrammarTag, GrammarTagInfo][])
    .filter(([, info]) => info.levelRange[0] <= level && info.levelRange[1] >= level)
    .map(([tag]) => tag)
}

export function getGrammarTagGroups(): string[] {
  const groups = new Set(Object.values(GRAMMAR_TAGS).map((info) => info.group))
  return Array.from(groups)
}
