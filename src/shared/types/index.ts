// ─── Progress / Session Tracking ──────────────────────────────────────────────

export interface LanguageProgress {
  talkingoLevel: number
  completedLessons?: string[]
  streakDays?: number
  totalSessions?: number
  totalMinutes?: number
}

// ─── Conversation Types ───────────────────────────────────────────────────────

export type CorrectionRootCause = 'careless' | 'knowledge-gap' | 'l1-interference' | 'overgeneralization'

export interface Correction {
  original: string
  corrected: string
  type: 'grammar' | 'vocabulary' | 'pronunciation' | 'naturalness'
  rootCause?: CorrectionRootCause
  note?: string
}

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MessageAudio {
  status: AudioStatus
  data?: string
  format?: 'mp3' | 'pcm'
  sampleRate?: number
  durationMs?: number
  waveform?: number[]
  voiceName?: string
}

export interface ConversationMessage {
  id: string
  text: string
  isUser: boolean
  corrections?: Correction[]
  timestamp?: number
  audio?: MessageAudio
  isInterruption?: boolean
  /** Target-language words/phrases the AI used this turn worth practicing.
   *  Drives real vocabulary tracking (set on AI messages only). */
  keyWords?: string[]
}

export type LanguageLevel = 'beginner' | 'intermediate' | 'advanced'
export type ScriptPreference = 'native' | 'latin' | 'both'
export type LearnerGender = 'masculine' | 'feminine'

export type TargetLanguage =
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'nl' | 'pl' | 'ro' | 'ru' | 'uk'
  | 'ja' | 'ko' | 'zh' | 'hi' | 'bn' | 'id' | 'mr' | 'ta' | 'te' | 'th' | 'vi'
  | 'ar' | 'tr'
  // Tier 1 additions
  | 'ur' | 'pt' | 'fa' | 'sw' | 'pa'
  // Tier 2 additions
  | 'tl' | 'hu' | 'el' | 'he'

// Dialect variant type for Arabic, Spanish, and Portuguese regional variations
export type DialectVariant =
  | 'ar-EG' | 'ar-LB' | 'ar-SA'   // Arabic: Egyptian, Levantine, Gulf
  | 'es-ES' | 'es-MX'             // Spanish: Spain, Latin American
  | 'pt-BR' | 'pt-PT'             // Portuguese: Brazil, Portugal

// Heritage mode supported languages
export type HeritageLanguage = 'ur' | 'hi' | 'ar' | 'pa' | 'fa' | 'tl' | 'el' | 'he' | 'pt'

export const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  en: 'English (US)', es: 'Spanish (Spain)', fr: 'French (France)',
  de: 'German (Germany)', it: 'Italian (Italy)', nl: 'Dutch (Netherlands)',
  pl: 'Polish (Poland)', ro: 'Romanian (Romania)', ru: 'Russian (Russia)',
  uk: 'Ukrainian (Ukraine)', ja: 'Japanese (Japan)', ko: 'Korean (South Korea)',
  zh: 'Mandarin Chinese (China & Taiwan)', hi: 'Hindi (India)',
  bn: 'Bengali (Bangladesh)', id: 'Indonesian (Indonesia)', mr: 'Marathi (India)',
  ta: 'Tamil (India)', te: 'Telugu (India)', th: 'Thai (Thailand)',
  vi: 'Vietnamese (Vietnam)', ar: 'Arabic (Egypt)', tr: 'Turkish (Turkey)',
  // Tier 1 additions
  ur: 'Urdu (Pakistan)', pt: 'Portuguese (Brazil)', fa: 'Persian (Iran)',
  sw: 'Swahili (Tanzania)', pa: 'Punjabi (India)',
  // Tier 2 additions
  tl: 'Filipino (Philippines)', hu: 'Hungarian (Hungary)',
  el: 'Greek (Greece)', he: 'Hebrew (Israel)',
}

export type PersonaId = 'eli' | 'alex' | 'dr-luma' | 'sofia' | 'riko' | 'marco'

export type PersonaRegister = 'casual' | 'mixed' | 'formal'

export interface AIPersona {
  id: PersonaId
  name: string
  description: string
  personality: string
  conversationStyle: string
  gender: 'male' | 'female'
  voiceName: string
  sampleSentence?: string
}

// ─── Conversation State ───────────────────────────────────────────────────────

export interface ConversationState {
  talkingoLevel: number
  persona?: PersonaId
  userName?: string
  targetLanguage?: TargetLanguage
  nativeLanguage?: TargetLanguage | string
  /** How the learner wishes to be grammatically addressed in gendered languages. */
  learnerGender?: LearnerGender
  currentUnitId?: string
  customPrompt?: string
  memoryLifeline?: string
  userNotes?: string
  /** Structured memory planner injection (replaces memoryLifeline when available) */
  practiceTargets?: string
  /** User's preferred script for non-Latin languages */
  preferredScript?: ScriptPreference
  /**
   * Transient, per-request adaptive signal. Set when the learner is struggling
   * (high recent correction rate) so the AI eases up for the next reply.
   * Not persisted.
   */
  _adaptiveHint?: 'high-error-rate'
  /**
   * Transient, per-request teaching nudge from the live Session Coach. A short
   * instruction telling the AI to create ONE natural opening for an unused
   * target word, or to model a just-corrected form again — never to drill,
   * quiz, or announce it. Not persisted.
   */
  _coachNudge?: string
  /**
   * Transient, per-request flag set when the learner is returning to a scenario
   * they've already started (the "Continue / pick up where you left off" path).
   * Used only to shape the opener so it greets like resuming a topic together
   * rather than starting cold. Not persisted.
   */
  _resumeScenario?: boolean
}

export interface UserPreferences {
  talkingoLevel?: number
  level?: LanguageLevel
  persona?: PersonaId
  userName?: string
  targetLanguage?: TargetLanguage
  nativeLanguage?: TargetLanguage | string
  onboardingComplete?: boolean
  currentUnitId?: string
  preferredScript?: ScriptPreference
  learnerGender?: LearnerGender
  // ── Reserved for future features ─────────────────────────────────────────
  // Persisted, but NOT yet wired into conversation behavior. Keep these: the
  // supporting library code already exists (heritage persona overlay in
  // gemini/personas.ts, dialect→voice mapping in languages/dialects.ts +
  // edge-tts-service). They are intentionally not read by getSystemInstruction
  // or the voice path yet — turn them on when those features ship.
  dialect?: DialectVariant
  heritageMode?: boolean
  uiLanguage?: string  // ISO 639-1 code for UI localization
  /** Per-language scenario-path progress as a compact code map, JSON-serialized:
   *  '{"es":"v1:<sig>:<base64>","fr":"..."}'. Enables cross-device path restore. */
  pathProgress?: string
}

// ─── Gemini Response Types ────────────────────────────────────────────────────

export interface GeminiConversationResponse {
  aiResponse: string
  corrections: Correction[]
  unitComplete?: boolean
  memoryUpdate?: string
  responseParts?: string[]
  /** Up to 3 target-language words/phrases the AI used worth practicing. */
  keyWords?: string[]
}

export interface GeminiOpenerResponse {
  aiResponse: string
}

export interface GeminiAssessmentResponse {
  talkingoLevel: number
  encouragement: string
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
