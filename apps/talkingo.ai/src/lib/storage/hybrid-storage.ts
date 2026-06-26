/**
 * Hybrid storage orchestrator — preferences only.
 *
 * STORAGE STRATEGY (simplified):
 * - Appwrite DB: user_preferences + learner_profiles (irreplaceable, cross-device)
 * - localStorage: chat sessions (auto-saved transcripts), settings, profile cache
 *
 * The old conversation transcript saving and language_progress sync was removed
 * — those responsibilities now live in chat-sessions.ts and learner-profile.
 */

import type { UserPreferences } from '@talkingo/shared/types'
import {
  saveUserPreferences,
  getUserPreferences,
} from './appwrite-storage'
import { updateAccountPrefs, type AccountPrefsPayload } from '../auth/auth'
import { validatePreferences } from '../utils/onboarding-check'
import { setLocaleCookie } from '../../i18n/locale-cookie'
import {
  loadLocalLifeline,
  saveLocalLifeline,
  loadLocalUserNote,
  saveLocalUserNote,
  syncMemoryToAppwrite,
  loadMemoryFromAppwrite,
} from './learner-memory'
import {
  loadStructuredMemory,
  saveStructuredMemory,
  syncStructuredMemoryToAppwrite,
  loadStructuredMemoryFromAppwrite,
  buildPlannerInjection,
  processSessionEnd,
  updateUserNote,
  type StructuredMemory,
  type SessionEndInput,
} from './structured-memory'

// ─── Settings Storage Interface ──────────────────────────────────────────────

export interface AppSettings {
  micSensitivity: number
  noiseCancellation: boolean
  theme: 'light' | 'dark' | 'auto'
  language: string
  autoSaveTranscripts: boolean
  aiCorrections: boolean
  realTimeTranslation: boolean
  conversationMode: 'casual' | 'professional' | 'academic'
  voiceSpeed: number
  /** When to auto-play AI voice notes in chat mode. */
  autoPlayVoiceNotes?: 'always' | 'handsfree-only' | 'never'
}

// Helper to get user-specific keys
const prefsKey = (userId: string | null) => `talkingo_prefs_${userId || 'anon'}`
const onboardedKey = (userId: string | null) => `talkingo_onboarded_${userId || 'anon'}`
const settingsKey = (userId: string | null) => `talkingo_settings_${userId || 'anon'}`

// ─── Onboarding flag ─────────────────────────────────────────────────────────

export function isOnboarded(userId?: string | null): boolean {
  try {
    const key = onboardedKey(userId || null)
    if (localStorage.getItem(key) === 'true') return true
    const prefs = localStorage.getItem(prefsKey(userId || null))
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs)
        return !!(parsed.targetLanguage && (parsed.level || parsed.talkingoLevel) && parsed.learningGoal)
      } catch {
        return false
      }
    }
    return false
  } catch {
    return false
  }
}

export function markOnboarded(userId?: string | null): void {
  try {
    const key = onboardedKey(userId || null)
    localStorage.setItem(key, 'true')
  } catch {
    // ignore quota errors
  }
}

// ─── Preferences Storage ─────────────────────────────────────────────────────

function essentialPrefsForAccount(p: UserPreferences): AccountPrefsPayload {
  return {
    onboardingComplete: p.onboardingComplete,
    targetLanguage: p.targetLanguage,
    nativeLanguage: p.nativeLanguage,
    level: p.level,
    talkingoLevel: p.talkingoLevel,
    learningGoal: p.learningGoal,
    topic: typeof p.topic === 'string' ? p.topic : undefined,
    correctionStyle: p.correctionStyle,
    persona: p.persona,
    userName: p.userName,
    currentUnitId: p.currentUnitId,
    preferredScript: p.preferredScript,
    learnerGender: p.learnerGender,
    dialect: p.dialect,
    heritageMode: p.heritageMode,
    uiLanguage: p.uiLanguage,
  }
}

export function preferencesFromAccountPrefs(
  ap: AccountPrefsPayload | null | undefined
): UserPreferences | null {
  if (!ap || !ap.targetLanguage) return null
  return {
    level: (ap.level as UserPreferences['level']) ?? 'beginner',
    talkingoLevel: ap.talkingoLevel,
    topic: ap.topic ?? 'general',
    correctionStyle: (ap.correctionStyle as UserPreferences['correctionStyle']) ?? 'silent',
    persona: ap.persona as UserPreferences['persona'],
    userName: ap.userName,
    targetLanguage: ap.targetLanguage as UserPreferences['targetLanguage'],
    nativeLanguage: ap.nativeLanguage,
    learningGoal: ap.learningGoal as UserPreferences['learningGoal'],
    onboardingComplete: ap.onboardingComplete,
    currentUnitId: ap.currentUnitId,
    preferredScript: ap.preferredScript as UserPreferences['preferredScript'],
    learnerGender: ap.learnerGender as UserPreferences['learnerGender'],
    dialect: ap.dialect as UserPreferences['dialect'],
    heritageMode: ap.heritageMode,
    uiLanguage: ap.uiLanguage,
  }
}

export async function savePreferences(
  userId: string | null,
  preferences: UserPreferences,
  isAuthenticated: boolean
): Promise<void> {
  const validation = validatePreferences(preferences)
  if (!validation.isValid) {
    console.warn('[Storage] Saving incomplete preferences:', {
      userId,
      missingFields: validation.missingFields,
    })
  }

  const key = prefsKey(userId)
  try {
    localStorage.setItem(key, JSON.stringify(preferences))
    if (preferences.onboardingComplete) markOnboarded(userId)
  } catch (error) {
    console.error('[Storage] Failed to save preferences to localStorage:', error)
  }

  // Sync the locale cookie so the server can resolve the correct UI language
  // on the next render without waiting for client-side hydration (Req 8.5, 8.8).
  if (preferences.uiLanguage) {
    setLocaleCookie(preferences.uiLanguage)
  }

  if (isAuthenticated && userId) {
    const results = await Promise.allSettled([
      updateAccountPrefs(essentialPrefsForAccount(preferences)),
      saveUserPreferences(userId, preferences),
    ])
    const accountOk = results[0].status === 'fulfilled'
    const docOk = results[1].status === 'fulfilled'
    if (!accountOk) {
      console.warn('[Storage] Account prefs sync failed:', (results[0] as PromiseRejectedResult).reason)
    }
    if (!docOk) {
      console.warn('[Storage] Document sync failed:', (results[1] as PromiseRejectedResult).reason)
    }
  }
}

/**
 * Save preferences and throw if persistence fails.
 * Used by features that need to detect failure and revert optimistic state
 * (e.g., script preference toggle revert-on-failure).
 */
export async function savePreferencesStrict(
  userId: string | null,
  preferences: UserPreferences,
  isAuthenticated: boolean
): Promise<void> {
  const validation = validatePreferences(preferences)
  if (!validation.isValid) {
    console.warn('[Storage] Saving incomplete preferences:', {
      userId,
      missingFields: validation.missingFields,
    })
  }

  const key = prefsKey(userId)
  try {
    localStorage.setItem(key, JSON.stringify(preferences))
    if (preferences.onboardingComplete) markOnboarded(userId)
  } catch (error) {
    console.error('[Storage] Failed to save preferences to localStorage:', error)
    throw new Error('Failed to persist preferences locally')
  }

  // Sync the locale cookie for immediate server-side resolution (Req 8.5, 8.8).
  if (preferences.uiLanguage) {
    setLocaleCookie(preferences.uiLanguage)
  }

  if (isAuthenticated && userId) {
    const results = await Promise.allSettled([
      updateAccountPrefs(essentialPrefsForAccount(preferences)),
      saveUserPreferences(userId, preferences),
    ])
    const accountOk = results[0].status === 'fulfilled'
    const docOk = results[1].status === 'fulfilled'
    if (!accountOk) {
      const reason = (results[0] as PromiseRejectedResult).reason
      console.warn('[Storage] Account prefs sync failed:', reason)
      throw new Error('Failed to persist preferences to account')
    }
    if (!docOk) {
      const reason = (results[1] as PromiseRejectedResult).reason
      console.warn('[Storage] Document sync failed:', reason)
      throw new Error('Failed to persist preferences to document store')
    }
  }
}

export async function loadPreferences(
  userId: string | null,
  isAuthenticated: boolean,
  accountPrefs?: AccountPrefsPayload | null
): Promise<UserPreferences | null> {
  // Path 1: Account Prefs (instant, zero-network)
  const fromAccount = preferencesFromAccountPrefs(accountPrefs)
  if (fromAccount && fromAccount.onboardingComplete) {
    try {
      localStorage.setItem(prefsKey(userId), JSON.stringify(fromAccount))
    } catch { /* ignore */ }

    // Ensure locale cookie stays in sync with loaded preference
    if (fromAccount.uiLanguage) {
      setLocaleCookie(fromAccount.uiLanguage)
    }

    if (isAuthenticated && userId) {
      void getUserPreferences(userId).then(doc => {
        if (!doc) return
        const enriched: UserPreferences = {
          ...fromAccount,
        }
        try { localStorage.setItem(prefsKey(userId), JSON.stringify(enriched)) } catch { /* ignore */ }
      }).catch(() => { /* non-critical */ })
    }
    return fromAccount
  }

  // Path 2: user_preferences document
  let backendPrefs: UserPreferences | null = null
  if (isAuthenticated && userId) {
    try {
      const doc = await getUserPreferences(userId)
      if (doc) {
        backendPrefs = {
          level: doc.level,
          talkingoLevel: doc.talkingoLevel,
          topic: doc.topic,
          correctionStyle: doc.correctionStyle,
          persona: doc.persona,
          userName: doc.userName || undefined,
          targetLanguage: doc.targetLanguage,
          nativeLanguage: doc.nativeLanguage,
          learningGoal: doc.learningGoal,
          onboardingComplete: doc.onboardingComplete,
          currentUnitId: doc.currentUnitId,
          preferredScript: doc.preferredScript,
          learnerGender: doc.learnerGender,
          dialect: doc.dialect,
          heritageMode: doc.heritageMode,
          uiLanguage: doc.uiLanguage,
        }
        try {
          localStorage.setItem(prefsKey(userId), JSON.stringify(backendPrefs))
        } catch { /* ignore */ }

        if (backendPrefs.onboardingComplete && !accountPrefs?.onboardingComplete) {
          void updateAccountPrefs(essentialPrefsForAccount(backendPrefs)).catch(() => {})
        }
      }
    } catch (error) {
      console.warn('[Storage] Backend document load failed:', error)
    }
  }

  if (backendPrefs) {
    // Ensure locale cookie stays in sync with backend preference
    if (backendPrefs.uiLanguage) {
      setLocaleCookie(backendPrefs.uiLanguage)
    }
    return backendPrefs
  }
  if (fromAccount) return fromAccount

  // Path 3: localStorage fallback
  try {
    const saved = localStorage.getItem(prefsKey(userId))
    if (saved) return JSON.parse(saved)
  } catch (error) {
    console.error('[Storage] Failed to load preferences from localStorage:', error)
  }

  return null
}

// ─── App Settings Storage (localStorage ONLY) ───────────────────────────────

export function saveSettings(settings: AppSettings, userId?: string | null): void {
  try {
    localStorage.setItem(settingsKey(userId ?? null), JSON.stringify(settings))
  } catch (error) {
    console.error('[Storage] Failed to save settings:', error)
  }
}

export function loadSettings(userId?: string | null): AppSettings | null {
  try {
    const saved = localStorage.getItem(settingsKey(userId ?? null))
    if (saved) return JSON.parse(saved)
  } catch (error) {
    console.error('[Storage] Failed to load settings:', error)
  }
  return null
}

// ─── Memory Lifeline Storage ────────────────────────────────────────────────

export function saveMemoryLifeline(
  userId: string | null,
  text: string
): void {
  saveLocalLifeline(userId, text)
}

export function loadMemoryLifeline(userId: string | null): string {
  return loadLocalLifeline(userId)
}

export function saveUserNoteLifeline(
  userId: string | null,
  text: string
): void {
  saveLocalUserNote(userId, text)
}

export function loadUserNoteLifeline(userId: string | null): string {
  return loadLocalUserNote(userId)
}

export async function syncMemoryLifelineToAppwrite(
  userId: string,
  memoryLifeline: string,
  userNote: string
): Promise<void> {
  await syncMemoryToAppwrite(userId, memoryLifeline, userNote)
}

export async function loadMemoryLifelineFromAppwrite(
  userId: string
): Promise<{ memoryLifeline: string; userNote: string }> {
  return loadMemoryFromAppwrite(userId)
}

// ─── Structured Memory (new system) ─────────────────────────────────────────

export { type StructuredMemory, type SessionEndInput } from './structured-memory'

/**
 * Load structured memory — tries localStorage first, then Appwrite.
 * Returns memory + computed planner injection for the prompt.
 */
export function loadLocalStructuredMemory(userId: string | null): {
  memory: StructuredMemory
  plannerInjection: string
} {
  const memory = loadStructuredMemory(userId)
  const plannerInjection = buildPlannerInjection(memory)
  return { memory, plannerInjection }
}

/**
 * Process a session end and save updated structured memory.
 * Call this when endSession() is called — it updates vocab, errors, summaries.
 */
export function processAndSaveSessionEnd(
  userId: string | null,
  input: SessionEndInput
): StructuredMemory {
  const current = loadStructuredMemory(userId)
  const updated = processSessionEnd(current, input)
  saveStructuredMemory(userId, updated)
  return updated
}

/**
 * Update user note in structured memory.
 */
export function saveStructuredUserNote(userId: string | null, note: string): void {
  const memory = loadStructuredMemory(userId)
  const updated = updateUserNote(memory, note)
  saveStructuredMemory(userId, updated)
}

/**
 * Sync structured memory to Appwrite (fire-and-forget).
 */
export async function syncStructuredMemoryRemote(userId: string): Promise<void> {
  const memory = loadStructuredMemory(userId)
  await syncStructuredMemoryToAppwrite(userId, memory)
}

/**
 * Load structured memory from Appwrite and merge with local.
 * Remote wins for newer data (based on session count).
 */
export async function loadAndMergeStructuredMemory(
  userId: string
): Promise<{ memory: StructuredMemory; plannerInjection: string }> {
  const local = loadStructuredMemory(userId)
  const remote = await loadStructuredMemoryFromAppwrite(userId)

  // Use whichever has more sessions (more complete data wins)
  const winner = remote.sessions.length > local.sessions.length ? remote : local

  // Merge user note: prefer non-empty
  if (!winner.userNote && (local.userNote || remote.userNote)) {
    winner.userNote = local.userNote || remote.userNote
  }

  saveStructuredMemory(userId, winner)
  const plannerInjection = buildPlannerInjection(winner)
  return { memory: winner, plannerInjection }
}
