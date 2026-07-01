'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { ScriptPreference, UserPreferences } from '@talkingo/shared/types'
import { savePreferencesStrict } from '@/lib/storage/hybrid-storage'
import { getEffectiveScriptPreference, hasScriptOptions } from '@talkingo/shared/languages'
import type { TargetLanguage } from '@talkingo/shared/types'

export interface UseScriptPreferenceOptions {
  /** Current preferences object */
  preferences: UserPreferences | null
  /** Currently authenticated user ID */
  userId: string | null
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Setter for the preferences state in the parent component */
  setPreferences: (prefs: UserPreferences) => void
  /** Optional callback to update conversation state after a successful change */
  onScriptChanged?: (newScript: ScriptPreference) => void
}

export interface UseScriptPreferenceReturn {
  /** The effective script preference (resolves default to 'native') */
  effectiveScript: ScriptPreference
  /** Whether the script toggle should be shown for the current target language */
  showScriptToggle: boolean
  /** Change the script preference with optimistic update + revert-on-failure */
  changeScript: (newScript: ScriptPreference) => void
}

/**
 * Hook that manages script preference with an optimistic update + revert-on-failure pattern.
 *
 * - Applies the new script immediately to local state (optimistic update)
 * - Persists within 2 seconds via `savePreferencesStrict`
 * - On failure: reverts to the previous value and shows an error toast
 * - Defaults to 'native' when no preference is set
 *
 * Requirement References: 5.4, 5.7, 5.8
 */
export function useScriptPreference({
  preferences,
  userId,
  isAuthenticated,
  setPreferences,
  onScriptChanged,
}: UseScriptPreferenceOptions): UseScriptPreferenceReturn {
  const savingRef = useRef(false)

  const targetLanguage = preferences?.targetLanguage as TargetLanguage | undefined
  const showScriptToggle = hasScriptOptions(targetLanguage)
  const effectiveScript = getEffectiveScriptPreference(targetLanguage, preferences?.preferredScript)

  const changeScript = useCallback((newScript: ScriptPreference) => {
    if (!preferences) return
    if (savingRef.current) return // Prevent concurrent saves

    const previousScript = preferences.preferredScript

    // Optimistic update: apply new script immediately to local state
    const updatedPrefs: UserPreferences = { ...preferences, preferredScript: newScript }
    setPreferences(updatedPrefs)

    // Notify parent immediately so rendered messages update without page reload
    onScriptChanged?.(newScript)

    // Persist asynchronously with revert-on-failure
    savingRef.current = true
    savePreferencesStrict(userId, updatedPrefs, isAuthenticated)
      .then(() => {
        // Success — no action needed, optimistic state is correct
        savingRef.current = false
      })
      .catch((error) => {
        console.error('[useScriptPreference] Persistence failed, reverting:', error)
        savingRef.current = false

        // Revert to previous value
        const revertedPrefs: UserPreferences = { ...preferences, preferredScript: previousScript }
        setPreferences(revertedPrefs)

        // Show error toast
        toast.error('Script preference was not saved. Please try again.')
      })
  }, [preferences, userId, isAuthenticated, setPreferences, onScriptChanged])

  return {
    effectiveScript,
    showScriptToggle,
    changeScript,
  }
}
