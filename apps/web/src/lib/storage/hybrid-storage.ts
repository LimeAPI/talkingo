/**
 * Hybrid storage orchestrator.
 *
 * STORAGE STRATEGY (optimized):
 * - Appwrite DB: preferences + language_progress + session_analytics (irreplaceable)
 * - localStorage: conversations, settings, preferences cache, progress cache (reconstructable)
 * - In-memory: corrections, vocab, signals, transcript (session-scoped, discarded at end)
 *
 * Per-session DB I/O: 1 read (~5KB at start) + 2 writes (~5.5KB at end) = ~10.5KB total.
 * Zero DB writes during active session — all accumulation happens in-memory.
 */

import type { UserPreferences, LanguageProgress, TargetLanguage } from '@talkingo/shared/types'
import type { SavedConversation } from '../utils/conversation-history'
import {
  saveUserPreferences,
  getUserPreferences,
  saveLanguageProgress,
  getLanguageProgress,
} from './appwrite-storage'
import { updateAccountPrefs, type AccountPrefsPayload } from '../auth/auth'
import {
  saveConversation as saveConvLocal,
  getConversations as getConvLocal,
  deleteConversation as deleteConvLocal,
  clearAllConversations as clearAllLocal,
} from '../utils/conversation-history'
import { validatePreferences } from '../utils/onboarding-check'

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
    // Backwards-compat: if prefs exist for this user, treat as onboarded.
    const prefs = localStorage.getItem(prefsKey(userId || null))
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs)
        return !!(parsed.targetLanguage && (parsed.level || parsed.cefr) && parsed.learningGoal)
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

/**
 * Pulls the essential onboarding fields out of UserPreferences for mirroring
 * to Appwrite Account Preferences.
 */
function essentialPrefsForAccount(p: UserPreferences): AccountPrefsPayload {
  return {
    onboardingComplete: p.onboardingComplete,
    targetLanguage: p.targetLanguage,
    nativeLanguage: p.nativeLanguage,
    level: p.level,
    cefr: p.cefr,
    learningGoal: p.learningGoal,
    topic: typeof p.topic === 'string' ? p.topic : undefined,
    correctionStyle: p.correctionStyle,
    persona: p.persona,
    userName: p.userName,
    currentUnitId: p.currentUnitId,
    preferredScript: p.preferredScript,
    learnerGender: p.learnerGender,
  }
}

/**
 * Reconstructs a UserPreferences object from Account Preferences.
 */
export function preferencesFromAccountPrefs(
  ap: AccountPrefsPayload | null | undefined
): UserPreferences | null {
  if (!ap || !ap.targetLanguage) return null
  return {
    level: (ap.level as UserPreferences['level']) ?? 'beginner',
    cefr: ap.cefr as UserPreferences['cefr'],
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
  }
}

export async function savePreferences(
  userId: string | null,
  preferences: UserPreferences,
  isAuthenticated: boolean
): Promise<void> {
  // Validate preferences before saving
  const validation = validatePreferences(preferences)
  if (!validation.isValid) {
    console.warn('[Storage] Saving incomplete preferences:', {
      userId,
      missingFields: validation.missingFields,
      preferences,
    })
  }

  const key = prefsKey(userId)
  // Always save to localStorage as cache
  try {
    localStorage.setItem(key, JSON.stringify(preferences))
    if (preferences.onboardingComplete) markOnboarded(userId)
  } catch (error) {
    console.error('[Storage] Failed to save preferences to localStorage:', error)
  }

  // If authenticated, sync to both backend stores in parallel
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

export async function loadPreferences(
  userId: string | null,
  isAuthenticated: boolean,
  accountPrefs?: AccountPrefsPayload | null
): Promise<UserPreferences | null> {
  // ── Path 1: Account Prefs (instant, zero-network, bulletproof) ──────────
  const fromAccount = preferencesFromAccountPrefs(accountPrefs)
  if (fromAccount && fromAccount.onboardingComplete) {
    // Cache to localStorage
    try {
      localStorage.setItem(prefsKey(userId), JSON.stringify(fromAccount))
    } catch { /* ignore */ }

    // Best-effort: enrich with the full document in the background
    if (isAuthenticated && userId) {
      void getUserPreferences(userId).then(doc => {
        if (!doc) return
        const enriched: UserPreferences = {
          ...fromAccount,
          domainScores: doc.domainScores ?? fromAccount.domainScores,
        }
        try { localStorage.setItem(prefsKey(userId), JSON.stringify(enriched)) } catch { /* ignore */ }
      }).catch(() => { /* non-critical */ })
    }
    return fromAccount
  }

  // ── Path 2: user_preferences document (full data) ──────────────────────
  let backendPrefs: UserPreferences | null = null
  if (isAuthenticated && userId) {
    try {
      const doc = await getUserPreferences(userId)
      if (doc) {
        backendPrefs = {
          level: doc.level,
          cefr: doc.cefr,
          domainScores: doc.domainScores,
          topic: doc.topic,
          correctionStyle: doc.correctionStyle,
          persona: doc.persona,
          userName: doc.userName || undefined,
          targetLanguage: doc.targetLanguage,
          learningGoal: doc.learningGoal,
          onboardingComplete: doc.onboardingComplete,
          currentUnitId: doc.currentUnitId,
        }
        try {
          localStorage.setItem(prefsKey(userId), JSON.stringify(backendPrefs))
        } catch { /* ignore */ }

        // Self-healing: push to account prefs if stale
        if (backendPrefs.onboardingComplete && !accountPrefs?.onboardingComplete) {
          void updateAccountPrefs(essentialPrefsForAccount(backendPrefs)).catch(() => {})
        }
      }
    } catch (error) {
      console.warn('[Storage] Backend document load failed:', error)
    }
  }

  if (backendPrefs) return backendPrefs

  // ── Path 3: Account prefs (partial) ────────────────────────────────────
  if (fromAccount) return fromAccount

  // ── Path 4: localStorage fallback ──────────────────────────────────────
  try {
    const saved = localStorage.getItem(prefsKey(userId))
    if (saved) return JSON.parse(saved)
  } catch (error) {
    console.error('[Storage] Failed to load preferences from localStorage:', error)
  }

  return null
}

// ─── Language Progress Storage ───────────────────────────────────────────────

const progressKey = (userId: string | null, lang: TargetLanguage) =>
  `talkingo_progress_${userId || 'anon'}_${lang}`

export async function saveProgress(
  userId: string | null,
  isAuthenticated: boolean,
  progress: LanguageProgress
): Promise<void> {
  // Always save to localStorage (instant)
  try {
    localStorage.setItem(progressKey(userId, progress.targetLanguage), JSON.stringify(progress))
  } catch (error) {
    console.error('[Storage] Failed to save progress to localStorage:', error)
  }
  
  // Sync to Appwrite (the one critical DB write per session)
  if (isAuthenticated && userId) {
    try {
      await saveLanguageProgress(userId, progress)
    } catch (error) {
      console.warn('[Storage] Backend progress sync failed, queuing for retry:', error)
      // Queue for offline sync retry
      const { queuePendingSync } = await import('./offline-sync')
      queuePendingSync({
        type: 'progress',
        userId,
        data: progress,
      })
    }
  }
}

export async function loadProgress(
  userId: string | null,
  isAuthenticated: boolean,
  targetLanguage: TargetLanguage
): Promise<LanguageProgress | null> {
  // Try Appwrite first (authoritative)
  if (isAuthenticated && userId) {
    try {
      const backend = await getLanguageProgress(userId, targetLanguage)
      if (backend) {
        const normalized = normalizeProgress(backend, targetLanguage)
        try { localStorage.setItem(progressKey(userId, targetLanguage), JSON.stringify(normalized)) } catch { /* ignore */ }
        return normalized
      }
    } catch (error) {
      console.warn('[Storage] Backend progress load failed:', error)
    }
  }
  // Fall back to localStorage
  try {
    const saved = localStorage.getItem(progressKey(userId, targetLanguage))
    if (saved) return normalizeProgress(JSON.parse(saved), targetLanguage)
  } catch (error) {
    console.error('[Storage] Failed to load progress from localStorage:', error)
  }
  return null
}

/**
 * Backfills missing fields on stored LanguageProgress.
 */
function normalizeProgress(p: any, targetLanguage: TargetLanguage): LanguageProgress {
  return {
    targetLanguage: p?.targetLanguage ?? targetLanguage,
    cefr: p?.cefr ?? 'A1',
    domainScores: p?.domainScores ?? {
      vocabulary: p?.cefr ?? 'A1',
      grammar: p?.cefr ?? 'A1',
      fluency: p?.cefr ?? 'A1',
      listening: p?.cefr ?? 'A1',
    },
    currentUnitId: p?.currentUnitId ?? 'greetings',
    completedUnits: Array.isArray(p?.completedUnits) ? p.completedUnits : [],
    trackedVocab: Array.isArray(p?.trackedVocab) ? p.trackedVocab : [],
    // Handle both old string[] and new WeakPattern[] formats
    weakPatterns: Array.isArray(p?.weakPatterns) 
      ? p.weakPatterns.map((wp: any) => 
          typeof wp === 'string' 
            ? { type: 'grammar' as const, category: wp, description: wp, examples: [], frequency: 1, severity: 'low' as const, lastSeen: new Date().toISOString() }
            : wp
        )
      : [],
    totalSessions: p?.totalSessions ?? 0,
    totalMinutes: p?.totalMinutes ?? 0,
    streakDays: p?.streakDays ?? 0,
    lastSessionAt: p?.lastSessionAt,
    sessionsSinceLastAssessment: p?.sessionsSinceLastAssessment ?? 0,
  }
}

// ─── Conversation Storage (localStorage ONLY) ───────────────────────────────
// Transcripts are large (5-50KB) and only needed for recap generation.
// After recap, they're compressed 96% and the raw transcript is discarded.
// We keep last 50 in localStorage for "recent sessions" display.

export async function saveConversation(
  userId: string | null,
  conversation: Omit<SavedConversation, 'id' | 'timestamp'>,
  _isAuthenticated: boolean
): Promise<SavedConversation> {
  return saveConvLocal(conversation, userId)
}

export async function getConversations(
  userId: string | null,
  _isAuthenticated: boolean
): Promise<SavedConversation[]> {
  return getConvLocal(userId)
}

export async function deleteConversation(
  userId: string | null,
  conversationId: string,
  _isAuthenticated: boolean
): Promise<boolean> {
  return deleteConvLocal(conversationId, userId)
}

export async function clearAllConversations(
  userId: string | null,
  _isAuthenticated: boolean
): Promise<void> {
  clearAllLocal(userId)
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
