import type { TargetLanguage } from '../types'

/**
 * Per-language metadata used across the app:
 *  - bcp47:        Web Speech API recognition + Gemini TTS languageCode
 *  - native:       endonym shown in the picker
 *  - english:      English label
 *  - script:       'latin' | 'non-latin' — controls romanisation hints
 *  - direction:    'ltr' | 'rtl'
 *  - sampleHello:  used as a fallback opener if the network is down
 *  - supportedScripts: which scripts this language supports for learning
 *  - hasGrammaticalGender: whether this language requires gender agreement
 */
export interface LanguageMeta {
  code: TargetLanguage
  bcp47: string
  english: string
  native: string
  script: 'latin' | 'non-latin'
  direction: 'ltr' | 'rtl'
  sampleHello: string
  /** Which scripts are available for this language. Default: ['native'] */
  supportedScripts?: Array<'native' | 'latin'>
  /** Whether this language has grammatical gender (affects adjective/verb agreement) */
  hasGrammaticalGender?: boolean
}

export const LANGUAGES: Record<TargetLanguage, LanguageMeta> = {
  // Americas & Europe
  en: { code: 'en', bcp47: 'en-US', english: 'English (US)',          native: 'English',     script: 'latin',     direction: 'ltr', sampleHello: 'Hi! Ready to chat?' },
  es: { code: 'es', bcp47: 'es-ES', english: 'Spanish (Spain)',       native: 'Español',     script: 'latin',     direction: 'ltr', sampleHello: '¡Hola! ¿Listo para charlar?', hasGrammaticalGender: true },
  fr: { code: 'fr', bcp47: 'fr-FR', english: 'French (France)',       native: 'Français',    script: 'latin',     direction: 'ltr', sampleHello: 'Salut ! On discute ?', hasGrammaticalGender: true },
  de: { code: 'de', bcp47: 'de-DE', english: 'German (Germany)',      native: 'Deutsch',     script: 'latin',     direction: 'ltr', sampleHello: 'Hallo! Bereit zu plaudern?', hasGrammaticalGender: true },
  it: { code: 'it', bcp47: 'it-IT', english: 'Italian (Italy)',       native: 'Italiano',    script: 'latin',     direction: 'ltr', sampleHello: 'Ciao! Pronto a chiacchierare?', hasGrammaticalGender: true },
  nl: { code: 'nl', bcp47: 'nl-NL', english: 'Dutch (Netherlands)',   native: 'Nederlands',  script: 'latin',     direction: 'ltr', sampleHello: 'Hoi! Zin in een gesprek?' },
  pl: { code: 'pl', bcp47: 'pl-PL', english: 'Polish (Poland)',       native: 'Polski',      script: 'latin',     direction: 'ltr', sampleHello: 'Cześć! Pogadamy?', hasGrammaticalGender: true },
  ro: { code: 'ro', bcp47: 'ro-RO', english: 'Romanian (Romania)',    native: 'Română',      script: 'latin',     direction: 'ltr', sampleHello: 'Salut! Stăm de vorbă?', hasGrammaticalGender: true },
  ru: { code: 'ru', bcp47: 'ru-RU', english: 'Russian (Russia)',      native: 'Русский',     script: 'non-latin', direction: 'ltr', sampleHello: 'Привет! Поговорим?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  uk: { code: 'uk', bcp47: 'uk-UA', english: 'Ukrainian (Ukraine)',   native: 'Українська',  script: 'non-latin', direction: 'ltr', sampleHello: 'Привіт! Поговоримо?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },

  // Asia & Pacific
  ja: { code: 'ja', bcp47: 'ja-JP', english: 'Japanese (Japan)',      native: '日本語',       script: 'non-latin', direction: 'ltr', sampleHello: 'こんにちは！話しましょう。', supportedScripts: ['native', 'latin'] },
  ko: { code: 'ko', bcp47: 'ko-KR', english: 'Korean (South Korea)',  native: '한국어',       script: 'non-latin', direction: 'ltr', sampleHello: '안녕하세요! 이야기할까요?', supportedScripts: ['native', 'latin'] },
  zh: { code: 'zh', bcp47: 'zh-CN', english: 'Mandarin Chinese',      native: '中文',         script: 'non-latin', direction: 'ltr', sampleHello: '你好！我们聊聊吧。', supportedScripts: ['native', 'latin'] },
  hi: { code: 'hi', bcp47: 'hi-IN', english: 'Hindi (India)',         native: 'हिन्दी',        script: 'non-latin', direction: 'ltr', sampleHello: 'नमस्ते! बात करें?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  bn: { code: 'bn', bcp47: 'bn-IN', english: 'Bengali (Bangladesh)',  native: 'বাংলা',        script: 'non-latin', direction: 'ltr', sampleHello: 'হ্যালো! কথা বলবো?', supportedScripts: ['native', 'latin'] },
  id: { code: 'id', bcp47: 'id-ID', english: 'Indonesian (Indonesia)', native: 'Bahasa Indonesia', script: 'latin', direction: 'ltr', sampleHello: 'Halo! Mau ngobrol?' },
  mr: { code: 'mr', bcp47: 'mr-IN', english: 'Marathi (India)',       native: 'मराठी',        script: 'non-latin', direction: 'ltr', sampleHello: 'नमस्कार! गप्पा मारूया?', supportedScripts: ['native', 'latin'] },
  ta: { code: 'ta', bcp47: 'ta-IN', english: 'Tamil (India)',         native: 'தமிழ்',         script: 'non-latin', direction: 'ltr', sampleHello: 'வணக்கம்! பேசலாம்?', supportedScripts: ['native', 'latin'] },
  te: { code: 'te', bcp47: 'te-IN', english: 'Telugu (India)',        native: 'తెలుగు',        script: 'non-latin', direction: 'ltr', sampleHello: 'నమస్తే! మాట్లాడదామా?', supportedScripts: ['native', 'latin'] },
  th: { code: 'th', bcp47: 'th-TH', english: 'Thai (Thailand)',       native: 'ไทย',          script: 'non-latin', direction: 'ltr', sampleHello: 'สวัสดี! คุยกันไหม?', supportedScripts: ['native', 'latin'] },
  vi: { code: 'vi', bcp47: 'vi-VN', english: 'Vietnamese (Vietnam)',  native: 'Tiếng Việt',  script: 'latin',     direction: 'ltr', sampleHello: 'Xin chào! Trò chuyện nhé?' },

  // Middle East & Africa
  ar: { code: 'ar', bcp47: 'ar-EG', english: 'Arabic (Egypt)',        native: 'العربية',       script: 'non-latin', direction: 'rtl', sampleHello: 'مرحبًا! نتحدث؟', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  tr: { code: 'tr', bcp47: 'tr-TR', english: 'Turkish (Turkey)',      native: 'Türkçe',      script: 'latin',     direction: 'ltr', sampleHello: 'Merhaba! Sohbet edelim mi?' },

  // Tier 1 additions
  ur: { code: 'ur', bcp47: 'ur-PK', english: 'Urdu (Pakistan)',       native: 'اردو',          script: 'non-latin', direction: 'rtl', sampleHello: 'السلام علیکم! بات کریں؟', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  pt: { code: 'pt', bcp47: 'pt-BR', english: 'Portuguese (Brazil)',   native: 'Português',   script: 'latin',     direction: 'ltr', sampleHello: 'Oi! Vamos conversar?', supportedScripts: ['native'], hasGrammaticalGender: true },
  fa: { code: 'fa', bcp47: 'fa-IR', english: 'Persian (Iran)',        native: 'فارسی',         script: 'non-latin', direction: 'rtl', sampleHello: 'سلام! گفت‌وگو کنیم؟', supportedScripts: ['native', 'latin'], hasGrammaticalGender: false },
  sw: { code: 'sw', bcp47: 'sw-TZ', english: 'Swahili (Tanzania)',    native: 'Kiswahili',   script: 'latin',     direction: 'ltr', sampleHello: 'Habari! Tuongee?', supportedScripts: ['native'], hasGrammaticalGender: false },
  pa: { code: 'pa', bcp47: 'pa-IN', english: 'Punjabi (India)',       native: 'ਪੰਜਾਬੀ',        script: 'non-latin', direction: 'ltr', sampleHello: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਗੱਲ ਕਰੀਏ?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },

  // Tier 2 additions
  tl: { code: 'tl', bcp47: 'tl-PH', english: 'Filipino (Philippines)', native: 'Filipino',   script: 'latin',     direction: 'ltr', sampleHello: 'Kumusta! Mag-usap tayo?', supportedScripts: ['native'], hasGrammaticalGender: false },
  hu: { code: 'hu', bcp47: 'hu-HU', english: 'Hungarian (Hungary)',   native: 'Magyar',      script: 'latin',     direction: 'ltr', sampleHello: 'Szia! Beszélgessünk?', supportedScripts: ['native'], hasGrammaticalGender: false },
  el: { code: 'el', bcp47: 'el-GR', english: 'Greek (Greece)',        native: 'Ελληνικά',    script: 'non-latin', direction: 'ltr', sampleHello: 'Γεια! Να μιλήσουμε;', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  he: { code: 'he', bcp47: 'he-IL', english: 'Hebrew (Israel)',       native: 'עברית',         script: 'non-latin', direction: 'rtl', sampleHello: 'שלום! נדבר?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
}

export function getLanguageMeta(code: string | undefined): LanguageMeta {
  if (code === undefined || code === null) return LANGUAGES.en

  // Check if the code is a valid TargetLanguage key (own property only, not prototype)
  if (Object.prototype.hasOwnProperty.call(LANGUAGES, code)) {
    return LANGUAGES[code as TargetLanguage]
  }

  // Unknown code — log warning and fall back to English
  console.warn(`[Talkingo] Unknown language code "${code}" — falling back to English`)
  return LANGUAGES.en
}

/** BCP-47 locale string used by SpeechRecognition.lang and Gemini TTS. */
export function getBcp47(code: TargetLanguage | undefined): string {
  return getLanguageMeta(code).bcp47
}

/** Endonym (e.g. 日本語, Español) — used in dashboard chrome. */
export function getNativeName(code: TargetLanguage | undefined): string {
  return getLanguageMeta(code).native
}

/** Check if this language supports multiple script options */
export function hasScriptOptions(code: TargetLanguage | undefined): boolean {
  const meta = getLanguageMeta(code)
  return meta.supportedScripts !== undefined && meta.supportedScripts.length > 1
}

/** Get supported scripts for a language */
export function getSupportedScripts(code: TargetLanguage | undefined): Array<'native' | 'latin'> {
  const meta = getLanguageMeta(code)
  return meta.supportedScripts ?? ['native']
}

/** Check if this language has grammatical gender */
export function hasGrammaticalGender(code: TargetLanguage | undefined): boolean {
  const meta = getLanguageMeta(code)
  return meta.hasGrammaticalGender ?? false
}

/** Resolve the effective script preference: defaults to 'native' when undefined */
export function getEffectiveScriptPreference(
  code: TargetLanguage | undefined,
  preference: 'native' | 'latin' | 'both' | undefined
): 'native' | 'latin' | 'both' {
  // Single-script languages always use 'native'
  if (!hasScriptOptions(code)) return 'native'
  // Default to 'native' when preference is not set
  return preference ?? 'native'
}
