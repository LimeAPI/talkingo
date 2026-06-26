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
}

export type LanguageLevel = 'beginner' | 'intermediate' | 'advanced'
export type CorrectionStyle = 'direct' | 'silent'
export type ScriptPreference = 'native' | 'latin' | 'both'
export type LearnerGender = 'masculine' | 'feminine'

export type ConversationTopic =
  | 'food' | 'travel' | 'music' | 'sports' | 'work' | 'culture' | 'general'

export type LearningGoal = 'travel' | 'career' | 'daily-life' | 'academic' | 'cultural'

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
  topic: ConversationTopic | string
  correctionStyle: CorrectionStyle
  persona?: PersonaId
  userName?: string
  targetLanguage?: TargetLanguage
  nativeLanguage?: TargetLanguage | string
  learningGoal?: LearningGoal
  currentUnitId?: string
  customPrompt?: string
  memoryLifeline?: string
  userNotes?: string
  /** Structured memory planner injection (replaces memoryLifeline when available) */
  practiceTargets?: string
  /** User's preferred script for non-Latin languages */
  preferredScript?: ScriptPreference
}

export interface UserPreferences {
  talkingoLevel?: number
  level?: LanguageLevel
  topic: ConversationTopic | string
  correctionStyle: CorrectionStyle
  persona?: PersonaId
  userName?: string
  targetLanguage?: TargetLanguage
  nativeLanguage?: TargetLanguage | string
  learningGoal?: LearningGoal
  onboardingComplete?: boolean
  currentUnitId?: string
  preferredScript?: ScriptPreference
  learnerGender?: LearnerGender
  dialect?: DialectVariant
  heritageMode?: boolean
  uiLanguage?: string  // ISO 639-1 code for UI localization
}

// ─── Gemini Response Types ────────────────────────────────────────────────────

export interface GeminiConversationResponse {
  aiResponse: string
  corrections: Correction[]
  unitComplete?: boolean
  memoryUpdate?: string
  responseParts?: string[]
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
