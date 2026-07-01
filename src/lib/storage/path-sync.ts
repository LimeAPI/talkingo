/**
 * Path-progress cross-device sync.
 *
 * Bridges the device-local lesson-progress store (single key, reflects the
 * ACTIVE target language) with the per-language compact code persisted in
 * UserPreferences.pathProgress (which syncs to Appwrite).
 *
 * Strategy:
 * - The local store always represents the language currently being practiced.
 * - pathProgress holds { [lang]: code } for every language the user has touched.
 * - On load: decode the active language's remote code, MERGE it into local
 *   (ratcheting up only), then re-encode — lossless across devices.
 * - On language switch: stash the current local state under the old language,
 *   then replace local with the new language's decoded state.
 */

import type { UserPreferences } from '@talkingo/shared/types'
import { encodeProgress, decodeProgress } from '@talkingo/shared/curriculum/progress-code'
import { exportLessonStates, applyLessonStates, replaceLessonStates } from './lesson-progress'

type ProgressMap = Record<string, string>

function activeLang(prefs: UserPreferences): string {
  return (prefs.targetLanguage as string) || 'en'
}

function parseMap(raw: string | undefined): ProgressMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ProgressMap
    }
  } catch { /* corrupt — start fresh */ }
  return {}
}

function serializeMap(map: ProgressMap): string {
  return JSON.stringify(map)
}

/**
 * Merge the active language's remote code into the local store and return an
 * updated pathProgress string if anything changed. Call right after
 * preferences load (and the user is known).
 *
 * Returns { pathProgress, changed } — when `changed` is true the caller should
 * persist the updated preferences so the merged code propagates back.
 */
export function mergePathProgressOnLoad(prefs: UserPreferences): { pathProgress: string; changed: boolean } {
  const lang = activeLang(prefs)
  const map = parseMap(prefs.pathProgress)

  const remoteStates = decodeProgress(map[lang])
  // Pull remote into local (ratchet up). 'true' means local actually changed.
  applyLessonStates(remoteStates)

  // Re-encode the merged local state and compare to what was stored.
  const mergedCode = encodeProgress(exportLessonStates())
  const changed = mergedCode !== (map[lang] ?? '')
  if (changed) map[lang] = mergedCode

  return { pathProgress: serializeMap(map), changed }
}

/**
 * Encode the current local state under the active language. Call after a
 * session changes progress so the new state is captured into preferences
 * (which the caller then persists/syncs).
 */
export function captureActiveProgress(prefs: UserPreferences): string {
  const lang = activeLang(prefs)
  const map = parseMap(prefs.pathProgress)
  map[lang] = encodeProgress(exportLessonStates())
  return serializeMap(map)
}

/**
 * Switch the active target language: stash the current local state under the
 * previous language, then load the new language's state into the local store.
 * Returns the updated pathProgress string (caller also sets prefs.targetLanguage).
 */
export function switchLanguageProgress(prefs: UserPreferences, newLang: string): string {
  const oldLang = activeLang(prefs)
  const map = parseMap(prefs.pathProgress)

  if (oldLang !== newLang) {
    // Save what we have for the language we're leaving.
    map[oldLang] = encodeProgress(exportLessonStates())
    // Load the language we're entering into the local store.
    replaceLessonStates(decodeProgress(map[newLang]))
  }

  return serializeMap(map)
}
