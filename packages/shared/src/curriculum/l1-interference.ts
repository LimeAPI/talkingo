/**
 * L1 Interference Database — common errors by native language.
 *
 * When a user's native language is known, this database provides
 * targeted hints to the AI about WHY certain errors happen and
 * how to explain them using L1 comparisons.
 *
 * Used by System 6 (Error Intelligence) to:
 * 1. Help AI categorize errors as "l1-interference"
 * 2. Provide L1-aware explanations ("In your language, you don't need X, but here you do")
 * 3. Predict likely errors before they happen
 *
 * Format: source language → target language patterns.
 * Since Talkingo supports learning ANY of 23 languages, we store
 * patterns as source→general (applies to most target languages).
 */

export interface L1Pattern {
  /** Short ID for the pattern */
  id: string
  /** Human-readable description */
  description: string
  /** What the learner tends to do wrong */
  typicalError: string
  /** Why it happens (L1 explanation) */
  explanation: string
  /** How to explain it to the learner */
  teachingHint: string
}

export interface L1Profile {
  /** ISO code of the native language */
  nativeLanguage: string
  /** Display name */
  nativeName: string
  /** Common interference patterns when learning other languages */
  patterns: L1Pattern[]
  /** General note about this L1 group */
  generalNote: string
}

// ─── L1 Profiles ──────────────────────────────────────────────────────────────

export const L1_PROFILES: L1Profile[] = [
  {
    nativeLanguage: 'ar',
    nativeName: 'Arabic',
    generalNote: 'Arabic speakers often omit copula (to be), struggle with articles in languages that have them, and may use VSO word order.',
    patterns: [
      {
        id: 'ar-missing-copula',
        description: 'Omitting "to be" verb in present tense',
        typicalError: '"She happy" instead of "She is happy"',
        explanation: 'Arabic does not use a copula (to be) in present tense nominal sentences.',
        teachingHint: 'In Arabic you say "هي سعيدة" without "is". But in this language, the linking verb is always required. Think of it as a mandatory connector.',
      },
      {
        id: 'ar-article-confusion',
        description: 'Overusing or misusing definite articles',
        typicalError: 'Using "the" with abstract nouns or generalizations',
        explanation: 'Arabic uses "al-" (the) more broadly than most European languages, including with abstract concepts.',
        teachingHint: 'In Arabic, "الحب" (the-love) is normal for general love. But in this language, general concepts usually have no article.',
      },
      {
        id: 'ar-word-order',
        description: 'Verb-Subject-Object word order bleeding through',
        typicalError: '"Went she to the store" instead of "She went to the store"',
        explanation: 'Arabic commonly uses VSO order, while most European languages use SVO.',
        teachingHint: 'Arabic often puts the verb first. Here, the subject comes first: Subject + Verb + Object.',
      },
      {
        id: 'ar-gender-transfer',
        description: 'Applying Arabic gender rules to target language',
        typicalError: 'Assigning wrong gender to nouns based on Arabic gender',
        explanation: 'Arabic has grammatical gender that doesn\'t always align with the target language\'s gender system.',
        teachingHint: 'The gender of this word in Arabic doesn\'t predict its gender here. You need to learn each word\'s gender separately.',
      },
    ],
  },
  {
    nativeLanguage: 'hi',
    nativeName: 'Hindi',
    generalNote: 'Hindi speakers often omit articles, overuse present continuous, and may struggle with preposition placement (Hindi uses postpositions).',
    patterns: [
      {
        id: 'hi-missing-articles',
        description: 'Omitting articles (a/an/the)',
        typicalError: '"I saw cat" instead of "I saw a cat"',
        explanation: 'Hindi has no articles. Definiteness is conveyed through context and word order.',
        teachingHint: 'Hindi doesn\'t have "a" or "the" — you use context instead. But this language requires them. First mention = a/an, known item = the.',
      },
      {
        id: 'hi-continuous-overuse',
        description: 'Overusing present continuous for habitual actions',
        typicalError: '"I am going to work every day" instead of "I go to work every day"',
        explanation: 'Hindi uses the continuous form (रहा/रही) for both ongoing and habitual actions.',
        teachingHint: 'In Hindi, "मैं जा रहा हूँ" works for both "I am going" and "I go". Here, habits use simple present, not continuous.',
      },
      {
        id: 'hi-postposition-confusion',
        description: 'Placing prepositions after the noun (postposition transfer)',
        typicalError: '"Table on" instead of "on the table"',
        explanation: 'Hindi uses postpositions (मेज पर = table on) while most target languages use prepositions.',
        teachingHint: 'Hindi puts the position word AFTER the noun (मेज पर). Here it goes BEFORE: on the table, in the house.',
      },
      {
        id: 'hi-subject-drop',
        description: 'Dropping subject pronouns',
        typicalError: '"Is going" instead of "He is going"',
        explanation: 'Hindi is a pro-drop language — the verb form indicates the subject.',
        teachingHint: 'In Hindi, the verb ending tells you who\'s doing it. Here, you must always include the subject pronoun.',
      },
    ],
  },
  {
    nativeLanguage: 'es',
    nativeName: 'Spanish',
    generalNote: 'Spanish speakers often struggle with ser/estar distinctions in other languages, adjective placement, and false cognates.',
    patterns: [
      {
        id: 'es-adjective-placement',
        description: 'Placing adjectives after nouns (Spanish order)',
        typicalError: '"The house big" instead of "The big house"',
        explanation: 'Spanish typically places adjectives after nouns (la casa grande).',
        teachingHint: 'In Spanish, adjectives usually come after: "casa grande". In this language, they come before the noun.',
      },
      {
        id: 'es-ser-estar',
        description: 'Confusing permanent vs temporary states',
        typicalError: 'Using wrong verb for "to be" in languages with one form',
        explanation: 'Spanish distinguishes ser (permanent) from estar (temporary), which doesn\'t map to most languages.',
        teachingHint: 'Spanish has two "to be" verbs. This language uses just one — don\'t overthink whether it\'s permanent or temporary.',
      },
      {
        id: 'es-false-cognates',
        description: 'Using false cognates (words that look similar but mean different things)',
        typicalError: '"Embarazada" ≠ "embarrassed" (it means pregnant)',
        explanation: 'Many Spanish-English cognates have shifted meaning over centuries.',
        teachingHint: 'Careful — this word looks like a Spanish word but means something different here. These are called "false friends."',
      },
      {
        id: 'es-subject-drop',
        description: 'Dropping subject pronouns (pro-drop transfer)',
        typicalError: '"Is raining" instead of "It is raining"',
        explanation: 'Spanish is pro-drop — "Llueve" doesn\'t need a subject. Many target languages require one.',
        teachingHint: 'Spanish lets you drop "yo/tú/él". This language always needs the subject pronoun, even for weather and impersonal verbs.',
      },
    ],
  },
  {
    nativeLanguage: 'zh',
    nativeName: 'Chinese (Mandarin)',
    generalNote: 'Chinese speakers often omit tense markers, articles, and plural forms. Word order is generally SVO but relative clauses differ.',
    patterns: [
      {
        id: 'zh-no-tense',
        description: 'Omitting tense markers (no verb conjugation)',
        typicalError: '"Yesterday I go store" instead of "Yesterday I went to the store"',
        explanation: 'Chinese has no verb conjugation — tense is shown through time words (昨天, 明天) not verb forms.',
        teachingHint: 'In Chinese, "我去" works for past, present, and future — you add 昨天/明天 for time. Here, the VERB itself must change form.',
      },
      {
        id: 'zh-no-articles',
        description: 'Omitting articles entirely',
        typicalError: '"I want buy car" instead of "I want to buy a car"',
        explanation: 'Chinese has no articles. Measure words (量词) serve a different function.',
        teachingHint: 'Chinese uses 一辆车 (one-measure-car) but no "a/the". This language needs articles: "a" for new/any, "the" for specific/known.',
      },
      {
        id: 'zh-no-plurals',
        description: 'Omitting plural markers',
        typicalError: '"Three book" instead of "Three books"',
        explanation: 'Chinese nouns don\'t change form for plural — quantity is shown by numbers/measure words.',
        teachingHint: 'In Chinese, 三本书 doesn\'t change 书. Here, nouns must change form when there\'s more than one.',
      },
      {
        id: 'zh-relative-clause-order',
        description: 'Placing relative clauses before the noun (Chinese order)',
        typicalError: '"The yesterday I bought book" instead of "The book I bought yesterday"',
        explanation: 'Chinese places modifying clauses BEFORE the noun (我昨天买的书).',
        teachingHint: 'Chinese puts descriptions before the noun. This language puts relative clauses AFTER: "the book THAT I bought."',
      },
    ],
  },
  {
    nativeLanguage: 'ja',
    nativeName: 'Japanese',
    generalNote: 'Japanese speakers struggle with articles, plurals, SOV→SVO word order, and relative pronoun constructions.',
    patterns: [
      {
        id: 'ja-sov-order',
        description: 'Using SOV word order (verb at end)',
        typicalError: '"I to the store went" instead of "I went to the store"',
        explanation: 'Japanese is strictly SOV (私は店に行った = I-store-to-went).',
        teachingHint: 'Japanese puts the verb at the end. This language puts it in the middle: Subject + Verb + Object.',
      },
      {
        id: 'ja-no-articles',
        description: 'Omitting articles',
        typicalError: '"I have dog" instead of "I have a dog"',
        explanation: 'Japanese has no articles. Particles (は、が、を) mark grammatical roles instead.',
        teachingHint: 'Japanese uses particles instead of articles. Here you need "a/the" before nouns to show if they\'re new or known.',
      },
      {
        id: 'ja-no-plurals',
        description: 'Omitting plural markers',
        typicalError: '"Many cat" instead of "Many cats"',
        explanation: 'Japanese nouns don\'t have plural forms (猫 = cat/cats).',
        teachingHint: 'In Japanese, 猫 is both "cat" and "cats". Here, you must add a plural marker when there\'s more than one.',
      },
      {
        id: 'ja-relative-pronouns',
        description: 'Omitting relative pronouns',
        typicalError: '"The man I met yesterday" missing "who/that"',
        explanation: 'Japanese relative clauses don\'t use relative pronouns — they just precede the noun.',
        teachingHint: 'Japanese doesn\'t need "who/that/which" — the clause just goes before the noun. This language needs a connector word.',
      },
    ],
  },
  {
    nativeLanguage: 'ko',
    nativeName: 'Korean',
    generalNote: 'Korean speakers face similar challenges to Japanese (SOV, no articles, no plurals) plus honorific register transfer.',
    patterns: [
      {
        id: 'ko-sov-order',
        description: 'Using SOV word order',
        typicalError: '"I coffee drink" instead of "I drink coffee"',
        explanation: 'Korean is SOV (나는 커피를 마신다 = I-coffee-drink).',
        teachingHint: 'Korean puts the verb last. Here: Subject + Verb + Object. The verb goes in the middle.',
      },
      {
        id: 'ko-no-articles',
        description: 'Omitting articles',
        typicalError: '"Give me water" instead of "Give me some water" or "Give me the water"',
        explanation: 'Korean has no articles — particles mark grammatical function.',
        teachingHint: 'Korean uses 을/를/이/가 instead of articles. This language needs "a/the/some" before nouns.',
      },
      {
        id: 'ko-topic-marker',
        description: 'Overusing topic constructions',
        typicalError: '"As for me, I like coffee" instead of "I like coffee"',
        explanation: 'Korean uses topic markers (는/은) heavily, leading to over-topicalization in other languages.',
        teachingHint: 'Korean loves "As for X..." (X는). This language is more direct — just say the subject and verb.',
      },
    ],
  },
  {
    nativeLanguage: 'fr',
    nativeName: 'French',
    generalNote: 'French speakers often transfer gender, struggle with continuous tenses, and use false cognates.',
    patterns: [
      {
        id: 'fr-gender-transfer',
        description: 'Applying French gender to target language nouns',
        typicalError: 'Using wrong gender based on French gender assignment',
        explanation: 'French grammatical gender doesn\'t align with other languages (la table ≠ der Tisch).',
        teachingHint: 'The gender in French doesn\'t predict the gender here. Each language assigns gender independently.',
      },
      {
        id: 'fr-continuous-absence',
        description: 'Not using continuous/progressive forms',
        typicalError: '"I eat" when meaning "I am eating right now"',
        explanation: 'French uses "je mange" for both "I eat" and "I am eating" — no separate continuous form.',
        teachingHint: 'French uses one form for both. This language distinguishes: "I eat" (habit) vs "I am eating" (right now).',
      },
      {
        id: 'fr-negation-structure',
        description: 'Using double negation structure (ne...pas)',
        typicalError: 'Placing negation in wrong position',
        explanation: 'French wraps the verb in ne...pas. Other languages use single negation in different positions.',
        teachingHint: 'French puts negation around the verb (ne...pas). Here, negation works differently — it goes [position].',
      },
    ],
  },
  {
    nativeLanguage: 'de',
    nativeName: 'German',
    generalNote: 'German speakers often struggle with word order in subordinate clauses, verb placement, and case system differences.',
    patterns: [
      {
        id: 'de-v2-order',
        description: 'Applying V2 word order rule',
        typicalError: '"Yesterday went I to the store" (verb in second position)',
        explanation: 'German requires the verb in second position in main clauses, even after adverbs.',
        teachingHint: 'German puts the verb second no matter what starts the sentence. This language keeps SVO order even after time expressions.',
      },
      {
        id: 'de-subordinate-verb-final',
        description: 'Putting verb at end of subordinate clauses',
        typicalError: '"I think that he to the store went"',
        explanation: 'German moves the verb to the end in subordinate clauses (dass er ging).',
        teachingHint: 'German puts verbs at the end after "dass/weil/wenn". This language keeps normal word order in subordinate clauses.',
      },
      {
        id: 'de-compound-nouns',
        description: 'Creating compound nouns that don\'t exist in target language',
        typicalError: 'Trying to combine nouns German-style',
        explanation: 'German freely compounds nouns (Handschuh = hand-shoe = glove). Most languages don\'t.',
        teachingHint: 'German loves combining nouns into one word. This language usually keeps them separate with prepositions: "X of Y" or "X for Y".',
      },
    ],
  },
  {
    nativeLanguage: 'tr',
    nativeName: 'Turkish',
    generalNote: 'Turkish speakers struggle with prepositions (Turkish uses suffixes), word order (SOV), and articles.',
    patterns: [
      {
        id: 'tr-suffix-to-preposition',
        description: 'Struggling with prepositions (Turkish uses suffixes)',
        typicalError: 'Omitting or misplacing prepositions',
        explanation: 'Turkish attaches location/direction as suffixes (-de, -den, -e) rather than separate words.',
        teachingHint: 'Turkish adds location to the end of words (evde = house-at). Here, location words are separate and come BEFORE: "at the house."',
      },
      {
        id: 'tr-no-gender',
        description: 'Struggling with grammatical gender',
        typicalError: 'Using wrong gender or omitting gender markers',
        explanation: 'Turkish has no grammatical gender — not even he/she distinction (o = he/she/it).',
        teachingHint: 'Turkish uses "o" for everyone. This language distinguishes gender — you need to learn which nouns are masculine/feminine.',
      },
      {
        id: 'tr-sov-order',
        description: 'Using SOV word order',
        typicalError: '"I the book read" instead of "I read the book"',
        explanation: 'Turkish is SOV (Ben kitabı okudum = I book-the read).',
        teachingHint: 'Turkish puts the verb last. Here: Subject + Verb + Object.',
      },
    ],
  },
  {
    nativeLanguage: 'ru',
    nativeName: 'Russian',
    generalNote: 'Russian speakers often omit articles and "to be" in present tense, and may struggle with continuous tenses.',
    patterns: [
      {
        id: 'ru-no-articles',
        description: 'Omitting articles',
        typicalError: '"I have car" instead of "I have a car"',
        explanation: 'Russian has no articles — definiteness is conveyed through word order and context.',
        teachingHint: 'Russian doesn\'t use "a/the" — word order shows what\'s new vs known. This language needs articles explicitly.',
      },
      {
        id: 'ru-missing-copula',
        description: 'Omitting "to be" in present tense',
        typicalError: '"She doctor" instead of "She is a doctor"',
        explanation: 'Russian omits the copula in present tense (Она врач = She doctor).',
        teachingHint: 'Russian drops "is/are" in present tense. This language always needs it: "She IS a doctor."',
      },
      {
        id: 'ru-aspect-confusion',
        description: 'Confusing perfective/imperfective with tense',
        typicalError: 'Using wrong tense when trying to express completion vs ongoing',
        explanation: 'Russian uses aspect (perfective/imperfective) where other languages use tense distinctions.',
        teachingHint: 'Russian uses verb pairs for complete/incomplete actions. Here, you use different tenses instead.',
      },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the L1 profile for a given native language.
 */
export function getL1Profile(nativeLanguage: string): L1Profile | undefined {
  return L1_PROFILES.find((p) => p.nativeLanguage === nativeLanguage)
}

/**
 * Build a prompt block with L1 awareness for a given native language.
 * Returns empty string if no profile exists for this language.
 * Compressed: pattern name + one-line bridge hint (saves ~150 tokens vs full explanations).
 */
export function buildL1PromptBlock(nativeLanguage: string | undefined): string {
  if (!nativeLanguage) return ''
  const profile = getL1Profile(nativeLanguage)
  if (!profile) return ''

  const patternLines = profile.patterns
    .map((p) => `- ${p.description}: "${p.teachingHint}"`)
    .join('\n')

  return `L1 AWARENESS — Native: ${profile.nativeName}. ${profile.generalNote}

Common interference (use to explain errors when relevant):
${patternLines}

When you spot these patterns, briefly bridge: "In ${profile.nativeName}, X. Here, Y." Keep L1 explanations under 10% of your response. Reduce as user advances.`
}
