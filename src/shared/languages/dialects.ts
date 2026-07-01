import type { TargetLanguage, DialectVariant } from '../types'

// ─── Dialect system (reserved for future use) ───────────────────────────────
// FUTURE (not yet wired): the `dialect` preference is persisted and this map +
// resolveDialect() are ready, and edge-tts-service.getEdgeVoice() accepts a
// dialect argument — but the runtime speak() path does not pass it yet, so the
// user's dialect choice does not change the voice today. When dialect ships,
// thread prefs.dialect through the speak() options into getEdgeVoice(). Kept
// intentionally — see UserPreferences.

export interface DialectMeta {
  code: DialectVariant
  bcp47: string
  english: string
  native: string
  parentLanguage: TargetLanguage
}

export const DIALECT_MAP: Record<TargetLanguage, DialectMeta[] | undefined> = {
  ar: [
    { code: 'ar-EG', bcp47: 'ar-EG', english: 'Egyptian Arabic', native: 'مصري', parentLanguage: 'ar' },
    { code: 'ar-LB', bcp47: 'ar-LB', english: 'Levantine Arabic', native: 'شامي', parentLanguage: 'ar' },
    { code: 'ar-SA', bcp47: 'ar-SA', english: 'Gulf Arabic', native: 'خليجي', parentLanguage: 'ar' },
  ],
  es: [
    { code: 'es-ES', bcp47: 'es-ES', english: 'Spanish (Spain)', native: 'Español (España)', parentLanguage: 'es' },
    { code: 'es-MX', bcp47: 'es-MX', english: 'Latin American Spanish', native: 'Español (Latinoamérica)', parentLanguage: 'es' },
  ],
  pt: [
    { code: 'pt-BR', bcp47: 'pt-BR', english: 'Brazilian Portuguese', native: 'Português (Brasil)', parentLanguage: 'pt' },
    { code: 'pt-PT', bcp47: 'pt-PT', english: 'European Portuguese', native: 'Português (Portugal)', parentLanguage: 'pt' },
  ],
  // All other languages have no dialect variants
  en: undefined,
  fr: undefined,
  de: undefined,
  it: undefined,
  nl: undefined,
  pl: undefined,
  ro: undefined,
  ru: undefined,
  uk: undefined,
  ja: undefined,
  ko: undefined,
  zh: undefined,
  hi: undefined,
  bn: undefined,
  id: undefined,
  mr: undefined,
  ta: undefined,
  te: undefined,
  th: undefined,
  vi: undefined,
  tr: undefined,
  ur: undefined,
  fa: undefined,
  sw: undefined,
  pa: undefined,
  tl: undefined,
  hu: undefined,
  el: undefined,
  he: undefined,
}

export const DEFAULT_DIALECT: Record<string, DialectVariant> = {
  ar: 'ar-EG',
  es: 'es-ES',
  pt: 'pt-BR',
}

export function getDialectsForLanguage(lang: TargetLanguage): DialectMeta[] {
  return DIALECT_MAP[lang] ?? []
}

export function hasDialects(lang: TargetLanguage): boolean {
  return (DIALECT_MAP[lang]?.length ?? 0) > 1
}

export function resolveDialect(lang: TargetLanguage, dialect?: DialectVariant): DialectVariant | undefined {
  if (!hasDialects(lang)) return undefined
  if (dialect && DIALECT_MAP[lang]?.some(d => d.code === dialect)) return dialect
  return DEFAULT_DIALECT[lang]
}
