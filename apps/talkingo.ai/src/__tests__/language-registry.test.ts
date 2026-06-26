/**
 * Language Registry Property Tests — Completeness & Backward Compatibility
 *
 * **Validates: Requirements 1.1, 1.9, 1.10, 2.1, 2.9, 9.1, 9.3, 9.6, 9.8**
 *
 * Property 1: New language metadata completeness
 * Property 2: Existing language backward compatibility
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { LANGUAGES, type LanguageMeta } from '@talkingo/shared/languages'
import { LANGUAGE_NAMES, type TargetLanguage } from '@talkingo/shared/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const NEW_LANGUAGE_CODES: TargetLanguage[] = ['ur', 'pt', 'fa', 'sw', 'pa', 'tl', 'hu', 'el', 'he']

const ORIGINAL_23_CODES: TargetLanguage[] = [
  'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'ru', 'uk',
  'ja', 'ko', 'zh', 'hi', 'bn', 'id', 'mr', 'ta', 'te', 'th', 'vi',
  'ar', 'tr',
]

// ─── Pre-expansion snapshot of original 23 languages ─────────────────────────
// Hardcoded expected values for backward compatibility verification

const ORIGINAL_LANGUAGES_SNAPSHOT: Record<string, LanguageMeta> = {
  en: { code: 'en', bcp47: 'en-US', english: 'English (US)', native: 'English', script: 'latin', direction: 'ltr', sampleHello: 'Hi! Ready to chat?' },
  es: { code: 'es', bcp47: 'es-ES', english: 'Spanish (Spain)', native: 'Español', script: 'latin', direction: 'ltr', sampleHello: '¡Hola! ¿Listo para charlar?', hasGrammaticalGender: true },
  fr: { code: 'fr', bcp47: 'fr-FR', english: 'French (France)', native: 'Français', script: 'latin', direction: 'ltr', sampleHello: 'Salut ! On discute ?', hasGrammaticalGender: true },
  de: { code: 'de', bcp47: 'de-DE', english: 'German (Germany)', native: 'Deutsch', script: 'latin', direction: 'ltr', sampleHello: 'Hallo! Bereit zu plaudern?', hasGrammaticalGender: true },
  it: { code: 'it', bcp47: 'it-IT', english: 'Italian (Italy)', native: 'Italiano', script: 'latin', direction: 'ltr', sampleHello: 'Ciao! Pronto a chiacchierare?', hasGrammaticalGender: true },
  nl: { code: 'nl', bcp47: 'nl-NL', english: 'Dutch (Netherlands)', native: 'Nederlands', script: 'latin', direction: 'ltr', sampleHello: 'Hoi! Zin in een gesprek?' },
  pl: { code: 'pl', bcp47: 'pl-PL', english: 'Polish (Poland)', native: 'Polski', script: 'latin', direction: 'ltr', sampleHello: 'Cześć! Pogadamy?', hasGrammaticalGender: true },
  ro: { code: 'ro', bcp47: 'ro-RO', english: 'Romanian (Romania)', native: 'Română', script: 'latin', direction: 'ltr', sampleHello: 'Salut! Stăm de vorbă?', hasGrammaticalGender: true },
  ru: { code: 'ru', bcp47: 'ru-RU', english: 'Russian (Russia)', native: 'Русский', script: 'non-latin', direction: 'ltr', sampleHello: 'Привет! Поговорим?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  uk: { code: 'uk', bcp47: 'uk-UA', english: 'Ukrainian (Ukraine)', native: 'Українська', script: 'non-latin', direction: 'ltr', sampleHello: 'Привіт! Поговоримо?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  ja: { code: 'ja', bcp47: 'ja-JP', english: 'Japanese (Japan)', native: '日本語', script: 'non-latin', direction: 'ltr', sampleHello: 'こんにちは！話しましょう。', supportedScripts: ['native', 'latin'] },
  ko: { code: 'ko', bcp47: 'ko-KR', english: 'Korean (South Korea)', native: '한국어', script: 'non-latin', direction: 'ltr', sampleHello: '안녕하세요! 이야기할까요?', supportedScripts: ['native', 'latin'] },
  zh: { code: 'zh', bcp47: 'zh-CN', english: 'Mandarin Chinese', native: '中文', script: 'non-latin', direction: 'ltr', sampleHello: '你好！我们聊聊吧。', supportedScripts: ['native', 'latin'] },
  hi: { code: 'hi', bcp47: 'hi-IN', english: 'Hindi (India)', native: 'हिन्दी', script: 'non-latin', direction: 'ltr', sampleHello: 'नमस्ते! बात करें?', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  bn: { code: 'bn', bcp47: 'bn-IN', english: 'Bengali (Bangladesh)', native: 'বাংলা', script: 'non-latin', direction: 'ltr', sampleHello: 'হ্যালো! কথা বলবো?', supportedScripts: ['native', 'latin'] },
  id: { code: 'id', bcp47: 'id-ID', english: 'Indonesian (Indonesia)', native: 'Bahasa Indonesia', script: 'latin', direction: 'ltr', sampleHello: 'Halo! Mau ngobrol?' },
  mr: { code: 'mr', bcp47: 'mr-IN', english: 'Marathi (India)', native: 'मराठी', script: 'non-latin', direction: 'ltr', sampleHello: 'नमस्कार! गप्पा मारूया?', supportedScripts: ['native', 'latin'] },
  ta: { code: 'ta', bcp47: 'ta-IN', english: 'Tamil (India)', native: 'தமிழ்', script: 'non-latin', direction: 'ltr', sampleHello: 'வணக்கம்! பேசலாம்?', supportedScripts: ['native', 'latin'] },
  te: { code: 'te', bcp47: 'te-IN', english: 'Telugu (India)', native: 'తెలుగు', script: 'non-latin', direction: 'ltr', sampleHello: 'నమస్తే! మాట్లాడదామా?', supportedScripts: ['native', 'latin'] },
  th: { code: 'th', bcp47: 'th-TH', english: 'Thai (Thailand)', native: 'ไทย', script: 'non-latin', direction: 'ltr', sampleHello: 'สวัสดี! คุยกันไหม?', supportedScripts: ['native', 'latin'] },
  vi: { code: 'vi', bcp47: 'vi-VN', english: 'Vietnamese (Vietnam)', native: 'Tiếng Việt', script: 'latin', direction: 'ltr', sampleHello: 'Xin chào! Trò chuyện nhé?' },
  ar: { code: 'ar', bcp47: 'ar-EG', english: 'Arabic (Egypt)', native: 'العربية', script: 'non-latin', direction: 'rtl', sampleHello: 'مرحبًا! نتحدث؟', supportedScripts: ['native', 'latin'], hasGrammaticalGender: true },
  tr: { code: 'tr', bcp47: 'tr-TR', english: 'Turkish (Turkey)', native: 'Türkçe', script: 'latin', direction: 'ltr', sampleHello: 'Merhaba! Sohbet edelim mi?' },
}

const ORIGINAL_LANGUAGE_NAMES_SNAPSHOT: Record<string, string> = {
  en: 'English (US)', es: 'Spanish (Spain)', fr: 'French (France)',
  de: 'German (Germany)', it: 'Italian (Italy)', nl: 'Dutch (Netherlands)',
  pl: 'Polish (Poland)', ro: 'Romanian (Romania)', ru: 'Russian (Russia)',
  uk: 'Ukrainian (Ukraine)', ja: 'Japanese (Japan)', ko: 'Korean (South Korea)',
  zh: 'Mandarin Chinese (China & Taiwan)', hi: 'Hindi (India)',
  bn: 'Bengali (Bangladesh)', id: 'Indonesian (Indonesia)', mr: 'Marathi (India)',
  ta: 'Tamil (India)', te: 'Telugu (India)', th: 'Thai (Thailand)',
  vi: 'Vietnamese (Vietnam)', ar: 'Arabic (Egypt)', tr: 'Turkish (Turkey)',
}

// ─── Arbitraries (generators) ────────────────────────────────────────────────

const newLanguageCodeArb = fc.constantFrom(...NEW_LANGUAGE_CODES)
const originalLanguageCodeArb = fc.constantFrom(...ORIGINAL_23_CODES)

// ─── Property 1: New language metadata completeness ──────────────────────────
// Feature: language-expansion, Property 1: New language metadata completeness

describe('Property 1: New language metadata completeness', () => {
  it('all 9 new languages have complete LanguageMeta with non-empty required fields', () => {
    /**Validates: Requirements 1.1, 1.9, 2.1*/
    fc.assert(
      fc.property(
        newLanguageCodeArb,
        (code) => {
          const meta = LANGUAGES[code]

          // Entry must exist
          expect(meta).toBeDefined()

          // code field matches the key
          expect(meta.code).toBe(code)

          // All string fields are non-empty
          expect(meta.bcp47).toBeTruthy()
          expect(meta.bcp47.length).toBeGreaterThan(0)

          expect(meta.english).toBeTruthy()
          expect(meta.english.length).toBeGreaterThan(0)

          expect(meta.native).toBeTruthy()
          expect(meta.native.length).toBeGreaterThan(0)

          expect(meta.script).toBeTruthy()
          expect(['latin', 'non-latin']).toContain(meta.script)

          expect(meta.direction).toBeTruthy()
          expect(['ltr', 'rtl']).toContain(meta.direction)

          expect(meta.sampleHello).toBeTruthy()
          expect(meta.sampleHello.length).toBeGreaterThan(0)

          // supportedScripts is a non-empty array
          expect(meta.supportedScripts).toBeDefined()
          expect(Array.isArray(meta.supportedScripts)).toBe(true)
          expect(meta.supportedScripts!.length).toBeGreaterThan(0)

          // Each entry in supportedScripts is valid
          for (const s of meta.supportedScripts!) {
            expect(['native', 'latin']).toContain(s)
          }

          // hasGrammaticalGender is a boolean
          expect(typeof meta.hasGrammaticalGender).toBe('boolean')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('new languages are present in LANGUAGE_NAMES with non-empty display strings', () => {
    /**Validates: Requirements 1.1, 2.1*/
    fc.assert(
      fc.property(
        newLanguageCodeArb,
        (code) => {
          const displayName = LANGUAGE_NAMES[code]
          expect(displayName).toBeDefined()
          expect(typeof displayName).toBe('string')
          expect(displayName.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 2: Existing language backward compatibility ────────────────────
// Feature: language-expansion, Property 2: Existing language backward compatibility

describe('Property 2: Existing language backward compatibility', () => {
  it('all 23 original languages retain identical LanguageMeta values', () => {
    /**Validates: Requirements 1.10, 2.9, 9.1, 9.3, 9.8*/
    fc.assert(
      fc.property(
        originalLanguageCodeArb,
        (code) => {
          const actual = LANGUAGES[code]
          const expected = ORIGINAL_LANGUAGES_SNAPSHOT[code]

          // Entry must exist
          expect(actual).toBeDefined()
          expect(expected).toBeDefined()

          // Verify all fields match the pre-expansion snapshot
          expect(actual.code).toBe(expected.code)
          expect(actual.bcp47).toBe(expected.bcp47)
          expect(actual.english).toBe(expected.english)
          expect(actual.native).toBe(expected.native)
          expect(actual.script).toBe(expected.script)
          expect(actual.direction).toBe(expected.direction)
          expect(actual.sampleHello).toBe(expected.sampleHello)

          // supportedScripts comparison (both may be undefined)
          if (expected.supportedScripts) {
            expect(actual.supportedScripts).toBeDefined()
            expect(actual.supportedScripts).toEqual(expected.supportedScripts)
          } else {
            expect(actual.supportedScripts).toBeUndefined()
          }

          // hasGrammaticalGender comparison (both may be undefined)
          if (expected.hasGrammaticalGender !== undefined) {
            expect(actual.hasGrammaticalGender).toBe(expected.hasGrammaticalGender)
          } else {
            expect(actual.hasGrammaticalGender).toBeUndefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('all 23 original languages retain identical LANGUAGE_NAMES display strings', () => {
    /**Validates: Requirements 9.6*/
    fc.assert(
      fc.property(
        originalLanguageCodeArb,
        (code) => {
          const actual = LANGUAGE_NAMES[code]
          const expected = ORIGINAL_LANGUAGE_NAMES_SNAPSHOT[code]

          expect(actual).toBeDefined()
          expect(expected).toBeDefined()
          expect(actual).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})
