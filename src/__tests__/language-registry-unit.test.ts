/**
 * Unit Tests — Language Registry Specific Metadata Values
 *
 * Tests exact BCP-47, script, direction, supportedScripts, and hasGrammaticalGender
 * values for each new language, and verifies existing 23 languages are unmodified.
 *
 * Requirements: 1.2–1.8, 2.2–2.8, 9.1, 9.6, 9.8
 */

import { describe, it, expect } from 'vitest'
import { LANGUAGES, type LanguageMeta } from '@talkingo/shared/languages'
import { LANGUAGE_NAMES, type TargetLanguage } from '@talkingo/shared/types'

// ─── Tier 1 Language Metadata Tests ──────────────────────────────────────────

describe('Tier 1 Language Metadata Values', () => {
  describe('Urdu (ur)', () => {
    it('has correct metadata values', () => {
      const ur = LANGUAGES.ur
      expect(ur.bcp47).toBe('ur-PK')
      expect(ur.script).toBe('non-latin')
      expect(ur.direction).toBe('rtl')
      expect(ur.supportedScripts).toEqual(['native', 'latin'])
      expect(ur.hasGrammaticalGender).toBe(true)
      expect(ur.code).toBe('ur')
      expect(ur.english).toBe('Urdu (Pakistan)')
      expect(ur.native).toBeTruthy()
      expect(ur.sampleHello).toBeTruthy()
    })
  })

  describe('Portuguese (pt)', () => {
    it('has correct metadata values', () => {
      const pt = LANGUAGES.pt
      expect(pt.bcp47).toBe('pt-BR')
      expect(pt.script).toBe('latin')
      expect(pt.direction).toBe('ltr')
      expect(pt.supportedScripts).toEqual(['native'])
      expect(pt.code).toBe('pt')
      expect(pt.english).toBe('Portuguese (Brazil)')
      expect(pt.native).toBeTruthy()
      expect(pt.sampleHello).toBeTruthy()
    })
  })

  describe('Persian (fa)', () => {
    it('has correct metadata values', () => {
      const fa = LANGUAGES.fa
      expect(fa.bcp47).toBe('fa-IR')
      expect(fa.script).toBe('non-latin')
      expect(fa.direction).toBe('rtl')
      expect(fa.supportedScripts).toEqual(['native', 'latin'])
      expect(fa.hasGrammaticalGender).toBe(false)
      expect(fa.code).toBe('fa')
      expect(fa.english).toBe('Persian (Iran)')
      expect(fa.native).toBeTruthy()
      expect(fa.sampleHello).toBeTruthy()
    })
  })

  describe('Swahili (sw)', () => {
    it('has correct metadata values', () => {
      const sw = LANGUAGES.sw
      expect(sw.bcp47).toBe('sw-TZ')
      expect(sw.script).toBe('latin')
      expect(sw.direction).toBe('ltr')
      expect(sw.supportedScripts).toEqual(['native'])
      expect(sw.hasGrammaticalGender).toBe(false)
      expect(sw.code).toBe('sw')
      expect(sw.english).toBe('Swahili (Tanzania)')
      expect(sw.native).toBeTruthy()
      expect(sw.sampleHello).toBeTruthy()
    })
  })

  describe('Punjabi (pa)', () => {
    it('has correct metadata values', () => {
      const pa = LANGUAGES.pa
      expect(pa.bcp47).toBe('pa-IN')
      expect(pa.script).toBe('non-latin')
      expect(pa.direction).toBe('ltr')
      expect(pa.supportedScripts).toEqual(['native', 'latin'])
      expect(pa.hasGrammaticalGender).toBe(true)
      expect(pa.code).toBe('pa')
      expect(pa.english).toBe('Punjabi (India)')
      expect(pa.native).toBeTruthy()
      expect(pa.sampleHello).toBeTruthy()
    })
  })
})

// ─── Tier 2 Language Metadata Tests ──────────────────────────────────────────

describe('Tier 2 Language Metadata Values', () => {
  describe('Filipino (tl)', () => {
    it('has correct metadata values', () => {
      const tl = LANGUAGES.tl
      expect(tl.bcp47).toBe('tl-PH')
      expect(tl.script).toBe('latin')
      expect(tl.direction).toBe('ltr')
      expect(tl.supportedScripts).toEqual(['native'])
      expect(tl.hasGrammaticalGender).toBe(false)
      expect(tl.code).toBe('tl')
      expect(tl.english).toBe('Filipino (Philippines)')
      expect(tl.native).toBeTruthy()
      expect(tl.sampleHello).toBeTruthy()
    })
  })

  describe('Hungarian (hu)', () => {
    it('has correct metadata values', () => {
      const hu = LANGUAGES.hu
      expect(hu.bcp47).toBe('hu-HU')
      expect(hu.script).toBe('latin')
      expect(hu.direction).toBe('ltr')
      expect(hu.supportedScripts).toEqual(['native'])
      expect(hu.hasGrammaticalGender).toBe(false)
      expect(hu.code).toBe('hu')
      expect(hu.english).toBe('Hungarian (Hungary)')
      expect(hu.native).toBeTruthy()
      expect(hu.sampleHello).toBeTruthy()
    })
  })

  describe('Greek (el)', () => {
    it('has correct metadata values', () => {
      const el = LANGUAGES.el
      expect(el.bcp47).toBe('el-GR')
      expect(el.script).toBe('non-latin')
      expect(el.direction).toBe('ltr')
      expect(el.supportedScripts).toEqual(['native', 'latin'])
      expect(el.hasGrammaticalGender).toBe(true)
      expect(el.code).toBe('el')
      expect(el.english).toBe('Greek (Greece)')
      expect(el.native).toBeTruthy()
      expect(el.sampleHello).toBeTruthy()
    })
  })

  describe('Hebrew (he)', () => {
    it('has correct metadata values', () => {
      const he = LANGUAGES.he
      expect(he.bcp47).toBe('he-IL')
      expect(he.script).toBe('non-latin')
      expect(he.direction).toBe('rtl')
      expect(he.supportedScripts).toEqual(['native', 'latin'])
      expect(he.hasGrammaticalGender).toBe(true)
      expect(he.code).toBe('he')
      expect(he.english).toBe('Hebrew (Israel)')
      expect(he.native).toBeTruthy()
      expect(he.sampleHello).toBeTruthy()
    })
  })
})

// ─── LANGUAGE_NAMES Tests for New Languages ──────────────────────────────────

describe('LANGUAGE_NAMES entries for new languages', () => {
  it('has correct display names for all 9 new languages', () => {
    expect(LANGUAGE_NAMES.ur).toBe('Urdu (Pakistan)')
    expect(LANGUAGE_NAMES.pt).toBe('Portuguese (Brazil)')
    expect(LANGUAGE_NAMES.fa).toBe('Persian (Iran)')
    expect(LANGUAGE_NAMES.sw).toBe('Swahili (Tanzania)')
    expect(LANGUAGE_NAMES.pa).toBe('Punjabi (India)')
    expect(LANGUAGE_NAMES.tl).toBe('Filipino (Philippines)')
    expect(LANGUAGE_NAMES.hu).toBe('Hungarian (Hungary)')
    expect(LANGUAGE_NAMES.el).toBe('Greek (Greece)')
    expect(LANGUAGE_NAMES.he).toBe('Hebrew (Israel)')
  })
})

// ─── Existing 23 Languages Backward Compatibility ────────────────────────────

describe('Existing 23 languages remain unmodified', () => {
  // Snapshot of existing language metadata (spot checks)
  const existingLanguageSpotChecks: Array<{
    code: TargetLanguage
    bcp47: string
    script: 'latin' | 'non-latin'
    direction: 'ltr' | 'rtl'
    english: string
    hasGrammaticalGender?: boolean
  }> = [
    { code: 'en', bcp47: 'en-US', script: 'latin', direction: 'ltr', english: 'English (US)' },
    { code: 'es', bcp47: 'es-ES', script: 'latin', direction: 'ltr', english: 'Spanish (Spain)', hasGrammaticalGender: true },
    { code: 'fr', bcp47: 'fr-FR', script: 'latin', direction: 'ltr', english: 'French (France)', hasGrammaticalGender: true },
    { code: 'de', bcp47: 'de-DE', script: 'latin', direction: 'ltr', english: 'German (Germany)', hasGrammaticalGender: true },
    { code: 'it', bcp47: 'it-IT', script: 'latin', direction: 'ltr', english: 'Italian (Italy)', hasGrammaticalGender: true },
    { code: 'ja', bcp47: 'ja-JP', script: 'non-latin', direction: 'ltr', english: 'Japanese (Japan)' },
    { code: 'ko', bcp47: 'ko-KR', script: 'non-latin', direction: 'ltr', english: 'Korean (South Korea)' },
    { code: 'zh', bcp47: 'zh-CN', script: 'non-latin', direction: 'ltr', english: 'Mandarin Chinese' },
    { code: 'hi', bcp47: 'hi-IN', script: 'non-latin', direction: 'ltr', english: 'Hindi (India)', hasGrammaticalGender: true },
    { code: 'ar', bcp47: 'ar-EG', script: 'non-latin', direction: 'rtl', english: 'Arabic (Egypt)', hasGrammaticalGender: true },
    { code: 'ru', bcp47: 'ru-RU', script: 'non-latin', direction: 'ltr', english: 'Russian (Russia)', hasGrammaticalGender: true },
    { code: 'tr', bcp47: 'tr-TR', script: 'latin', direction: 'ltr', english: 'Turkish (Turkey)' },
    { code: 'vi', bcp47: 'vi-VN', script: 'latin', direction: 'ltr', english: 'Vietnamese (Vietnam)' },
    { code: 'th', bcp47: 'th-TH', script: 'non-latin', direction: 'ltr', english: 'Thai (Thailand)' },
    { code: 'id', bcp47: 'id-ID', script: 'latin', direction: 'ltr', english: 'Indonesian (Indonesia)' },
  ]

  it.each(existingLanguageSpotChecks)(
    '$code ($english) retains original metadata',
    ({ code, bcp47, script, direction, english, hasGrammaticalGender }) => {
      const meta = LANGUAGES[code]
      expect(meta).toBeDefined()
      expect(meta.bcp47).toBe(bcp47)
      expect(meta.script).toBe(script)
      expect(meta.direction).toBe(direction)
      expect(meta.english).toBe(english)
      if (hasGrammaticalGender !== undefined) {
        expect(meta.hasGrammaticalGender).toBe(hasGrammaticalGender)
      }
    }
  )

  // Verify LANGUAGE_NAMES entries for existing languages are unchanged
  const existingNameChecks: Array<{ code: TargetLanguage; name: string }> = [
    { code: 'en', name: 'English (US)' },
    { code: 'es', name: 'Spanish (Spain)' },
    { code: 'fr', name: 'French (France)' },
    { code: 'de', name: 'German (Germany)' },
    { code: 'ja', name: 'Japanese (Japan)' },
    { code: 'ko', name: 'Korean (South Korea)' },
    { code: 'zh', name: 'Mandarin Chinese (China & Taiwan)' },
    { code: 'hi', name: 'Hindi (India)' },
    { code: 'ar', name: 'Arabic (Egypt)' },
    { code: 'tr', name: 'Turkish (Turkey)' },
  ]

  it.each(existingNameChecks)(
    'LANGUAGE_NAMES.$code equals "$name"',
    ({ code, name }) => {
      expect(LANGUAGE_NAMES[code]).toBe(name)
    }
  )

  it('all 23 original language codes exist in LANGUAGES record', () => {
    const original23: TargetLanguage[] = [
      'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'ru', 'uk',
      'ja', 'ko', 'zh', 'hi', 'bn', 'id', 'mr', 'ta', 'te', 'th', 'vi',
      'ar', 'tr',
    ]
    for (const code of original23) {
      expect(LANGUAGES[code]).toBeDefined()
      expect(LANGUAGES[code].code).toBe(code)
    }
  })

  it('all 23 original language codes exist in LANGUAGE_NAMES record', () => {
    const original23: TargetLanguage[] = [
      'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'ru', 'uk',
      'ja', 'ko', 'zh', 'hi', 'bn', 'id', 'mr', 'ta', 'te', 'th', 'vi',
      'ar', 'tr',
    ]
    for (const code of original23) {
      expect(LANGUAGE_NAMES[code]).toBeDefined()
      expect(typeof LANGUAGE_NAMES[code]).toBe('string')
      expect(LANGUAGE_NAMES[code].length).toBeGreaterThan(0)
    }
  })
})

// ─── Total Registry Size Verification ────────────────────────────────────────

describe('Registry size verification', () => {
  it('LANGUAGES record has exactly 32 entries', () => {
    expect(Object.keys(LANGUAGES)).toHaveLength(32)
  })

  it('LANGUAGE_NAMES record has exactly 32 entries', () => {
    expect(Object.keys(LANGUAGE_NAMES)).toHaveLength(32)
  })

  it('all LANGUAGES keys match LANGUAGE_NAMES keys', () => {
    const languageKeys = Object.keys(LANGUAGES).sort()
    const nameKeys = Object.keys(LANGUAGE_NAMES).sort()
    expect(languageKeys).toEqual(nameKeys)
  })
})
