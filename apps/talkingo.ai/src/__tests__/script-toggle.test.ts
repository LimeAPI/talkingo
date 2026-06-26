/**
 * Unit + Property Tests — Script Toggle Logic
 *
 * Verifies hasScriptOptions, getEffectiveScriptPreference, and the
 * buildLanguageBlock prompt construction for all script preference modes.
 *
 * Feature: language-expansion, Property 9: Script toggle correctness
 * Validates: Requirements 5.1, 5.5, 5.6, 5.9
 */
import { describe, it, expect } from 'vitest'
import {
  LANGUAGES,
  hasScriptOptions,
  getSupportedScripts,
  getEffectiveScriptPreference,
} from '@talkingo/shared/languages'
import type { TargetLanguage } from '@talkingo/shared/types'
import { getSystemInstruction } from '@talkingo/shared/gemini'

// Languages that should have multiple scripts (native + latin)
const MULTI_SCRIPT_LANGUAGES: TargetLanguage[] = [
  // Existing
  'ru', 'uk', 'ja', 'ko', 'zh', 'hi', 'bn', 'mr', 'ta', 'te', 'th', 'ar',
  // New Tier 1
  'ur', 'fa', 'pa',
  // New Tier 2
  'el', 'he',
]

// Languages that should have single script
const SINGLE_SCRIPT_LANGUAGES: TargetLanguage[] = [
  'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'id', 'vi', 'tr',
  // New single-script
  'pt', 'sw', 'tl', 'hu',
]

describe('hasScriptOptions — multi-script languages', () => {
  it.each(MULTI_SCRIPT_LANGUAGES)(
    'returns true for %s',
    (code) => {
      expect(hasScriptOptions(code)).toBe(true)
    }
  )
})

describe('hasScriptOptions — single-script languages', () => {
  it.each(SINGLE_SCRIPT_LANGUAGES)(
    'returns false for %s',
    (code) => {
      expect(hasScriptOptions(code)).toBe(false)
    }
  )
})

describe('hasScriptOptions — completeness check for all 32 languages', () => {
  it('every language in LANGUAGES is categorized as either multi or single script', () => {
    const allCodes = Object.keys(LANGUAGES) as TargetLanguage[]
    expect(allCodes.length).toBe(32)

    for (const code of allCodes) {
      const scripts = getSupportedScripts(code)
      const isMulti = hasScriptOptions(code)

      if (scripts.length > 1) {
        expect(isMulti).toBe(true)
      } else {
        expect(isMulti).toBe(false)
      }
    }
  })
})

describe('getEffectiveScriptPreference', () => {
  it('defaults to native when preference is undefined for multi-script language', () => {
    expect(getEffectiveScriptPreference('ja', undefined)).toBe('native')
    expect(getEffectiveScriptPreference('ur', undefined)).toBe('native')
  })

  it('returns the explicit preference for multi-script language', () => {
    expect(getEffectiveScriptPreference('ja', 'latin')).toBe('latin')
    expect(getEffectiveScriptPreference('hi', 'both')).toBe('both')
    expect(getEffectiveScriptPreference('ar', 'native')).toBe('native')
  })

  it('always returns native for single-script languages regardless of preference', () => {
    expect(getEffectiveScriptPreference('en', 'latin')).toBe('native')
    expect(getEffectiveScriptPreference('es', 'both')).toBe('native')
    expect(getEffectiveScriptPreference('sw', 'latin')).toBe('native')
  })
})

describe('buildLanguageBlock — both script preference rendering', () => {
  it('includes both-script instruction when preferredScript is both', () => {
    const instruction = getSystemInstruction({
      talkingoLevel: 5,
      topic: 'general',
      correctionStyle: 'direct',
      targetLanguage: 'ja',
      nativeLanguage: 'en',
      preferredScript: 'both',
    })
    expect(instruction).toContain('native script')
    expect(instruction).toContain('Latin romanization')
    expect(instruction).toContain('parentheses')
  })

  it('includes latin-only instruction when preferredScript is latin', () => {
    const instruction = getSystemInstruction({
      talkingoLevel: 5,
      topic: 'general',
      correctionStyle: 'direct',
      targetLanguage: 'ur',
      nativeLanguage: 'en',
      preferredScript: 'latin',
    })
    expect(instruction).toContain('Latin (romanized) script only')
    expect(instruction).toContain('do NOT use native')
  })

  it('includes native-script instruction when preferredScript is native', () => {
    const instruction = getSystemInstruction({
      talkingoLevel: 5,
      topic: 'general',
      correctionStyle: 'direct',
      targetLanguage: 'hi',
      nativeLanguage: 'en',
      preferredScript: 'native',
    })
    expect(instruction).toContain('use the native script')
  })

  it('uses native script by default when preferredScript is undefined for non-latin', () => {
    const instruction = getSystemInstruction({
      talkingoLevel: 5,
      topic: 'general',
      correctionStyle: 'direct',
      targetLanguage: 'ko',
      nativeLanguage: 'en',
    })
    expect(instruction).toContain('use the native script')
  })

  it('does not include script hint for latin-script languages', () => {
    const instruction = getSystemInstruction({
      talkingoLevel: 5,
      topic: 'general',
      correctionStyle: 'direct',
      targetLanguage: 'es',
      nativeLanguage: 'en',
      preferredScript: 'both', // should be ignored for latin-script language
    })
    expect(instruction).not.toContain('romanization')
    expect(instruction).not.toContain('native script')
  })
})
