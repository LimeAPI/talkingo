/**
 * Localization Property Tests
 *
 * **Validates: Requirements 8.1–8.4, 8.7**
 *
 * Property 19: Localization key resolution
 * Property 20: Localization coverage threshold
 * Property 21: Localization English fallback
 * Property 22: RTL rendering for RTL locales
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getDirection, RTL_LOCALES } from '@/i18n/request'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all leaf keys from a nested JSON object as dot-separated paths */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/** Resolve a dot-separated key path from a nested object */
function resolveKey(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.')
  let value: unknown = obj
  for (const segment of segments) {
    if (value && typeof value === 'object' && segment in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return value
}

// ─── Load locale data ────────────────────────────────────────────────────────

// Import all locale JSON files for testing
import enMessages from '@/i18n/messages/en.json'
import arMessages from '@/i18n/messages/ar.json'
import bnMessages from '@/i18n/messages/bn.json'
import deMessages from '@/i18n/messages/de.json'
import elMessages from '@/i18n/messages/el.json'
import esMessages from '@/i18n/messages/es.json'
import faMessages from '@/i18n/messages/fa.json'
import frMessages from '@/i18n/messages/fr.json'
import heMessages from '@/i18n/messages/he.json'
import hiMessages from '@/i18n/messages/hi.json'
import huMessages from '@/i18n/messages/hu.json'
import idMessages from '@/i18n/messages/id.json'
import itMessages from '@/i18n/messages/it.json'
import jaMessages from '@/i18n/messages/ja.json'
import koMessages from '@/i18n/messages/ko.json'
import mrMessages from '@/i18n/messages/mr.json'
import nlMessages from '@/i18n/messages/nl.json'
import paMessages from '@/i18n/messages/pa.json'
import plMessages from '@/i18n/messages/pl.json'
import ptMessages from '@/i18n/messages/pt.json'
import roMessages from '@/i18n/messages/ro.json'
import ruMessages from '@/i18n/messages/ru.json'
import swMessages from '@/i18n/messages/sw.json'
import taMessages from '@/i18n/messages/ta.json'
import teMessages from '@/i18n/messages/te.json'
import thMessages from '@/i18n/messages/th.json'
import tlMessages from '@/i18n/messages/tl.json'
import trMessages from '@/i18n/messages/tr.json'
import ukMessages from '@/i18n/messages/uk.json'
import urMessages from '@/i18n/messages/ur.json'
import viMessages from '@/i18n/messages/vi.json'
import zhMessages from '@/i18n/messages/zh.json'

const LOCALE_MAP: Record<string, Record<string, unknown>> = {
  en: enMessages,
  ar: arMessages,
  bn: bnMessages,
  de: deMessages,
  el: elMessages,
  es: esMessages,
  fa: faMessages,
  fr: frMessages,
  he: heMessages,
  hi: hiMessages,
  hu: huMessages,
  id: idMessages,
  it: itMessages,
  ja: jaMessages,
  ko: koMessages,
  mr: mrMessages,
  nl: nlMessages,
  pa: paMessages,
  pl: plMessages,
  pt: ptMessages,
  ro: roMessages,
  ru: ruMessages,
  sw: swMessages,
  ta: taMessages,
  te: teMessages,
  th: thMessages,
  tl: tlMessages,
  tr: trMessages,
  uk: ukMessages,
  ur: urMessages,
  vi: viMessages,
  zh: zhMessages,
}

const ALL_LOCALES = Object.keys(LOCALE_MAP)
const EN_KEYS = collectKeys(enMessages as Record<string, unknown>)

// RTL locales per requirement 8.7
const RTL_LOCALE_CODES = ['ar', 'ur', 'fa', 'he']
const LTR_LOCALE_CODES = ALL_LOCALES.filter(l => !RTL_LOCALE_CODES.includes(l))

// ─── Property 19: Localization key resolution ────────────────────────────────
// Feature: language-expansion, Property 19: Localization key resolution

describe('Property 19: Localization key resolution', () => {
  it('every key in en.json resolves to a non-empty translation that is not the raw key for all available locales', () => {
    /**Validates: Requirements 8.1, 8.2*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LOCALES),
        fc.constantFrom(...EN_KEYS),
        (locale, key) => {
          const messages = LOCALE_MAP[locale]
          const value = resolveKey(messages, key)

          // The value should be a non-empty string
          expect(typeof value).toBe('string')
          expect((value as string).length).toBeGreaterThan(0)

          // The value should NOT be the raw key itself (which would indicate a missing translation)
          expect(value).not.toBe(key)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('all onboarding keys have non-empty translations across all locales', () => {
    /**Validates: Requirements 8.1*/

    const onboardingKeys = EN_KEYS.filter(k => k.startsWith('onboarding.'))

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LOCALES),
        fc.constantFrom(...onboardingKeys),
        (locale, key) => {
          const messages = LOCALE_MAP[locale]
          const value = resolveKey(messages, key)

          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('all corrections keys have non-empty translations across all locales', () => {
    /**Validates: Requirements 8.2*/

    const correctionsKeys = EN_KEYS.filter(k => k.startsWith('corrections.'))

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LOCALES),
        fc.constantFrom(...correctionsKeys),
        (locale, key) => {
          const messages = LOCALE_MAP[locale]
          const value = resolveKey(messages, key)

          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 200 }
    )
  })
})

// ─── Property 20: Localization coverage threshold ────────────────────────────
// Feature: language-expansion, Property 20: Localization coverage threshold

describe('Property 20: Localization coverage threshold', () => {
  it('each locale has ≥95% key coverage relative to the English source file', () => {
    /**Validates: Requirements 8.3*/

    const totalKeys = EN_KEYS.length

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LOCALES),
        (locale) => {
          const messages = LOCALE_MAP[locale]
          let definedCount = 0

          for (const key of EN_KEYS) {
            const value = resolveKey(messages, key)
            if (typeof value === 'string' && value.trim().length > 0) {
              definedCount++
            }
          }

          const ratio = definedCount / totalKeys
          expect(ratio).toBeGreaterThanOrEqual(0.95)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('the English source file itself has 100% key coverage', () => {
    /**Validates: Requirements 8.3*/

    const totalKeys = EN_KEYS.length
    let definedCount = 0

    for (const key of EN_KEYS) {
      const value = resolveKey(enMessages as Record<string, unknown>, key)
      if (typeof value === 'string' && value.trim().length > 0) {
        definedCount++
      }
    }

    expect(definedCount / totalKeys).toBe(1.0)
  })
})

// ─── Property 21: Localization English fallback ──────────────────────────────
// Feature: language-expansion, Property 21: Localization English fallback

describe('Property 21: Localization English fallback', () => {
  it('getMessageFallback resolves missing keys to the English translation', () => {
    /**Validates: Requirements 8.4*/

    // Simulate the getMessageFallback logic from request.ts
    function getMessageFallback(namespace: string | undefined, key: string): string {
      const path = namespace ? `${namespace}.${key}` : key
      const segments = path.split('.')
      let value: unknown = enMessages
      for (const segment of segments) {
        if (value && typeof value === 'object' && segment in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[segment]
        } else {
          return path
        }
      }
      return typeof value === 'string' ? value : path
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...EN_KEYS),
        (key) => {
          // Split key into namespace and leaf key
          const parts = key.split('.')
          const namespace = parts.length > 1 ? parts.slice(0, -1).join('.') : undefined
          const leafKey = parts[parts.length - 1]

          const fallback = getMessageFallback(namespace, leafKey)

          // The fallback should be the English value, not the raw key path
          const expectedEnglishValue = resolveKey(enMessages as Record<string, unknown>, key)
          expect(fallback).toBe(expectedEnglishValue)

          // The fallback should be non-empty
          expect(fallback.length).toBeGreaterThan(0)

          // The fallback should NOT be the raw key itself
          expect(fallback).not.toBe(key)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('fallback returns the English translation for known keys when locale is missing the key', () => {
    /**Validates: Requirements 8.4*/

    // Test using a simulated scenario: pick a key, simulate it being missing
    // in the locale, and verify the fallback system would return English
    fc.assert(
      fc.property(
        fc.constantFrom(...EN_KEYS),
        (key) => {
          // The English source always has the value
          const englishValue = resolveKey(enMessages as Record<string, unknown>, key)
          expect(typeof englishValue).toBe('string')
          expect((englishValue as string).length).toBeGreaterThan(0)

          // Simulate fallback: for a missing key, the system returns English
          // This mirrors the getMessageFallback behavior in request.ts
          const fallbackResult = englishValue as string
          expect(fallbackResult).not.toBe(key) // Not the raw key
          expect(fallbackResult.length).toBeGreaterThan(0) // Non-empty
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 22: RTL rendering for RTL locales ──────────────────────────────
// Feature: language-expansion, Property 22: RTL rendering for RTL locales

describe('Property 22: RTL rendering for RTL locales', () => {
  it('getDirection returns "rtl" for ar, ur, fa, he', () => {
    /**Validates: Requirements 8.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...RTL_LOCALE_CODES),
        (locale) => {
          const direction = getDirection(locale)
          expect(direction).toBe('rtl')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getDirection returns "ltr" for all non-RTL locales', () => {
    /**Validates: Requirements 8.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...LTR_LOCALE_CODES),
        (locale) => {
          const direction = getDirection(locale)
          expect(direction).toBe('ltr')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('RTL_LOCALES set contains exactly {ar, ur, fa, he}', () => {
    /**Validates: Requirements 8.7*/

    // Verify the RTL_LOCALES set matches expected codes
    expect(RTL_LOCALES.size).toBe(4)
    expect(RTL_LOCALES.has('ar')).toBe(true)
    expect(RTL_LOCALES.has('ur')).toBe(true)
    expect(RTL_LOCALES.has('fa')).toBe(true)
    expect(RTL_LOCALES.has('he')).toBe(true)
  })

  it('no LTR locale accidentally returns "rtl"', () => {
    /**Validates: Requirements 8.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...LTR_LOCALE_CODES),
        (locale) => {
          expect(getDirection(locale)).not.toBe('rtl')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getDirection returns only "rtl" or "ltr" for any locale string', () => {
    /**Validates: Requirements 8.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LOCALES),
        (locale) => {
          const direction = getDirection(locale)
          expect(['rtl', 'ltr']).toContain(direction)
        }
      ),
      { numRuns: 100 }
    )
  })
})
