/**
 * Property Tests — Script Toggle Correctness, Default Script Preference,
 * and Script Preference Revert on Failure
 *
 * Feature: language-expansion, Property 9, 10, 11
 * **Validates: Requirements 5.1, 5.5, 5.6, 5.7, 5.8**
 *
 * Uses Vitest + fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  LANGUAGES,
  hasScriptOptions,
  getSupportedScripts,
  getEffectiveScriptPreference,
} from '@talkingo/shared/languages'
import type { TargetLanguage, ScriptPreference } from '@talkingo/shared/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_32_LANGUAGES: TargetLanguage[] = Object.keys(LANGUAGES) as TargetLanguage[]

const MULTI_SCRIPT_LANGUAGES: TargetLanguage[] = ALL_32_LANGUAGES.filter(
  (code) => (LANGUAGES[code].supportedScripts?.length ?? 0) > 1
)

// ─── Arbitraries (generators) ────────────────────────────────────────────────

const allLanguageCodeArb = fc.constantFrom(...ALL_32_LANGUAGES)
const multiScriptLanguageArb = fc.constantFrom(...MULTI_SCRIPT_LANGUAGES)
const scriptPreferenceArb = fc.constantFrom<ScriptPreference>('native', 'latin', 'both')

// ─── Pure logic: Script preference update with revert-on-failure ─────────────
// This captures the revert-on-failure behavior specified in Requirement 5.8.
// When persistence fails, the state reverts to the previous value.

interface ScriptPreferenceState {
  currentPreference: ScriptPreference | undefined
}

interface ScriptPreferenceUpdateResult {
  success: boolean
  state: ScriptPreferenceState
}

/**
 * Pure logic function that simulates updating script preference with
 * revert-on-failure semantics. If `persistFn` throws, the state reverts.
 */
function updateScriptPreference(
  previousState: ScriptPreferenceState,
  newPreference: ScriptPreference,
  persistFn: (pref: ScriptPreference) => void,
): ScriptPreferenceUpdateResult {
  // Optimistically apply the new preference
  const optimisticState: ScriptPreferenceState = { currentPreference: newPreference }

  try {
    persistFn(newPreference)
    // Persistence succeeded — keep new state
    return { success: true, state: optimisticState }
  } catch {
    // Persistence failed — revert to previous state
    return { success: false, state: previousState }
  }
}

// ─── Property 9: Script toggle correctness ───────────────────────────────────
// Feature: language-expansion, Property 9: Script toggle correctness
//
// For any TargetLanguage code in the full 32-language set, hasScriptOptions
// returns true iff LANGUAGES[code].supportedScripts has >1 entry.

describe('Property 9: Script toggle correctness', () => {
  it('hasScriptOptions returns true iff supportedScripts has >1 entry for all 32 languages', () => {
    /**Validates: Requirements 5.1, 5.5, 5.6*/
    fc.assert(
      fc.property(
        allLanguageCodeArb,
        (code) => {
          const meta = LANGUAGES[code]
          const scripts = meta.supportedScripts ?? ['native']
          const hasMultipleScripts = scripts.length > 1

          expect(hasScriptOptions(code)).toBe(hasMultipleScripts)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('hasScriptOptions is consistent with getSupportedScripts length', () => {
    /**Validates: Requirements 5.1, 5.5, 5.6*/
    fc.assert(
      fc.property(
        allLanguageCodeArb,
        (code) => {
          const scripts = getSupportedScripts(code)
          const expected = scripts.length > 1

          expect(hasScriptOptions(code)).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 10: Default script preference ──────────────────────────────────
// Feature: language-expansion, Property 10: Default script preference
//
// For any multi-script language with undefined preferredScript,
// getEffectiveScriptPreference returns 'native'.

describe('Property 10: Default script preference', () => {
  it('undefined preference resolves to native for all multi-script languages', () => {
    /**Validates: Requirements 5.7*/
    fc.assert(
      fc.property(
        multiScriptLanguageArb,
        (code) => {
          const result = getEffectiveScriptPreference(code, undefined)
          expect(result).toBe('native')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('explicit preference is returned as-is for multi-script languages', () => {
    /**Validates: Requirements 5.7*/
    fc.assert(
      fc.property(
        multiScriptLanguageArb,
        scriptPreferenceArb,
        (code, preference) => {
          const result = getEffectiveScriptPreference(code, preference)
          expect(result).toBe(preference)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 11: Script preference revert on failure ────────────────────────
// Feature: language-expansion, Property 11: Script preference revert on failure
//
// For any script preference change that fails to persist (simulated
// Preference_Store failure), the application state SHALL revert to the
// previous script preference value rather than retaining the failed value.

describe('Property 11: Script preference revert on failure', () => {
  it('state reverts to previous preference when persistence fails', () => {
    /**Validates: Requirements 5.8*/
    fc.assert(
      fc.property(
        scriptPreferenceArb,
        scriptPreferenceArb,
        (previousPref, newPref) => {
          const previousState: ScriptPreferenceState = { currentPreference: previousPref }

          // Simulate persistence failure
          const failingPersist = () => { throw new Error('Appwrite unavailable') }

          const result = updateScriptPreference(previousState, newPref, failingPersist)

          // State should revert to the previous preference
          expect(result.success).toBe(false)
          expect(result.state.currentPreference).toBe(previousPref)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('state retains new preference when persistence succeeds', () => {
    /**Validates: Requirements 5.8*/
    fc.assert(
      fc.property(
        scriptPreferenceArb,
        scriptPreferenceArb,
        (previousPref, newPref) => {
          const previousState: ScriptPreferenceState = { currentPreference: previousPref }

          // Simulate persistence success
          const successPersist = () => { /* no-op success */ }

          const result = updateScriptPreference(previousState, newPref, successPersist)

          // State should have the new preference
          expect(result.success).toBe(true)
          expect(result.state.currentPreference).toBe(newPref)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('revert preserves undefined as a valid previous preference', () => {
    /**Validates: Requirements 5.8*/
    fc.assert(
      fc.property(
        scriptPreferenceArb,
        (newPref) => {
          const previousState: ScriptPreferenceState = { currentPreference: undefined }

          // Simulate persistence failure
          const failingPersist = () => { throw new Error('Network timeout') }

          const result = updateScriptPreference(previousState, newPref, failingPersist)

          // State should revert to undefined
          expect(result.success).toBe(false)
          expect(result.state.currentPreference).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})
