/**
 * Unified onboarding validation logic
 * 
 * This module provides a single source of truth for determining whether
 * a user needs to complete onboarding. It prioritizes server data over
 * local storage and validates that ALL essential fields are present.
 */

import type { UserPreferences } from '@talkingo/shared/types'

/**
 * Checks if a user has completed onboarding based on their preferences.
 * 
 * Priority order:
 * 1. Server flag (onboardingComplete === true) - highest authority
 * 2. Essential data validation (targetLanguage + level)
 * 3. Local storage fallback (for offline scenarios)
 * 
 * @param prefs - User preferences from server or local storage
 * @param userId - Current user ID (for logging/debugging)
 * @returns true if user should skip onboarding, false otherwise
 */
export function shouldSkipOnboarding(
  prefs: UserPreferences | null,
  userId?: string | null
): boolean {
  // No preferences at all → must onboard
  if (!prefs) {
    console.log('[Onboarding] No preferences found, showing onboarding')
    return false
  }

  // ── Priority 1: Explicit server flag ──────────────────────────────────────
  if (prefs.onboardingComplete === true) {
    console.log('[Onboarding] Server flag confirms onboarding complete')
    return true
  }

  // ── Priority 2: Validate essential data exists ────────────────────────────
  // A user is considered onboarded if they have the minimum viable profile:
  // - targetLanguage (what language they're learning)
  // - level OR talkingoLevel (their proficiency level)
  
  const hasTargetLanguage = !!prefs.targetLanguage
  const hasLevel = !!(prefs.level || prefs.talkingoLevel)
  
  const hasEssentialData = hasTargetLanguage && hasLevel

  if (hasEssentialData) {
    console.log('[Onboarding] Essential data present, skipping onboarding', {
      targetLanguage: prefs.targetLanguage,
      level: prefs.level || prefs.talkingoLevel,
    })
    return true
  }

  // ── Priority 3: Partial data warning ──────────────────────────────────────
  // If we have SOME data but not all, log a warning for debugging
  if (hasTargetLanguage || hasLevel) {
    console.warn('[Onboarding] Partial data detected, forcing re-onboarding', {
      userId,
      hasTargetLanguage,
      hasLevel,
      prefs,
    })
  } else {
    console.log('[Onboarding] No essential data, showing onboarding')
  }

  return false
}

/**
 * Validates that user preferences contain all required fields.
 * Use this before saving to ensure data integrity.
 */
export function validatePreferences(prefs: UserPreferences): {
  isValid: boolean
  missingFields: string[]
} {
  const missingFields: string[] = []

  if (!prefs.targetLanguage) missingFields.push('targetLanguage')
  if (!prefs.level && !prefs.talkingoLevel) missingFields.push('level or talkingoLevel')
  if (!prefs.userName) missingFields.push('userName')

  return {
    isValid: missingFields.length === 0,
    missingFields,
  }
}
