/**
 * Lesson Templates — structured teaching paths.
 *
 * These are SEPARATE from conversation seeds:
 * - Seeds = conversation scenarios (practice through talking)
 * - Templates = structured lessons (teach a specific concept step-by-step)
 *
 * Templates are language-agnostic. The AI adapts content to the target language.
 * Each step tells the AI WHAT to teach and HOW to verify understanding.
 * The AI fills in language-specific examples, conjugations, and rules.
 *
 * Activated when user says "teach me X" or AI suggests a lesson.
 */

import type { CefrLevel, SkillDomain } from './index'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LessonCategory = 'grammar' | 'vocabulary' | 'expressions' | 'conversation' | 'culture'

export type CheckType = 'free-response' | 'fill-blank' | 'translation' | 'error-correction' | 'conversation'

export interface LessonStep {
  id: string
  /** What the AI should accomplish in this step */
  goal: string
  /** How the AI should teach this step */
  approach: string
  /** How to verify the user understood */
  checkType: CheckType
  /** What to ask the user to demonstrate understanding */
  checkPrompt: string
  /** What counts as passing */
  successCriteria: string
  /** What to do if user fails (re-explain strategy) */
  failureAction: string
  /** CEFR-specific adjustments */
  adaptations?: Partial<Record<CefrLevel, string>>
}

export interface LessonTemplate {
  id: string
  title: string
  /** Short description for UI display */
  blurb: string
  category: LessonCategory
  /** Which CEFR levels this lesson is appropriate for */
  cefrRange: [CefrLevel, CefrLevel]
  /** Primary skill domains this lesson targets */
  domains: SkillDomain[]
  /** What the user will be able to do after completing this lesson */
  objectives: string[]
  /** Estimated minutes to complete */
  estimatedMinutes: number
  /** Step-by-step teaching path */
  steps: LessonStep[]
  /**
   * Languages where this lesson doesn't apply.
   * Empty = works for all languages.
   * Example: "articles" lesson excludes Japanese, Korean, etc.
   */
  excludeLanguages?: string[]
  /** Keywords that trigger this lesson from user requests */
  triggerKeywords: string[]
}

// ─── Grammar Templates ────────────────────────────────────────────────────────

const GRAMMAR_TEMPLATES: LessonTemplate[] = [
  {
    id: 'present-tense',
    title: 'Present Tense',
    blurb: 'Form and use present tense verbs for daily routines and facts.',
    category: 'grammar',
    cefrRange: ['A1', 'A2'],
    domains: ['grammar', 'vocabulary'],
    objectives: [
      'Conjugate regular verbs in present tense',
      'Describe daily routines',
      'State facts and habits',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['present tense', 'present simple', 'daily routine', 'habits', 'conjugation basics'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce present tense concept with 3 common regular verbs',
        approach: 'Show the conjugation pattern for 3 everyday verbs (eat, work, live). Explain the pattern clearly. Give one example sentence per verb.',
        checkType: 'free-response',
        checkPrompt: 'Now you try: make a sentence about what you do every morning.',
        successCriteria: 'User produces a grammatically correct present tense sentence',
        failureAction: 'Give 2 more examples with simpler verbs (go, have), then ask again with a sentence starter: "Every day I..."',
        adaptations: {
          A1: 'Use only the 3 most common verbs. Keep to I/you forms only.',
          A2: 'Include all person forms. Add time expressions (always, sometimes, never).',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice conjugation across different subjects (I, you, he/she, we, they)',
        approach: 'Give the user 3 verbs and ask them to conjugate for different subjects. Correct each attempt immediately.',
        checkType: 'fill-blank',
        checkPrompt: 'Fill in: "She ___ (work) at a hospital. They ___ (live) in Madrid."',
        successCriteria: 'User correctly conjugates at least 2 out of 3',
        failureAction: 'Show the full conjugation table for one verb, then retry with different verbs.',
        adaptations: {
          A1: 'Only I/you/he-she. Skip we/they for now.',
          A2: 'All persons. Include one irregular verb.',
        },
      },
      {
        id: 'step-3',
        goal: 'Use present tense to describe a daily routine',
        approach: 'Ask the user to describe their typical morning or workday using at least 4 present tense verbs.',
        checkType: 'free-response',
        checkPrompt: 'Tell me about your typical morning. What do you do from waking up to leaving the house?',
        successCriteria: 'User produces 3+ correct present tense sentences describing routine',
        failureAction: 'Provide a model answer about YOUR morning, then ask them to do the same.',
        adaptations: {
          A1: 'Accept 2 correct sentences. Provide sentence starters.',
          A2: 'Expect 4+ sentences with time expressions and connectors (then, after that).',
        },
      },
      {
        id: 'step-4',
        goal: 'Distinguish present tense from other tenses in context',
        approach: 'Give 3 sentences mixing present and past. Ask user to identify which are present tense and why.',
        checkType: 'error-correction',
        checkPrompt: 'Which of these sentences are present tense? Fix the ones that are wrong.',
        successCriteria: 'User correctly identifies present tense sentences and fixes at least 1 error',
        failureAction: 'Explain the key signal words (every day, always, usually vs yesterday, last week). Retry.',
        adaptations: {
          A1: 'Only 2 sentences. Make the difference very obvious.',
          A2: 'Include 4 sentences with subtle differences.',
        },
      },
      {
        id: 'step-5',
        goal: 'Free conversation practice using present tense naturally',
        approach: 'Have a short conversation about habits, likes, and routines. Correct any present tense errors.',
        checkType: 'conversation',
        checkPrompt: 'Let\'s chat! What do you usually do on weekends? What do you like to eat?',
        successCriteria: 'User uses present tense correctly in 3+ turns of natural conversation',
        failureAction: 'Gently recast errors and continue the conversation. No need to stop — practice IS the goal.',
        adaptations: {
          A1: 'Ask simple yes/no + one open question. Accept short answers.',
          A2: 'Push for elaboration. Ask follow-up questions that require present tense.',
        },
      },
    ],
  },
  {
    id: 'past-tense-regular',
    title: 'Past Tense — Regular Verbs',
    blurb: 'Talk about what happened yesterday, last week, or in the past.',
    category: 'grammar',
    cefrRange: ['A1', 'B1'],
    domains: ['grammar', 'fluency'],
    objectives: [
      'Form regular past tense correctly',
      'Tell simple stories about past events',
      'Use time expressions with past tense',
    ],
    estimatedMinutes: 15,
    triggerKeywords: ['past tense', 'past simple', 'yesterday', 'what happened', 'regular verbs past'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce past tense concept — how verbs change to show "before now"',
        approach: 'Show 3 regular verbs in present vs past. Highlight the pattern. Give a clear rule for forming past tense in this language.',
        checkType: 'free-response',
        checkPrompt: 'Try making a past tense sentence: what did you do yesterday?',
        successCriteria: 'User attempts a past tense sentence (even with errors shows understanding of concept)',
        failureAction: 'Give the formula explicitly: [subject] + [verb in past form] + [rest]. Show 3 more examples. Try again.',
        adaptations: {
          A1: 'Use only 3 most common verbs. Accept any attempt at past form.',
          A2: 'Use 5 verbs. Expect correct formation.',
          B1: 'Include time expressions (yesterday, last week, 2 hours ago).',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice forming past tense with different regular verbs',
        approach: 'Give 5 verbs in present tense. Ask user to convert each to past tense.',
        checkType: 'fill-blank',
        checkPrompt: 'Change these to past tense: "I walk → I ___", "She cooks → She ___", "They play → They ___"',
        successCriteria: 'User correctly forms past tense for at least 3 out of 5 verbs',
        failureAction: 'Show the pattern again with color/emphasis on what changes. Give 3 easier verbs to try.',
        adaptations: {
          A1: 'Only 3 verbs, all very regular.',
          A2: '5 verbs including some with spelling changes.',
          B1: '5 verbs + ask them to use each in a full sentence.',
        },
      },
      {
        id: 'step-3',
        goal: 'Tell a simple story about yesterday using past tense',
        approach: 'Ask the user to describe what they did yesterday from morning to evening. Guide with questions if they get stuck.',
        checkType: 'free-response',
        checkPrompt: 'Tell me about yesterday. What did you do? Start from the morning.',
        successCriteria: 'User produces 4+ sentences using past tense, mostly correct',
        failureAction: 'Provide sentence starters: "Yesterday morning I...", "Then I...", "In the evening I..."',
        adaptations: {
          A1: 'Accept 2-3 short sentences. Provide heavy scaffolding.',
          A2: 'Expect 4+ sentences with some time connectors.',
          B1: 'Expect a coherent narrative with varied verbs and connectors.',
        },
      },
      {
        id: 'step-4',
        goal: 'Common mistakes with regular past tense',
        approach: 'Show 3 common errors learners make with past tense in this language. Explain why they are wrong. Ask user to correct them.',
        checkType: 'error-correction',
        checkPrompt: 'Find and fix the errors in these sentences.',
        successCriteria: 'User correctly identifies and fixes at least 2 out of 3 errors',
        failureAction: 'Explain each error type one by one. Give the rule. Try with new sentences.',
        adaptations: {
          A1: 'Only 2 errors, very obvious ones.',
          A2: '3 errors including one subtle one.',
          B1: '4 errors including negation and question formation in past.',
        },
      },
      {
        id: 'step-5',
        goal: 'Natural conversation using past tense',
        approach: 'Have a conversation about a recent trip, weekend, or event. Keep it natural but ensure past tense is used.',
        checkType: 'conversation',
        checkPrompt: 'Tell me about your last weekend or a recent trip. What happened?',
        successCriteria: 'User sustains 3+ turns using past tense naturally in conversation',
        failureAction: 'Continue chatting naturally. Recast errors. The practice itself is valuable.',
        adaptations: {
          A1: 'Ask simple questions: "Did you go out? What did you eat?"',
          A2: 'Ask open questions that require narrative: "What was the best part?"',
          B1: 'Push for detail and opinion: "How did you feel about that?"',
        },
      },
    ],
  },
  {
    id: 'past-tense-irregular',
    title: 'Past Tense — Irregular Verbs',
    blurb: 'Master the tricky verbs that don\'t follow the rules.',
    category: 'grammar',
    cefrRange: ['A2', 'B2'],
    domains: ['grammar', 'vocabulary'],
    objectives: [
      'Recognize and use common irregular past tense verbs',
      'Distinguish regular from irregular patterns',
      'Use irregular verbs naturally in storytelling',
    ],
    estimatedMinutes: 15,
    triggerKeywords: ['irregular verbs', 'irregular past', 'went went gone', 'tricky verbs'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce the concept of irregular verbs — verbs that break the pattern',
        approach: 'Show 5 of the most common irregular verbs (go, have, be, do, say) in present vs past. Emphasize: these must be memorized, no pattern.',
        checkType: 'free-response',
        checkPrompt: 'Without looking back, what is the past tense of "go" and "have"?',
        successCriteria: 'User recalls at least 1 correctly',
        failureAction: 'Group them by similarity pattern (if any exist in this language). Use mnemonics. Repeat.',
        adaptations: {
          A2: 'Only 5 most common irregulars.',
          B1: '8 irregulars including some less common ones.',
          B2: '10+ irregulars including formal/literary ones.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice the top 10 irregular verbs through repetition',
        approach: 'Quick-fire: give present tense, user gives past. Do 10 verbs. Celebrate correct ones, gently correct wrong ones.',
        checkType: 'fill-blank',
        checkPrompt: 'Quick round! I say the verb, you give me the past: go, eat, see, come, take, make, know, think, give, tell',
        successCriteria: 'User gets at least 6 out of 10 correct',
        failureAction: 'Focus on the 5 they got wrong. Give memory tricks. Retry just those 5.',
        adaptations: {
          A2: 'Only 6 verbs. Accept close attempts.',
          B1: '10 verbs. Expect accuracy.',
          B2: '10 verbs + ask for a sentence with each.',
        },
      },
      {
        id: 'step-3',
        goal: 'Use irregular verbs in sentences about real experiences',
        approach: 'Ask questions that force specific irregular verbs: "Where did you go last vacation?" "What did you eat for dinner?"',
        checkType: 'conversation',
        checkPrompt: 'Let me ask you some questions about your life. Answer in full sentences!',
        successCriteria: 'User correctly uses 3+ irregular past tense verbs in answers',
        failureAction: 'Recast the correct form naturally. Continue asking questions. Repetition builds memory.',
        adaptations: {
          A2: 'Simple questions requiring one irregular verb each.',
          B1: 'Questions requiring narrative with multiple irregulars.',
          B2: 'Complex questions requiring irregular verbs in subordinate clauses.',
        },
      },
      {
        id: 'step-4',
        goal: 'Mix regular and irregular in a story',
        approach: 'Ask user to tell a story (real or invented) that uses both regular and irregular past verbs. Correct any confusion between the two.',
        checkType: 'free-response',
        checkPrompt: 'Tell me a short story — real or made up — about something that happened. Try to use at least 3 irregular verbs.',
        successCriteria: 'User produces a coherent story with correct use of both regular and irregular past forms',
        failureAction: 'Provide a story frame: "Last summer I ___ (go) to... I ___ (see)... We ___ (eat)..." Let them fill in.',
        adaptations: {
          A2: 'Accept 3-4 sentences. Provide the story frame.',
          B1: 'Expect 5+ sentences without scaffolding.',
          B2: 'Expect a detailed narrative with varied tenses.',
        },
      },
    ],
  },
  {
    id: 'future-tense',
    title: 'Future Tense',
    blurb: 'Talk about plans, predictions, and what will happen next.',
    category: 'grammar',
    cefrRange: ['A2', 'B1'],
    domains: ['grammar', 'fluency'],
    objectives: [
      'Express future plans and intentions',
      'Make predictions',
      'Distinguish between planned future and spontaneous decisions',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['future tense', 'will', 'going to', 'plans', 'tomorrow', 'next week'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce how to express future in this language',
        approach: 'Show the main future construction(s). Give 3 examples about plans for tomorrow. Explain when to use it.',
        checkType: 'free-response',
        checkPrompt: 'What are you going to do tomorrow? Tell me your plans.',
        successCriteria: 'User produces at least 1 correct future tense sentence',
        failureAction: 'Give the formula explicitly. Show 3 more examples. Provide a sentence starter.',
        adaptations: {
          A2: 'Focus on one future form only (the simplest).',
          B1: 'Introduce both planned (going to) and prediction (will) forms if the language distinguishes them.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice forming future tense with various verbs',
        approach: 'Give 5 present tense sentences. Ask user to convert to future.',
        checkType: 'fill-blank',
        checkPrompt: 'Change to future: "I eat breakfast" → "Tomorrow I ___"',
        successCriteria: 'User correctly forms future for at least 3 out of 5',
        failureAction: 'Show the pattern again. Do 3 together, then let them try 2 alone.',
      },
      {
        id: 'step-3',
        goal: 'Talk about weekend plans using future tense',
        approach: 'Have a conversation about upcoming plans. Ask follow-up questions that require future tense.',
        checkType: 'conversation',
        checkPrompt: 'What are your plans for this weekend? Tell me everything!',
        successCriteria: 'User uses future tense correctly in 3+ turns',
        failureAction: 'Recast errors naturally. Ask simpler questions: "Will you go out or stay home?"',
      },
      {
        id: 'step-4',
        goal: 'Make predictions about the future',
        approach: 'Ask user to predict: weather tomorrow, what will happen in a movie, what their life will be like in 5 years.',
        checkType: 'free-response',
        checkPrompt: 'What do you think your life will be like in 5 years? Make 3 predictions.',
        successCriteria: 'User makes 2+ predictions using correct future form',
        failureAction: 'Model 2 predictions about YOUR future, then ask them to do the same.',
      },
    ],
  },
  {
    id: 'reflexive-verbs',
    title: 'Reflexive Verbs',
    blurb: 'Actions you do to yourself — daily routines, emotions, and more.',
    category: 'grammar',
    cefrRange: ['A2', 'B2'],
    domains: ['grammar', 'vocabulary'],
    objectives: [
      'Understand what makes a verb reflexive',
      'Use common daily routine reflexives correctly',
      'Form reflexive constructions in different tenses',
    ],
    estimatedMinutes: 15,
    triggerKeywords: ['reflexive verbs', 'reflexive', 'myself', 'daily routine verbs', 'se laver', 'levantarse'],
    excludeLanguages: ['en', 'zh', 'ja', 'ko'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce the concept — what makes a verb reflexive (action on yourself)',
        approach: 'Explain with 3 common daily routine examples (wash, wake up, dress). Show the pattern: subject does action TO themselves. Compare reflexive vs non-reflexive form of same verb.',
        checkType: 'free-response',
        checkPrompt: 'Which of these actions are reflexive? Washing your hands, washing the car, getting dressed, dressing a child.',
        successCriteria: 'User correctly identifies reflexive vs non-reflexive actions',
        failureAction: 'Simplify: "If YOU do it to YOURSELF, it\'s reflexive. If you do it to something else, it\'s not." Give more examples.',
        adaptations: {
          A2: 'Use only present tense, simplest verbs (wash, wake up, dress).',
          B1: 'Add emotional reflexives (feel, remember, worry).',
          B2: 'Include reciprocal and idiomatic reflexives.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice conjugation with daily routine reflexive verbs',
        approach: 'Give 3 reflexive verbs. Ask user to conjugate in present tense for different subjects.',
        checkType: 'fill-blank',
        checkPrompt: 'Conjugate: "I ___ (wake up)", "She ___ (get dressed)", "We ___ (wash)"',
        successCriteria: 'User correctly conjugates at least 2 out of 3 reflexive verbs',
        failureAction: 'Show the full conjugation of one verb as a model. Highlight where the reflexive pronoun goes. Retry.',
        adaptations: {
          A2: 'Only I/you/he-she forms.',
          B1: 'All persons including we/they.',
          B2: 'Multiple tenses (present + past).',
        },
      },
      {
        id: 'step-3',
        goal: 'Describe your morning routine using reflexive verbs',
        approach: 'Ask user to describe their morning routine using reflexive verbs. Guide with questions if stuck.',
        checkType: 'free-response',
        checkPrompt: 'Describe your morning routine from waking up to leaving the house. Use reflexive verbs!',
        successCriteria: 'User produces 3+ correct reflexive sentences about their routine',
        failureAction: 'Provide sentence starters: "First I ___ (wake up) at...", "Then I ___ (shower)...", "I ___ (get dressed)..."',
        adaptations: {
          A2: 'Accept simple present tense sentences.',
          B1: 'Expect time expressions and connectors.',
          B2: 'Expect varied tenses and complex sentences.',
        },
      },
      {
        id: 'step-4',
        goal: 'Common mistakes with reflexive verbs',
        approach: 'Show 3 common errors: wrong pronoun placement, forgetting the pronoun, using reflexive when not needed. Ask user to correct.',
        checkType: 'error-correction',
        checkPrompt: 'Find and fix the errors in these reflexive sentences.',
        successCriteria: 'User corrects at least 2 out of 3 errors',
        failureAction: 'Explain each error type. Give the rule for pronoun placement. Try new sentences.',
        adaptations: {
          A2: 'Focus on pronoun placement only.',
          B1: 'Add negation + reflexive interaction.',
          B2: 'Add reflexive vs non-reflexive meaning changes.',
        },
      },
      {
        id: 'step-5',
        goal: 'Natural conversation using reflexive verbs',
        approach: 'Chat about daily routines, morning habits, evening rituals. Keep it natural but ensure reflexives come up.',
        checkType: 'conversation',
        checkPrompt: 'Tell me — are you a morning person or a night owl? What does your evening routine look like?',
        successCriteria: 'User uses 3+ reflexive verbs correctly in natural conversation',
        failureAction: 'Continue chatting. Recast errors. The practice itself builds fluency.',
        adaptations: {
          A2: 'Guide heavily, provide sentence starters.',
          B1: 'Ask open questions that elicit reflexives.',
          B2: 'Discuss abstract topics requiring reflexive constructions.',
        },
      },
    ],
  },
  {
    id: 'conditionals',
    title: 'Conditional Sentences (If...)',
    blurb: 'Express hypothetical situations, wishes, and consequences.',
    category: 'grammar',
    cefrRange: ['B1', 'C1'],
    domains: ['grammar', 'fluency'],
    objectives: [
      'Form first conditional (real/likely situations)',
      'Form second conditional (hypothetical/unlikely)',
      'Use conditionals naturally in conversation',
    ],
    estimatedMinutes: 18,
    triggerKeywords: ['conditional', 'if then', 'would', 'hypothetical', 'if I were', 'subjunctive'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce first conditional — real/likely future situations',
        approach: 'Explain: "If X happens, Y will happen." Give 3 examples about real possibilities. Show the tense pattern.',
        checkType: 'free-response',
        checkPrompt: 'Complete this: "If it rains tomorrow, I will..."',
        successCriteria: 'User produces a correct first conditional sentence',
        failureAction: 'Give the formula: If + [present], [future]. Show 3 more examples. Try again.',
        adaptations: {
          B1: 'Focus only on first conditional. Simple situations.',
          B2: 'Introduce both first and second conditional.',
          C1: 'All three conditionals + mixed conditionals.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice forming conditionals with different scenarios',
        approach: 'Give 4 situations. Ask user to form conditional sentences for each.',
        checkType: 'fill-blank',
        checkPrompt: 'Make conditional sentences: "win the lottery", "miss the bus", "get a promotion", "move to another country"',
        successCriteria: 'User correctly forms at least 3 out of 4 conditional sentences',
        failureAction: 'Do 2 together as examples, then let them try the remaining 2 alone.',
      },
      {
        id: 'step-3',
        goal: 'Second conditional — hypothetical/unlikely situations',
        approach: 'Introduce: "If I were/had..., I would..." Explain the difference from first conditional. Give 3 examples.',
        checkType: 'free-response',
        checkPrompt: 'If you could live anywhere in the world, where would you live and why?',
        successCriteria: 'User uses second conditional structure correctly',
        failureAction: 'Contrast first vs second: "If it rains (possible)" vs "If I were rich (hypothetical)". Give the formula. Retry.',
        adaptations: {
          B1: 'Accept approximate attempts. Focus on the concept.',
          B2: 'Expect correct formation and natural usage.',
          C1: 'Expect nuanced use including mixed conditionals.',
        },
      },
      {
        id: 'step-4',
        goal: 'Conversation using conditionals naturally',
        approach: 'Ask hypothetical questions: "What would you do if...?" "What will you do if...?" Mix first and second.',
        checkType: 'conversation',
        checkPrompt: 'Let\'s play a game: I ask "what if" questions, you answer. Ready?',
        successCriteria: 'User uses both first and second conditionals correctly across 3+ turns',
        failureAction: 'Simplify to just first conditional questions. Build confidence before adding second.',
      },
    ],
  },
  {
    id: 'articles-determiners',
    title: 'Articles & Determiners',
    blurb: 'Master a/an/the (or equivalents) — the small words that trip everyone up.',
    category: 'grammar',
    cefrRange: ['A1', 'B2'],
    domains: ['grammar'],
    objectives: [
      'Know when to use definite vs indefinite articles',
      'Know when to use NO article',
      'Apply article rules naturally without overthinking',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['articles', 'a an the', 'determiners', 'when to use the', 'no article'],
    excludeLanguages: ['ja', 'ko', 'zh', 'hi', 'tr', 'ru'],
    steps: [
      {
        id: 'step-1',
        goal: 'Explain the basic concept: definite (specific) vs indefinite (any/new)',
        approach: 'Use a simple analogy: "THE = we both know which one. A/AN = any one, first mention." Give 3 pairs showing the difference.',
        checkType: 'fill-blank',
        checkPrompt: 'Fill in: "I saw ___ cat. ___ cat was black." / "She is ___ doctor."',
        successCriteria: 'User correctly uses definite and indefinite articles in context',
        failureAction: 'Simplify the rule: "First time = a/an. Second time (we know which) = the." More examples.',
        adaptations: {
          A1: 'Only a/an vs the. Very simple contexts.',
          A2: 'Add zero article cases (general statements).',
          B1: 'Add exceptions and tricky cases.',
          B2: 'Add abstract nouns, institutions, geographical names.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice choosing the right article in sentences',
        approach: 'Give 6 sentences with blanks. User fills in the correct article (or no article).',
        checkType: 'fill-blank',
        checkPrompt: 'Choose a, an, the, or nothing: "___ water is important. I need ___ glass of water. ___ glass on the table is mine."',
        successCriteria: 'User gets at least 4 out of 6 correct',
        failureAction: 'Group by rule: "General = no article. Specific = the. New/any = a/an." Retry with new sentences.',
      },
      {
        id: 'step-3',
        goal: 'Identify and fix article errors in a paragraph',
        approach: 'Give a short paragraph with 3-4 article errors. Ask user to find and fix them.',
        checkType: 'error-correction',
        checkPrompt: 'Find the article errors in this paragraph and fix them.',
        successCriteria: 'User finds and corrects at least 2 out of 3 errors',
        failureAction: 'Highlight where the errors are (without fixing them). Let user try again with the location known.',
      },
      {
        id: 'step-4',
        goal: 'Use articles naturally in free conversation',
        approach: 'Have a conversation about a topic that requires many articles (describing a place, telling a story). Correct article errors.',
        checkType: 'conversation',
        checkPrompt: 'Describe your home to me. What rooms do you have? What\'s in each room?',
        successCriteria: 'User uses articles mostly correctly in 3+ turns of description',
        failureAction: 'Continue the conversation. Recast article errors naturally. This takes time — practice is key.',
      },
    ],
  },
  {
    id: 'subjunctive-mood',
    title: 'Subjunctive Mood',
    blurb: 'Express wishes, doubts, emotions, and hypotheticals with the subjunctive.',
    category: 'grammar',
    cefrRange: ['B1', 'C2'],
    domains: ['grammar', 'fluency'],
    objectives: [
      'Understand when subjunctive is required',
      'Form subjunctive correctly for common verbs',
      'Use subjunctive naturally in expressing wishes and doubts',
    ],
    estimatedMinutes: 20,
    triggerKeywords: ['subjunctive', 'subjuntivo', 'subjonctif', 'wishes', 'doubt expressions', 'I wish', 'I hope that'],
    excludeLanguages: ['en', 'zh', 'ja', 'ko'],
    steps: [
      {
        id: 'step-1',
        goal: 'Explain what subjunctive is and when it\'s used',
        approach: 'Subjunctive = non-facts (wishes, doubts, emotions, commands). Contrast with indicative (facts). Give 3 clear pairs.',
        checkType: 'free-response',
        checkPrompt: 'Which of these needs subjunctive? "I know he is here" vs "I hope he is here" — and why?',
        successCriteria: 'User correctly identifies that wishes/hopes trigger subjunctive',
        failureAction: 'Simplify: "FACT = indicative. NOT A FACT (wish, doubt, emotion) = subjunctive." More examples.',
        adaptations: {
          B1: 'Focus on wishes and hopes only. Present subjunctive.',
          B2: 'Add doubt, emotion, and impersonal expressions.',
          C1: 'Add past subjunctive and complex triggers.',
          C2: 'Add literary/formal subjunctive uses.',
        },
      },
      {
        id: 'step-2',
        goal: 'Form subjunctive for the 5 most common verbs',
        approach: 'Show subjunctive conjugation for 5 common verbs. Practice forming them.',
        checkType: 'fill-blank',
        checkPrompt: 'Complete with subjunctive: "I hope that he ___ (come)", "I want you to ___ (be) happy"',
        successCriteria: 'User correctly forms subjunctive for at least 3 out of 5',
        failureAction: 'Show the conjugation pattern. Do 2 together, then let them try 3 alone.',
      },
      {
        id: 'step-3',
        goal: 'Express wishes and hopes using subjunctive',
        approach: 'Ask user to express 3 wishes about their life, career, or the world. Must use subjunctive.',
        checkType: 'free-response',
        checkPrompt: 'Tell me 3 wishes: one about your life, one about the world, one about someone you love.',
        successCriteria: 'User produces 2+ correct subjunctive sentences expressing wishes',
        failureAction: 'Give sentence starters: "I wish that...", "I hope that...", "I want... to..."',
      },
      {
        id: 'step-4',
        goal: 'Use subjunctive in natural conversation about opinions and doubts',
        approach: 'Discuss a topic where opinions and doubts arise naturally (future of AI, climate change, relationships).',
        checkType: 'conversation',
        checkPrompt: 'What do you think about the future? Are you optimistic or do you doubt things will improve?',
        successCriteria: 'User uses subjunctive correctly in 2+ turns when expressing doubt or opinion',
        failureAction: 'Model subjunctive in your own responses. Ask questions that trigger it: "Do you think it\'s possible that...?"',
      },
    ],
  },
  // ── Additional Grammar Templates (compact) ──────────────────────────────────
  {
    id: 'possessives', title: 'Possessives & Ownership', blurb: 'Express what belongs to whom.', category: 'grammar', cefrRange: ['A1', 'A2'], domains: ['grammar', 'vocabulary'], objectives: ['Use possessive adjectives', 'Express ownership'], estimatedMinutes: 8,
    triggerKeywords: ['possessive', 'my your his her', 'ownership', 'belong'],
    steps: [
      { id: 's1', goal: 'Introduce possessive adjectives (my, your, his, her, our, their)', approach: 'Use family context: "This is MY mother. What about YOUR family?"', checkType: 'fill-blank', checkPrompt: '__ mother is a teacher. (my/your/his)', successCriteria: 'Correct possessive chosen', failureAction: 'Show all possessives with a family tree visual' },
      { id: 's2', goal: 'Practice in conversation', approach: 'Ask about belongings: whose phone, whose bag, whose idea', checkType: 'conversation', checkPrompt: 'Tell me about your family — use my, his, her', successCriteria: 'Uses 3+ possessives correctly', failureAction: 'Model with your own family description' },
    ],
  },
  {
    id: 'comparatives-superlatives', title: 'Comparatives & Superlatives', blurb: 'Compare things — bigger, better, the best.', category: 'grammar', cefrRange: ['A2', 'B1'], domains: ['grammar', 'vocabulary'], objectives: ['Form comparatives', 'Form superlatives', 'Use than/the most'], estimatedMinutes: 12,
    triggerKeywords: ['comparative', 'superlative', 'bigger', 'better', 'the best', 'more than'],
    steps: [
      { id: 's1', goal: 'Teach comparative forms (-er/more)', approach: 'Compare two things the user knows: cities, foods, people', checkType: 'fill-blank', checkPrompt: 'Paris is __ than London. (big)', successCriteria: 'Correct comparative form', failureAction: 'Explain short vs long adjective rule' },
      { id: 's2', goal: 'Teach superlative forms (-est/most)', approach: 'Ask about favorites: the best movie, the tallest building', checkType: 'free-response', checkPrompt: 'What is the best restaurant in your city? Why?', successCriteria: 'Uses superlative correctly', failureAction: 'Model with examples from your city' },
      { id: 's3', goal: 'Use both in natural conversation', approach: 'Compare experiences, places, or people naturally', checkType: 'conversation', checkPrompt: 'Compare two places you have visited', successCriteria: 'Uses both comparative and superlative in one turn', failureAction: 'Give sentence starters' },
    ],
  },
  {
    id: 'prepositions-place', title: 'Prepositions of Place', blurb: 'In, on, at, under, between, next to.', category: 'grammar', cefrRange: ['A1', 'A2'], domains: ['grammar', 'vocabulary'], objectives: ['Use basic prepositions of place', 'Describe locations'], estimatedMinutes: 8,
    triggerKeywords: ['preposition', 'in on at', 'where is', 'location', 'next to'],
    steps: [
      { id: 's1', goal: 'Teach in/on/at/under/next to', approach: 'Describe objects in a room. Ask where things are.', checkType: 'free-response', checkPrompt: 'Where is your phone right now?', successCriteria: 'Uses a preposition correctly', failureAction: 'Draw a simple scene and label positions' },
      { id: 's2', goal: 'Practice describing locations', approach: 'Describe your neighborhood using prepositions', checkType: 'conversation', checkPrompt: 'Describe where things are in your room or street', successCriteria: 'Uses 3+ different prepositions correctly', failureAction: 'Ask yes/no questions: Is the book ON the table?' },
    ],
  },
  {
    id: 'prepositions-time', title: 'Prepositions of Time', blurb: 'In, on, at for time — in January, on Monday, at 3pm.', category: 'grammar', cefrRange: ['A1', 'B1'], domains: ['grammar'], objectives: ['Use in/on/at for time correctly'], estimatedMinutes: 8,
    triggerKeywords: ['preposition time', 'in on at time', 'in january', 'on monday', 'at night'],
    steps: [
      { id: 's1', goal: 'Teach the rules: at (time), on (day/date), in (month/year/period)', approach: 'Give examples from daily life. Ask about their schedule.', checkType: 'fill-blank', checkPrompt: 'I wake up __ 7am __ Monday.', successCriteria: 'Correct prepositions (at, on)', failureAction: 'Give the rule as a simple chart' },
      { id: 's2', goal: 'Practice in conversation about schedules', approach: 'Discuss their weekly schedule, birthdays, holidays', checkType: 'conversation', checkPrompt: 'Tell me about your typical week — when do you do things?', successCriteria: 'Uses in/on/at correctly 3+ times', failureAction: 'Correct gently and repeat the rule' },
    ],
  },
  {
    id: 'modal-verbs', title: 'Modal Verbs', blurb: 'Can, could, should, must, might — express ability, advice, obligation.', category: 'grammar', cefrRange: ['A2', 'B2'], domains: ['grammar', 'fluency'], objectives: ['Use modals for ability, advice, obligation, possibility'], estimatedMinutes: 15,
    triggerKeywords: ['modal', 'can could', 'should must', 'might', 'have to'],
    steps: [
      { id: 's1', goal: 'Teach can/can\'t for ability', approach: 'Ask what they can and can\'t do — sports, cooking, languages', checkType: 'free-response', checkPrompt: 'What can you do well? What can\'t you do?', successCriteria: 'Uses can/can\'t correctly', failureAction: 'Model with your own abilities' },
      { id: 's2', goal: 'Teach should/shouldn\'t for advice', approach: 'Present a problem and ask for advice', checkType: 'free-response', checkPrompt: 'My friend is stressed at work. What should they do?', successCriteria: 'Uses should/shouldn\'t for advice', failureAction: 'Give sentence starters: "They should..."' },
      { id: 's3', goal: 'Teach must/have to for obligation', approach: 'Discuss rules — at work, at school, in their country', checkType: 'conversation', checkPrompt: 'What rules must you follow at work or school?', successCriteria: 'Uses must/have to correctly', failureAction: 'Distinguish must (internal) vs have to (external)' },
      { id: 's4', goal: 'Teach might/could for possibility', approach: 'Discuss future plans that are uncertain', checkType: 'conversation', checkPrompt: 'What might you do this weekend? What could happen?', successCriteria: 'Uses might/could for uncertainty', failureAction: 'Model: "I might go to the cinema, or I could stay home"' },
    ],
  },
  {
    id: 'present-perfect', title: 'Present Perfect', blurb: 'Have you ever...? I\'ve been to... I haven\'t finished yet.', category: 'grammar', cefrRange: ['A2', 'B2'], domains: ['grammar', 'fluency'], objectives: ['Form present perfect', 'Use for experiences and recent events', 'Distinguish from past simple'], estimatedMinutes: 15,
    triggerKeywords: ['present perfect', 'have you ever', 'I have been', 'already yet', 'for since'],
    steps: [
      { id: 's1', goal: 'Introduce present perfect for life experiences', approach: 'Play "Have you ever...?" game', checkType: 'free-response', checkPrompt: 'Have you ever been to another country? Tell me about it.', successCriteria: 'Uses "I have/haven\'t + past participle"', failureAction: 'Model: "I have been to Japan. I haven\'t been to Australia."' },
      { id: 's2', goal: 'Teach already/yet/just', approach: 'Discuss a to-do list — what have you already done today?', checkType: 'free-response', checkPrompt: 'What have you already done today? What haven\'t you done yet?', successCriteria: 'Uses already/yet correctly', failureAction: 'Explain position: already (mid), yet (end, negative/question)' },
      { id: 's3', goal: 'Distinguish present perfect from past simple', approach: 'Compare: "I have been to Paris" vs "I went to Paris last year"', checkType: 'error-correction', checkPrompt: 'Find the error: "I have gone to Paris last summer"', successCriteria: 'Identifies that specific time = past simple', failureAction: 'Rule: specific time → past simple, no time/ever → present perfect' },
    ],
  },
  {
    id: 'passive-voice-lesson', title: 'Passive Voice', blurb: 'It was built in 1900. The book is being read.', category: 'grammar', cefrRange: ['B1', 'C1'], domains: ['grammar', 'vocabulary'], objectives: ['Form passive in different tenses', 'Know when to use passive vs active'], estimatedMinutes: 12,
    triggerKeywords: ['passive voice', 'was built', 'is made', 'been done', 'by whom'],
    steps: [
      { id: 's1', goal: 'Introduce passive form: be + past participle', approach: 'Discuss how things are made — chocolate, cars, phones', checkType: 'fill-blank', checkPrompt: 'Chocolate __ (make) in Switzerland.', successCriteria: 'Correct passive form (is made)', failureAction: 'Show active → passive transformation step by step' },
      { id: 's2', goal: 'Practice passive in different tenses', approach: 'Discuss history: what was built, discovered, invented', checkType: 'free-response', checkPrompt: 'Tell me 3 things that were invented in the last 100 years', successCriteria: 'Uses past passive correctly', failureAction: 'Give the formula: was/were + past participle' },
      { id: 's3', goal: 'Use passive naturally in conversation', approach: 'Discuss news, processes, or history', checkType: 'conversation', checkPrompt: 'How is your favourite food prepared?', successCriteria: 'Uses passive 2+ times naturally', failureAction: 'Model with a recipe in passive voice' },
    ],
  },
  {
    id: 'reported-speech', title: 'Reported Speech', blurb: 'She said that... He told me... They asked if...', category: 'grammar', cefrRange: ['B1', 'C1'], domains: ['grammar', 'fluency'], objectives: ['Transform direct to reported speech', 'Use reporting verbs'], estimatedMinutes: 12,
    triggerKeywords: ['reported speech', 'indirect speech', 'she said', 'he told me', 'they asked'],
    steps: [
      { id: 's1', goal: 'Introduce reported speech with say/tell', approach: 'Tell a story about what someone said. Show the transformation.', checkType: 'translation', checkPrompt: 'Change to reported speech: "I am tired" → She said...', successCriteria: 'Correct backshift: "She said she was tired"', failureAction: 'Show tense backshift table' },
      { id: 's2', goal: 'Practice with questions (asked if/whether)', approach: 'Report questions from a conversation', checkType: 'free-response', checkPrompt: 'What did your friend ask you recently?', successCriteria: 'Uses "asked if/whether" correctly', failureAction: 'Model: "He asked me if I wanted to go"' },
      { id: 's3', goal: 'Use reported speech in natural storytelling', approach: 'Tell a story about a conversation you had', checkType: 'conversation', checkPrompt: 'Tell me about a conversation you had this week', successCriteria: 'Uses reported speech naturally 2+ times', failureAction: 'Prompt with: "What did they say? What did you reply?"' },
    ],
  },
  {
    id: 'relative-clauses', title: 'Relative Clauses', blurb: 'The person who... The thing that... The place where...', category: 'grammar', cefrRange: ['A2', 'B2'], domains: ['grammar', 'fluency'], objectives: ['Use who/which/that/where/when', 'Form defining and non-defining clauses'], estimatedMinutes: 10,
    triggerKeywords: ['relative clause', 'who which that', 'the person who', 'the thing that', 'where when'],
    steps: [
      { id: 's1', goal: 'Teach who (people), which/that (things), where (places)', approach: 'Describe people and things using relative clauses', checkType: 'fill-blank', checkPrompt: 'The woman __ lives next door is a teacher.', successCriteria: 'Correct relative pronoun (who)', failureAction: 'Rule: people=who, things=which/that, places=where' },
      { id: 's2', goal: 'Practice describing with relative clauses', approach: 'Play a guessing game: describe something without naming it', checkType: 'conversation', checkPrompt: 'Describe a famous person without saying their name — use "who"', successCriteria: 'Uses relative clauses to describe 2+ things', failureAction: 'Give sentence starters: "It\'s a person who..."' },
    ],
  },
  {
    id: 'phrasal-verbs', title: 'Phrasal Verbs', blurb: 'Get up, look after, give up, turn down — verbs that change meaning.', category: 'grammar', cefrRange: ['B1', 'C1'], domains: ['grammar', 'vocabulary'], objectives: ['Understand common phrasal verbs', 'Use them naturally'], estimatedMinutes: 12,
    triggerKeywords: ['phrasal verb', 'get up', 'look after', 'give up', 'turn down', 'pick up'],
    steps: [
      { id: 's1', goal: 'Introduce 5 common phrasal verbs with context', approach: 'Tell a story using phrasal verbs. Ask if they can guess meanings from context.', checkType: 'free-response', checkPrompt: 'What does "give up" mean? Can you use it in a sentence?', successCriteria: 'Correct meaning and usage', failureAction: 'Give 3 example sentences for each' },
      { id: 's2', goal: 'Practice using phrasal verbs in conversation', approach: 'Discuss daily routines and life events using phrasal verbs', checkType: 'conversation', checkPrompt: 'Tell me about your morning — use "get up", "put on", "set off"', successCriteria: 'Uses 3+ phrasal verbs correctly', failureAction: 'Give a list and ask them to make sentences' },
    ],
  },
  {
    id: 'gerunds-infinitives', title: 'Gerunds & Infinitives', blurb: 'I enjoy swimming vs I want to swim — when to use which.', category: 'grammar', cefrRange: ['B1', 'B2'], domains: ['grammar'], objectives: ['Know which verbs take gerund vs infinitive', 'Use both correctly'], estimatedMinutes: 10,
    triggerKeywords: ['gerund', 'infinitive', 'enjoy swimming', 'want to', '-ing or to'],
    steps: [
      { id: 's1', goal: 'Teach verbs + gerund (enjoy, avoid, finish, mind)', approach: 'Discuss likes/dislikes: "I enjoy cooking. I avoid driving."', checkType: 'fill-blank', checkPrompt: 'I enjoy __ (cook). I avoid __ (drive).', successCriteria: 'Correct gerund forms', failureAction: 'List common gerund verbs: enjoy, avoid, finish, mind, suggest' },
      { id: 's2', goal: 'Teach verbs + infinitive (want, need, decide, hope)', approach: 'Discuss plans and goals: "I want to travel. I decided to study."', checkType: 'free-response', checkPrompt: 'What do you want to do next year?', successCriteria: 'Uses infinitive correctly after want/hope/decide', failureAction: 'List common infinitive verbs' },
      { id: 's3', goal: 'Practice both in natural conversation', approach: 'Discuss hobbies, plans, and preferences', checkType: 'conversation', checkPrompt: 'What do you enjoy doing? What do you want to learn?', successCriteria: 'Uses both gerund and infinitive correctly', failureAction: 'Correct gently and explain the pattern' },
    ],
  },
  {
    id: 'question-forms', title: 'Question Forms', blurb: 'How to ask questions correctly — word order, auxiliaries, tags.', category: 'grammar', cefrRange: ['A1', 'B1'], domains: ['grammar', 'fluency'], objectives: ['Form yes/no questions', 'Form wh-questions', 'Use question tags'], estimatedMinutes: 10,
    triggerKeywords: ['question', 'how to ask', 'word order question', 'do you', 'question tag'],
    steps: [
      { id: 's1', goal: 'Teach yes/no question formation with do/does/did', approach: 'Practice asking about daily life: "Do you like...? Did you go...?"', checkType: 'free-response', checkPrompt: 'Ask me 3 yes/no questions about my weekend', successCriteria: 'Correct auxiliary + base verb', failureAction: 'Show formula: Do/Does/Did + subject + base verb' },
      { id: 's2', goal: 'Teach wh-questions (what, where, when, why, how)', approach: 'Play an interview game — ask questions to learn about each other', checkType: 'conversation', checkPrompt: 'Interview me — ask 5 different wh-questions', successCriteria: 'Uses 4+ different wh-words with correct word order', failureAction: 'Model correct word order for each wh-word' },
    ],
  },
  {
    id: 'connectors-linking', title: 'Connectors & Linking Words', blurb: 'However, although, therefore, in addition — connect your ideas.', category: 'grammar', cefrRange: ['B1', 'C1'], domains: ['grammar', 'fluency'], objectives: ['Use contrast connectors', 'Use cause/effect connectors', 'Use addition connectors'], estimatedMinutes: 12,
    triggerKeywords: ['connector', 'linking word', 'however', 'although', 'therefore', 'moreover'],
    steps: [
      { id: 's1', goal: 'Teach contrast connectors (however, although, despite)', approach: 'Discuss pros and cons of something — technology, city life', checkType: 'free-response', checkPrompt: 'Give me one advantage and one disadvantage of social media — use "however"', successCriteria: 'Uses a contrast connector correctly', failureAction: 'Model: "Social media is fun. However, it can be addictive."' },
      { id: 's2', goal: 'Teach cause/effect (therefore, as a result, because of)', approach: 'Discuss why things happen — cause and effect chains', checkType: 'free-response', checkPrompt: 'Why do people move to big cities? Use "therefore" or "as a result"', successCriteria: 'Uses cause/effect connector correctly', failureAction: 'Show the difference: because (reason) vs therefore (result)' },
      { id: 's3', goal: 'Use varied connectors in extended speech', approach: 'Give an opinion on a topic using multiple connectors', checkType: 'conversation', checkPrompt: 'Give me your opinion on remote work — use at least 3 different connectors', successCriteria: 'Uses 3+ different connectors naturally', failureAction: 'Give a connector menu to choose from' },
    ],
  },
  {
    id: 'wish-regret', title: 'Wishes & Regrets', blurb: 'I wish I had... If only I could... I regret not...', category: 'grammar', cefrRange: ['B2', 'C1'], domains: ['grammar', 'fluency'], objectives: ['Express wishes about present', 'Express regrets about past', 'Use if only'], estimatedMinutes: 10,
    triggerKeywords: ['wish', 'regret', 'if only', 'I wish I had', 'I wish I could'],
    steps: [
      { id: 's1', goal: 'Teach wish + past simple (present wishes)', approach: 'Discuss things you wish were different now', checkType: 'free-response', checkPrompt: 'What do you wish was different about your life right now?', successCriteria: 'Uses "I wish + past simple" correctly', failureAction: 'Model: "I wish I lived near the beach. I wish I had more time."' },
      { id: 's2', goal: 'Teach wish + past perfect (past regrets)', approach: 'Discuss things you regret or would change about the past', checkType: 'free-response', checkPrompt: 'Is there anything you wish you had done differently?', successCriteria: 'Uses "I wish I had + past participle"', failureAction: 'Model: "I wish I had studied harder. I wish I hadn\'t said that."' },
    ],
  },
  {
    id: 'causative-have-get', title: 'Causative (Have/Get something done)', blurb: 'I had my hair cut. I got my car fixed.', category: 'grammar', cefrRange: ['B2', 'C1'], domains: ['grammar', 'vocabulary'], objectives: ['Use have/get + object + past participle', 'Describe services done by others'], estimatedMinutes: 8,
    triggerKeywords: ['causative', 'have something done', 'get something done', 'had my hair cut'],
    steps: [
      { id: 's1', goal: 'Introduce causative structure', approach: 'Discuss services: haircuts, car repairs, house cleaning', checkType: 'fill-blank', checkPrompt: 'I __ my hair __ (cut) yesterday.', successCriteria: 'Correct: "had my hair cut"', failureAction: 'Explain: have + object + past participle = someone else does it for you' },
      { id: 's2', goal: 'Practice in conversation', approach: 'Discuss things you pay others to do vs things you do yourself', checkType: 'conversation', checkPrompt: 'What services do you use? What do you do yourself?', successCriteria: 'Uses causative 2+ times correctly', failureAction: 'Give examples: "I have my car washed. I get my clothes dry-cleaned."' },
    ],
  },
]

// ─── Vocabulary Templates ─────────────────────────────────────────────────────

const VOCABULARY_TEMPLATES: LessonTemplate[] = [
  {
    id: 'food-vocabulary',
    title: 'Food & Cooking Vocabulary',
    blurb: 'Learn to talk about food, cooking, and eating out.',
    category: 'vocabulary',
    cefrRange: ['A1', 'B1'],
    domains: ['vocabulary', 'fluency'],
    objectives: [
      'Name common foods and drinks',
      'Describe tastes and textures',
      'Order food and discuss preferences',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['food vocabulary', 'food words', 'cooking words', 'restaurant vocabulary', 'meals'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce 8-10 essential food words across categories (fruits, meats, drinks, basics)',
        approach: 'Teach words in context: "For breakfast I have... For lunch... For dinner..." Group by meal.',
        checkType: 'free-response',
        checkPrompt: 'What did you eat today? Tell me about your meals using the new words.',
        successCriteria: 'User uses at least 3 new food vocabulary words correctly',
        failureAction: 'List the words again grouped by category. Ask simpler: "Do you like ___? What\'s your favorite fruit?"',
        adaptations: {
          A1: '6 basic words only. Very common foods.',
          A2: '10 words including cooking verbs (fry, boil, bake).',
          B1: '12+ words including tastes (spicy, bland, savory) and textures.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice describing food preferences and tastes',
        approach: 'Ask about likes/dislikes. Introduce taste adjectives. Have user describe their favorite dish.',
        checkType: 'free-response',
        checkPrompt: 'Describe your favorite dish. What\'s in it? How does it taste? How is it cooked?',
        successCriteria: 'User describes a dish using 3+ food/taste vocabulary words',
        failureAction: 'Model describing YOUR favorite dish first. Then ask them to copy the pattern.',
      },
      {
        id: 'step-3',
        goal: 'Roleplay ordering food at a restaurant',
        approach: 'You are the waiter. Take their order. Ask about preferences, allergies, drinks. Make it realistic.',
        checkType: 'conversation',
        checkPrompt: 'Welcome! Here\'s the menu. What would you like to order?',
        successCriteria: 'User successfully orders a meal using appropriate vocabulary and polite forms',
        failureAction: 'Simplify: offer only 3 choices. Guide them through: "Would you like X or Y?"',
      },
      {
        id: 'step-4',
        goal: 'Discuss food culture and habits',
        approach: 'Ask about eating habits, food culture in their country, cooking at home vs eating out.',
        checkType: 'conversation',
        checkPrompt: 'Do you cook at home or eat out more? What\'s a typical meal in your country?',
        successCriteria: 'User sustains conversation about food using varied vocabulary for 3+ turns',
        failureAction: 'Ask simpler questions one at a time. Build up to longer answers.',
      },
    ],
  },
  {
    id: 'emotions-feelings',
    title: 'Emotions & Feelings',
    blurb: 'Express how you feel beyond just "good" and "bad".',
    category: 'vocabulary',
    cefrRange: ['A2', 'B2'],
    domains: ['vocabulary', 'fluency'],
    objectives: [
      'Express a range of emotions precisely',
      'Describe emotional states and their causes',
      'Use emotion vocabulary naturally in conversation',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['emotions', 'feelings', 'how to express feelings', 'emotional vocabulary', 'mood words'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce 10 emotion words beyond basic happy/sad/angry',
        approach: 'Teach: anxious, relieved, frustrated, excited, overwhelmed, grateful, nostalgic, embarrassed, proud, disappointed. Give context for each.',
        checkType: 'free-response',
        checkPrompt: 'When was the last time you felt frustrated? What about proud? Tell me about it.',
        successCriteria: 'User uses at least 2 new emotion words correctly in context',
        failureAction: 'Give scenarios: "How would you feel if you lost your phone? If you got a promotion?" Let them match emotions.',
        adaptations: {
          A2: '6 emotions only. Simple contexts.',
          B1: '10 emotions with cause-and-effect (I feel X because Y).',
          B2: '12+ emotions including nuanced ones (bittersweet, ambivalent).',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice expressing emotions with reasons',
        approach: 'Ask user to express emotions about different life situations. Push for "because" clauses.',
        checkType: 'free-response',
        checkPrompt: 'How do you feel about your job/studies right now? Why? Use specific emotion words.',
        successCriteria: 'User expresses 2+ emotions with reasons using new vocabulary',
        failureAction: 'Model: "I feel overwhelmed because I have too much work." Ask them to copy the pattern.',
      },
      {
        id: 'step-3',
        goal: 'Discuss emotional reactions to scenarios',
        approach: 'Present 3 scenarios. Ask how they would feel and why. Push for precise emotion words (not just happy/sad).',
        checkType: 'conversation',
        checkPrompt: 'How would you feel if: 1) You won a trip to Japan? 2) Your best friend moved away? 3) You had to give a speech to 500 people?',
        successCriteria: 'User uses varied, precise emotion vocabulary for each scenario',
        failureAction: 'Offer word choices: "Would you feel excited, nervous, or overwhelmed?" Let them pick and explain.',
      },
    ],
  },
]

// ─── Expressions & Culture Templates ──────────────────────────────────────────

const EXPRESSION_TEMPLATES: LessonTemplate[] = [
  {
    id: 'common-idioms',
    title: 'Common Idioms & Expressions',
    blurb: 'Sound more natural with everyday expressions natives actually use.',
    category: 'expressions',
    cefrRange: ['B1', 'C1'],
    domains: ['vocabulary', 'fluency'],
    objectives: [
      'Understand 8-10 common idioms in context',
      'Use idioms naturally in conversation',
      'Know when idioms are appropriate vs too informal',
    ],
    estimatedMinutes: 15,
    triggerKeywords: ['idioms', 'expressions', 'sound natural', 'native expressions', 'colloquial', 'slang'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce 5 common idioms with meaning and context',
        approach: 'Present each idiom in a natural sentence. Explain the literal vs figurative meaning. Show when to use it.',
        checkType: 'free-response',
        checkPrompt: 'Can you use one of these idioms in your own sentence about your life?',
        successCriteria: 'User correctly uses at least 1 idiom in appropriate context',
        failureAction: 'Give 3 situations and ask which idiom fits each. Then ask them to make their own sentence.',
        adaptations: {
          B1: '5 very common, easy-to-understand idioms.',
          B2: '7 idioms including some with cultural context.',
          C1: '10 idioms including formal/literary ones.',
        },
      },
      {
        id: 'step-2',
        goal: 'Match idioms to situations',
        approach: 'Give 5 situations. Ask user which idiom from step 1 fits each.',
        checkType: 'fill-blank',
        checkPrompt: 'Which expression fits? "My boss gave me 3 new projects today. I\'m ___" / "I studied all night but the exam was easy. It was ___"',
        successCriteria: 'User correctly matches at least 3 out of 5',
        failureAction: 'Review meanings. Give hints about each situation. Retry.',
      },
      {
        id: 'step-3',
        goal: 'Use idioms in natural conversation',
        approach: 'Have a conversation about work, life, or recent events. Challenge user to use at least 2 idioms naturally.',
        checkType: 'conversation',
        checkPrompt: 'Tell me about your week. Try to use some of the expressions we learned — but only where they fit naturally!',
        successCriteria: 'User uses 2+ idioms correctly and naturally in conversation',
        failureAction: 'Continue chatting. When a moment fits an idiom, hint: "This would be a perfect moment for one of our expressions..."',
      },
    ],
  },
  {
    id: 'polite-formal-register',
    title: 'Polite & Formal Register',
    blurb: 'Speak appropriately in professional and formal situations.',
    category: 'culture',
    cefrRange: ['A2', 'B2'],
    domains: ['vocabulary', 'fluency'],
    objectives: [
      'Use polite request forms',
      'Distinguish formal from informal register',
      'Navigate professional conversations appropriately',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['polite', 'formal', 'professional', 'register', 'how to be polite', 'formal language', 'business language'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce polite request forms vs direct commands',
        approach: 'Show the spectrum: rude → direct → polite → very formal. Give 3 examples of the same request at different registers.',
        checkType: 'free-response',
        checkPrompt: 'How would you politely ask a stranger for directions? Now how would you ask a close friend?',
        successCriteria: 'User demonstrates understanding of register difference with 2 versions of same request',
        failureAction: 'Give the formulas: "Can you...?" (neutral) vs "Could you possibly...?" (polite) vs "Would you mind...?" (very polite). Practice each.',
        adaptations: {
          A2: 'Focus on basic polite forms (please, could you, would you like).',
          B1: 'Add indirect requests and softeners.',
          B2: 'Add formal written register and professional email language.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice upgrading informal sentences to polite/formal',
        approach: 'Give 4 direct/informal sentences. Ask user to make them polite.',
        checkType: 'fill-blank',
        checkPrompt: 'Make these polite: "Give me the menu" → ? / "I want a coffee" → ? / "Move, you\'re in my way" → ?',
        successCriteria: 'User correctly upgrades at least 3 out of 4 to polite register',
        failureAction: 'Show the polite version of each. Explain the pattern. Give 3 new ones to try.',
      },
      {
        id: 'step-3',
        goal: 'Roleplay a formal situation (job interview, meeting a partner\'s parents, etc.)',
        approach: 'Roleplay a situation requiring formal register. Correct any register slips.',
        checkType: 'conversation',
        checkPrompt: 'Let\'s roleplay: you\'re meeting your partner\'s parents for the first time at dinner. I\'ll be the parent. Ready?',
        successCriteria: 'User maintains appropriate polite register throughout the roleplay',
        failureAction: 'Pause and explain: "In this situation, you\'d say X instead of Y because..." Then continue.',
      },
    ],
  },
  {
    id: 'numbers-money-time',
    title: 'Numbers, Money & Time',
    blurb: 'Handle numbers, prices, and time expressions confidently.',
    category: 'vocabulary',
    cefrRange: ['A1', 'A2'],
    domains: ['vocabulary', 'listening'],
    objectives: [
      'Use numbers 1-1000 confidently',
      'Talk about prices and money',
      'Tell time and discuss schedules',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['numbers', 'counting', 'money', 'prices', 'time', 'clock', 'schedule'],
    steps: [
      {
        id: 'step-1',
        goal: 'Practice numbers 1-100 through real contexts (age, phone numbers, addresses)',
        approach: 'Ask personal questions requiring numbers: age, phone number, address number, how many siblings. Make it conversational.',
        checkType: 'free-response',
        checkPrompt: 'Tell me: how old are you? What floor do you live on? How many people are in your family?',
        successCriteria: 'User correctly produces 3+ numbers in context',
        failureAction: 'Count together from 1-20. Then practice tens (20, 30, 40...). Build up gradually.',
      },
      {
        id: 'step-2',
        goal: 'Practice prices and money conversations',
        approach: 'Roleplay shopping. Ask "how much is this?" Give prices. Ask user to calculate totals.',
        checkType: 'conversation',
        checkPrompt: 'You\'re at a market. Ask me prices and buy 3 things. Tell me the total.',
        successCriteria: 'User asks prices and handles money vocabulary correctly',
        failureAction: 'Simplify: give only round numbers. Practice "how much" question form first.',
      },
      {
        id: 'step-3',
        goal: 'Tell time and discuss daily schedule',
        approach: 'Ask what time user does various activities. Practice both digital (3:30) and analog (half past three) forms.',
        checkType: 'free-response',
        checkPrompt: 'What time do you wake up? What time do you eat lunch? What time do you go to bed?',
        successCriteria: 'User correctly expresses 3+ times',
        failureAction: 'Show the time-telling pattern. Practice with clock images/descriptions. Start with hours only, add minutes.',
      },
    ],
  },
]

// ─── Conversation Skills Templates ────────────────────────────────────────────

const CONVERSATION_TEMPLATES: LessonTemplate[] = [
  {
    id: 'small-talk',
    title: 'Small Talk & Social Conversation',
    blurb: 'Navigate casual social situations with confidence.',
    category: 'conversation',
    cefrRange: ['A2', 'B2'],
    domains: ['fluency', 'vocabulary'],
    objectives: [
      'Start and maintain casual conversations',
      'Use appropriate small talk topics',
      'Know how to gracefully end conversations',
    ],
    estimatedMinutes: 12,
    triggerKeywords: ['small talk', 'casual conversation', 'social skills', 'how to chat', 'conversation starters'],
    steps: [
      {
        id: 'step-1',
        goal: 'Teach conversation starters and safe small talk topics',
        approach: 'Introduce 5 conversation starters (weather, weekend plans, work, travel, food). Show how to ask and respond.',
        checkType: 'free-response',
        checkPrompt: 'Imagine you meet a colleague in the elevator. Start a small talk conversation with me.',
        successCriteria: 'User initiates appropriate small talk and sustains 2+ exchanges',
        failureAction: 'Give 3 ready-made openers. Practice each one. Then try the elevator scenario again.',
        adaptations: {
          A2: 'Simple openers: weather, weekend. Short exchanges.',
          B1: 'Add follow-up questions and showing interest.',
          B2: 'Add cultural awareness of appropriate topics by country.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice showing interest and asking follow-up questions',
        approach: 'Model active listening: "Really? Tell me more!", "That sounds interesting!", "How was it?" Practice the pattern.',
        checkType: 'conversation',
        checkPrompt: 'I\'ll tell you about my weekend. Your job: show interest and ask follow-up questions. Ready?',
        successCriteria: 'User asks 2+ relevant follow-up questions and shows genuine interest',
        failureAction: 'Give a list of follow-up phrases. Practice using them one by one.',
      },
      {
        id: 'step-3',
        goal: 'Practice gracefully ending conversations',
        approach: 'Teach exit phrases: "Well, I should get going...", "It was nice chatting!", "Let\'s catch up soon!" Practice in context.',
        checkType: 'conversation',
        checkPrompt: 'We\'ve been chatting for a while. Now practice ending the conversation politely — you have to go.',
        successCriteria: 'User ends conversation naturally without being abrupt',
        failureAction: 'Give 3 exit phrases. Practice each in a mini-scenario.',
      },
    ],
  },
  {
    id: 'giving-opinions',
    title: 'Giving & Defending Opinions',
    blurb: 'Express what you think, agree, disagree, and explain why.',
    category: 'conversation',
    cefrRange: ['B1', 'C1'],
    domains: ['fluency', 'grammar'],
    objectives: [
      'Express opinions clearly',
      'Agree and disagree politely',
      'Support opinions with reasons',
    ],
    estimatedMinutes: 15,
    triggerKeywords: ['opinions', 'how to disagree', 'expressing views', 'agree disagree', 'debate', 'arguments'],
    steps: [
      {
        id: 'step-1',
        goal: 'Introduce opinion phrases at different strength levels',
        approach: 'Show the spectrum: "I think..." (mild) → "I believe..." (moderate) → "I\'m convinced..." (strong). Plus hedging: "It seems to me...", "I might be wrong but..."',
        checkType: 'free-response',
        checkPrompt: 'Give me your opinion on this: "Social media is bad for young people." Use one of the phrases we learned.',
        successCriteria: 'User expresses an opinion using an appropriate opinion phrase',
        failureAction: 'Give the phrases again. Ask a simpler question: "Do you prefer cats or dogs? Why?"',
        adaptations: {
          B1: 'Focus on basic opinion phrases and simple reasons.',
          B2: 'Add hedging, conceding points, and counter-arguments.',
          C1: 'Add nuanced positions, acknowledging complexity.',
        },
      },
      {
        id: 'step-2',
        goal: 'Practice agreeing and disagreeing politely',
        approach: 'Give 3 statements. Ask user to agree with one and disagree with another — politely. Teach phrases for both.',
        checkType: 'free-response',
        checkPrompt: 'Do you agree or disagree? 1) "Working from home is better than office work" 2) "Everyone should learn a second language" 3) "AI will replace most jobs"',
        successCriteria: 'User agrees/disagrees using appropriate phrases with reasons',
        failureAction: 'Give agreement phrases (I agree because..., That\'s a good point...) and disagreement phrases (I see your point but..., I\'m not sure about that...). Retry.',
      },
      {
        id: 'step-3',
        goal: 'Have a mini-debate on a topic',
        approach: 'Pick a debatable topic. Take the opposite position from the user. Push them to defend their view with reasons.',
        checkType: 'conversation',
        checkPrompt: 'Let\'s debate: I\'ll take the opposite side of whatever you believe. Topic: "Is it better to travel alone or with friends?"',
        successCriteria: 'User sustains 3+ turns defending their opinion with reasons and responding to counter-arguments',
        failureAction: 'Simplify: ask yes/no opinion questions first, then ask "why?" for each.',
      },
    ],
  },
]

// ─── Combined export ──────────────────────────────────────────────────────────

export const LESSON_TEMPLATES: LessonTemplate[] = [
  ...GRAMMAR_TEMPLATES,
  ...VOCABULARY_TEMPLATES,
  ...EXPRESSION_TEMPLATES,
  ...CONVERSATION_TEMPLATES,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLessonById(id: string): LessonTemplate | undefined {
  return LESSON_TEMPLATES.find((t) => t.id === id)
}

export function getLessonsByCategory(category: LessonCategory): LessonTemplate[] {
  return LESSON_TEMPLATES.filter((t) => t.category === category)
}

/**
 * Find lessons appropriate for a given CEFR level.
 */
export function getLessonsForLevel(cefr: CefrLevel): LessonTemplate[] {
  const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const idx = CEFR_ORDER.indexOf(cefr)
  return LESSON_TEMPLATES.filter((t) => {
    const minIdx = CEFR_ORDER.indexOf(t.cefrRange[0])
    const maxIdx = CEFR_ORDER.indexOf(t.cefrRange[1])
    return idx >= minIdx && idx <= maxIdx
  })
}

/**
 * Find a lesson that matches a user's request (keyword matching).
 * Returns the best match or undefined if no match found.
 */
export function findLessonByRequest(userText: string): LessonTemplate | undefined {
  const lower = userText.toLowerCase()
  
  // Score each template by how many trigger keywords match
  let bestMatch: LessonTemplate | undefined
  let bestScore = 0

  for (const template of LESSON_TEMPLATES) {
    let score = 0
    for (const keyword of template.triggerKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += keyword.length // Longer matches score higher
      }
    }
    // Also check title match
    if (lower.includes(template.title.toLowerCase())) {
      score += template.title.length * 2
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = template
    }
  }

  return bestScore > 0 ? bestMatch : undefined
}

/**
 * Get lessons that target a specific weak domain.
 */
export function getLessonsForWeakDomain(domain: SkillDomain, cefr: CefrLevel): LessonTemplate[] {
  return getLessonsForLevel(cefr).filter((t) => t.domains.includes(domain))
}

/**
 * Check if a lesson is applicable for a given target language.
 */
export function isLessonApplicable(lesson: LessonTemplate, targetLanguage: string): boolean {
  if (!lesson.excludeLanguages || lesson.excludeLanguages.length === 0) return true
  return !lesson.excludeLanguages.includes(targetLanguage)
}
