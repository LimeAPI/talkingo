// ─── Conversation Types ───────────────────────────────────────────────────────

export type CorrectionRootCause = 'careless' | 'knowledge-gap' | 'l1-interference' | 'overgeneralization'

export interface Correction {
  original: string
  corrected: string
  type: 'grammar' | 'vocabulary' | 'pronunciation' | 'naturalness'
  /** Why this error happened — helps track patterns and provide targeted remediation */
  rootCause?: CorrectionRootCause
  note?: string
}

/**
 * "Caught You" — phrases that were grammatically correct but pragmatically wrong,
 * unnatural, or textbook-stiff. Surfaced at recap time so the user notices the
 * gap between passing-the-exam speech and sounding-like-a-person speech.
 */
export interface NativeAlternative {
  /** What the user actually said */
  userPhrase: string
  /** How a native speaker would have phrased it */
  nativeAlternative: string
  /** One-sentence why */
  why: string
  /** Register of the alternative */
  register: 'casual' | 'natural' | 'formal' | 'expressive'
}

/**
 * Three rewrites of the same idea across registers — used by "Say it like a native".
 */
export interface RegisterAlternatives {
  casual: string
  natural: string
  expressive: string
}

export interface VocabItem {
  term: string
  gloss: string
  romanization?: string
  example?: string
}

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MessageAudio {
  /** Lifecycle of the TTS request for this message. */
  status: AudioStatus
  /** Base64-encoded audio data returned by /api/gemini/tts. */
  data?: string
  /** Audio format: 'mp3' (Edge TTS) or 'pcm' (Gemini fallback). Default: 'pcm'. */
  format?: 'mp3' | 'pcm'
  /** Sample rate of the PCM data — 24000 by default for Gemini TTS. Ignored for MP3. */
  sampleRate?: number
  /** Total duration in milliseconds, available once decoded. */
  durationMs?: number
  /** Pre-sampled waveform amplitudes (0..1), ~50 buckets. */
  waveform?: number[]
  /** Voice that was used (for replay consistency). */
  voiceName?: string
}

export interface ConversationMessage {
  id: string
  text: string
  isUser: boolean
  corrections?: Correction[]
  vocab?: VocabItem[]
  translation?: string
  emotion?: string
  timestamp?: number
  /** Voice note attached to this message (AI replies in chat modes). */
  audio?: MessageAudio
  /** Teaching card — shown below AI messages when there's something to teach. */
  teachingNote?: TeachingNote | null
}

export type LanguageLevel = 'beginner' | 'intermediate' | 'advanced'
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type CorrectionStyle = 'direct' | 'silent'
export type SkillDomain = 'vocabulary' | 'grammar' | 'fluency' | 'listening'
export type ScriptPreference = 'native' | 'latin' | 'both'
export type LearnerGender = 'masculine' | 'feminine'

export type ConversationTopic =
  | 'food' | 'travel' | 'music' | 'sports' | 'work' | 'culture' | 'general'

export type LearningGoal = 'travel' | 'career' | 'daily-life' | 'academic' | 'cultural'

export type TargetLanguage =
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'nl' | 'pl' | 'ro' | 'ru' | 'uk'
  | 'ja' | 'ko' | 'zh' | 'hi' | 'bn' | 'id' | 'mr' | 'ta' | 'te' | 'th' | 'vi'
  | 'ar' | 'tr'

export const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  en: 'English (US)', es: 'Spanish (Spain)', fr: 'French (France)',
  de: 'German (Germany)', it: 'Italian (Italy)', nl: 'Dutch (Netherlands)',
  pl: 'Polish (Poland)', ro: 'Romanian (Romania)', ru: 'Russian (Russia)',
  uk: 'Ukrainian (Ukraine)', ja: 'Japanese (Japan)', ko: 'Korean (South Korea)',
  zh: 'Mandarin Chinese (China & Taiwan)', hi: 'Hindi (India)',
  bn: 'Bengali (Bangladesh)', id: 'Indonesian (Indonesia)', mr: 'Marathi (India)',
  ta: 'Tamil (India)', te: 'Telugu (India)', th: 'Thai (Thailand)',
  vi: 'Vietnamese (Vietnam)', ar: 'Arabic (Egypt)', tr: 'Turkish (Turkey)',
}

export type PersonaId = 'eli' | 'alex' | 'dr-luma' | 'sofia' | 'riko' | 'marco'

export type PersonaRegister = 'casual' | 'mixed' | 'formal'

export interface PersonaUnlockCondition {
  /** Domain that must reach the given level for this persona to be available */
  domain: SkillDomain
  level: CefrLevel
}

export interface AIPersona {
  id: PersonaId
  name: string
  /** One-line tagline shown in the picker */
  description: string

  // ── identity (NEW) ─────────────────────────────────────────────────────────
  /** Approximate age — used for voice/topic calibration */
  age: number
  /** Where they live (city + country) — drives dialect and topic affinities */
  locale: string
  /** 2-3 sentence biography. Concrete: job, neighborhood, daily life. */
  backstory: string
  /** Default register — how formal they speak */
  register: PersonaRegister
  /** Words/phrases they'd reach for naturally (idioms, fillers, slang) */
  slangBank: string[]
  /** Topics they care about and reach for in conversation */
  topicAffinities: string[]
  /** Catchphrases that should appear ~1x per session */
  verbalTics: string[]
  /** Topics this character refuses to engage with (stays in character) */
  forbiddenTopics: string[]
  /** Languages where this persona is appropriate. Empty = all. */
  supportedLanguages?: TargetLanguage[]
  /** Optional gating condition; undefined = unlocked from the start */
  unlockCondition?: PersonaUnlockCondition

  // ── presentation ───────────────────────────────────────────────────────────
  personality: string
  conversationStyle: string
  /** How this persona teaches when a lesson path is active */
  teachingApproach?: string
  specialization: string
  avatarColor: string
  avatarGradient: string
  gender: 'male' | 'female'
  dicebearStyle: string
  dicebearSeed: string
  voiceName: string
}

// ─── Per-domain CEFR learner model ───────────────────────────────────────────

/**
 * Per-domain CEFR scores. Each domain is tracked independently so the AI
 * can scaffold "A2 vocabulary but A1 grammar" correctly.
 */
export interface DomainScores {
  vocabulary: CefrLevel
  grammar: CefrLevel
  fluency: CefrLevel
  listening: CefrLevel
}

export const DEFAULT_DOMAIN_SCORES: DomainScores = {
  vocabulary: 'A1',
  grammar: 'A1',
  fluency: 'A1',
  listening: 'A1',
}

/**
 * A single vocabulary item tracked in the spaced repetition system.
 */
export interface TrackedVocabItem {
  /** The word/phrase in the target language */
  term: string
  /** English gloss */
  gloss: string
  /** Session number when last seen */
  lastSeenSession: number
  /** How many times the user has used it correctly */
  timesCorrect: number
  /** SRS status */
  status: 'new' | 'learning' | 'mastered' | 'forgotten'
}

// ─── Conversation State ───────────────────────────────────────────────────────

export interface ConversationState {
  level: LanguageLevel
  cefr?: CefrLevel
  /** Talkingo 12-level system (1-12). Takes priority over CEFR when set. */
  talkingoLevel?: number
  /** Per-domain CEFR scores — the real adaptive signal */
  domainScores?: DomainScores
  topic: ConversationTopic | string
  correctionStyle: CorrectionStyle
  flowScore: number
  persona?: PersonaId
  userName?: string
  targetLanguage?: TargetLanguage
  /** User's native language — for L1 interference awareness */
  nativeLanguage?: TargetLanguage | string
  learningGoal?: LearningGoal
  currentUnitId?: string
  /** Words the user has used correctly (for prompt injection) */
  masteredWords?: string[]
  /** Words due for spaced repetition review this session */
  reviewWords?: string[]
  /** Recurring weak patterns */
  weakPatterns?: string[]
  /** Current session number (used by SRS) */
  sessionNumber?: number
  /**
   * Ambient vocab injection — a single phrase the AI is instructed to use
   * naturally N times this session without explaining it. Used by Feature 2.
   */
  plantedPhrase?: { term: string; gloss: string; targetUses: number } | null
  /**
   * Rolling memory summary the AI has of this user across past sessions
   * with the SAME persona. Used by Feature 4 (story continuity).
   */
  characterMemory?: {
    summary: string
    lastTopics: string[]
    factsToReference: string[]
  } | null
  /**
   * Active lesson path — when set, the AI follows a structured teaching plan.
   * Null/undefined = normal conversation (AI still teaches opportunistically).
   */
  lessonPath?: {
    lessonId: string
    title: string
    currentStep: number
    totalSteps: number
    /** Brief summary of what's been covered so far */
    summary: string
    /** The current step's goal and approach for the AI */
    currentStepGoal: string
    currentStepApproach: string
    currentStepCheck: string
  } | null
}

export interface UserPreferences {
  level: LanguageLevel
  cefr?: CefrLevel
  domainScores?: DomainScores
  topic: ConversationTopic | string
  correctionStyle: CorrectionStyle
  persona?: PersonaId
  userName?: string
  targetLanguage?: TargetLanguage
  /** User's native language — used for L1 interference awareness and targeted explanations */
  nativeLanguage?: TargetLanguage | string
  learningGoal?: LearningGoal
  onboardingComplete?: boolean
  currentUnitId?: string
  /** Preferred script for non-Latin languages: 'native', 'latin' (romanized), or 'both' */
  preferredScript?: ScriptPreference
  /** Learner's grammatical gender for languages with gender agreement (French, Spanish, Arabic, etc.) */
  learnerGender?: LearnerGender
}

// ─── Progress / Session Tracking ──────────────────────────────────────────────

/**
 * Structured weak pattern with type safety.
 * Replaces the old string[] approach for better AI guidance and UI display.
 */
export interface WeakPattern {
  /** Pattern category: grammar, vocabulary, pronunciation, or syntax */
  type: 'grammar' | 'vocabulary' | 'pronunciation' | 'syntax'
  /** Specific issue (e.g., "past_tense", "articles", "word_order") */
  category: string
  /** Human-readable description for the user */
  description: string
  /** Last 3 example errors from the user */
  examples: string[]
  /** How many times this pattern appeared this week */
  frequency: number
  /** Severity level for prioritization */
  severity: 'low' | 'medium' | 'high'
  /** ISO date when last seen */
  lastSeen: string
}

export interface LanguageProgress {
  targetLanguage: TargetLanguage
  /** Overall CEFR (derived from domainScores) */
  cefr: CefrLevel
  /** Per-domain CEFR scores */
  domainScores: DomainScores
  currentUnitId: string
  completedUnits: string[]
  /** Completed lesson template IDs (structured teaching) */
  completedLessons?: string[]
  /** Spaced repetition vocabulary tracker */
  trackedVocab: TrackedVocabItem[]
  /** Recurring weak grammar/usage patterns (structured) */
  weakPatterns: WeakPattern[]
  totalSessions: number
  totalMinutes: number
  streakDays: number
  lastSessionAt?: number
  /** For auto re-assessment trigger */
  sessionsSinceLastAssessment: number
}

export interface SessionRecap {
  durationSeconds: number
  unitId: string
  unitTitle: string
  vocabSeen: VocabItem[]
  topCorrections: Correction[]
  grammarTried: string[]
  encouragement: string
  unitComplete: boolean
  nextFocus: string
  /** "Caught You" — phrases that were correct but unnatural */
  nativeWouldSay?: NativeAlternative[]
  /** Planted phrases the user encountered ambiently (Feature 2) */
  plantedPhraseRecap?: {
    term: string
    gloss: string
    timesUsed: number
  } | null
  /** Domain score deltas from this session */
  domainDeltas?: Partial<Record<SkillDomain, number>>
}

// ─── Character Memory (story continuity) ─────────────────────────────────────

/**
 * Per-character rolling memory. One row per (user × persona × language).
 * Updated after every session. Used to open future sessions with personal
 * references ("How did the interview go?").
 */
export interface CharacterMemory {
  userId: string
  personaId: PersonaId
  targetLanguage: TargetLanguage
  /** Rolling 200-word summary of the user's life from this character's POV */
  summary: string
  /** Discrete facts the character knows: "user has a cat named Miso" */
  facts: { fact: string; sessionNumber: number }[]
  /** What was discussed last session — drives "follow up" openers */
  lastTopics: string[]
  lastSessionAt?: number
  sessionsCount: number
}

// ─── Phrase bank (Steal This Phrase) ─────────────────────────────────────────

/**
 * A full sentence the user "stole" from a character. Stored with context so
 * the user can browse phrases like a scrapbook.
 */
export interface TrackedPhrase {
  id: string
  /** The full sentence as the AI said it */
  fullSentence: string
  /** The new word/phrase highlighted inside the sentence */
  highlightTerm: string
  gloss: string
  /** Which character said it */
  characterId: PersonaId
  /** The seed/scenario it came up in */
  seedId: string
  /** What the user had said right before, for context */
  userTurnBefore?: string
  /** Cached audio (Appwrite Storage URL) */
  audioUrl?: string
  /** User-marked favorite */
  isFavorite: boolean
  /** Timestamp added */
  addedAt: number
  /** Last replayed (for SRS) */
  lastReplayedAt?: number
  replayCount: number
}



export interface SessionAnalytics {
  sessionId: string
  userId: string
  targetLanguage: TargetLanguage
  seedId: string
  seedTitle: string
  durationSeconds: number
  messageCount: number
  correctionCount: number
  vocabIntroduced: number
  unitComplete: boolean
  /** Domain scores before this session */
  domainScoresBefore: DomainScores
  /** Domain scores after this session */
  domainScoresAfter: DomainScores
  /** Was the session abandoned (< 2 min)? */
  abandoned: boolean
  timestamp: number
}

// ─── Gemini Response Types ────────────────────────────────────────────────────

export interface TeachingNote {
  type: 'correction' | 'expression' | 'grammar' | 'idiom' | 'culture'
  title: string
  content: string
}

export interface GeminiConversationResponse {
  aiResponse: string
  translation?: string
  corrections: Correction[]
  vocab?: VocabItem[]
  emotion: string
  unitComplete?: boolean
  domainSignals?: Partial<Record<SkillDomain, 'up' | 'same' | 'down'>>
  teachingNote?: TeachingNote | null
}

export interface GeminiOpenerResponse {
  aiResponse: string
  translation?: string
  emotion: string
  vocab?: VocabItem[]
}

export interface GeminiAssessmentResponse {
  cefr: CefrLevel
  level: LanguageLevel
  domainScores: DomainScores
  weakPatterns: string[]
  encouragement: string
}

// ─── Onboarding conversation ──────────────────────────────────────────────────

export interface OnboardingTurn {
  role: 'ai' | 'user'
  text: string
}

// ─── User / Auth Types ────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  displayName?: string
  preferences?: UserPreferences
  createdAt: string
}

export type SubscriptionPlan = 'free' | 'pro'
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due'

export interface Subscription {
  userId: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  renewsAt?: string
}
