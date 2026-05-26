/**
 * Appwrite storage service — ONLY for irreplaceable, cross-device data.
 *
 * STORAGE STRATEGY (optimized):
 * Collections used:
 * - user_preferences: Onboarding data, persona, language (set once, synced cross-device)
 * - language_progress: Domain scores, SRS vocab, weak patterns, streak (core progress)
 * - session_analytics: Per-session metrics for admin dashboard (~500B each)
 *
 * Collections REMOVED (moved to localStorage-only):
 * - conversations: Transcripts are large (5-50KB), processed then discarded
 * - character_memory: Device-specific feel, AI rebuilds in 2-3 sessions
 * - tracked_phrases: Auto-extracted, cheap to regenerate
 *
 * This reduces DB I/O to ~10.5KB per session (1 read + 2 writes at session end).
 */

import { databases } from '../api/appwrite'
import { Query, Permission, Role } from 'appwrite'
import type {
  UserPreferences,
  PersonaId,
  TargetLanguage,
  LearningGoal,
  CefrLevel,
  LanguageProgress,
  DomainScores,
  SessionAnalytics,
} from '@talkingo/shared/types'

// ─── Appwrite Configuration ──────────────────────────────────────────────────
const DATABASE_ID = 'talkingo_db'
const PREFERENCES_COLLECTION = 'user_preferences'
const PROGRESS_COLLECTION = 'language_progress'
const ANALYTICS_COLLECTION = 'session_analytics'

// ─── Retry Helper ────────────────────────────────────────────────────────────

interface RetryOptions {
  /** Max number of attempts (default: 3) */
  maxAttempts?: number
  /** Base delay in ms for exponential backoff (default: 300) */
  baseDelayMs?: number
  /** Label for logging */
  label?: string
  /** Extra context for logging */
  userId?: string
}

/**
 * Wraps an async Appwrite call with exponential-backoff retries.
 * Delays: 300ms → 900ms → 2700ms (3 attempts total by default).
 * Returns null on final failure instead of throwing, so callers can
 * gracefully fall back to localStorage rather than crashing.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T | null> {
  const { maxAttempts = 3, baseDelayMs = 300, label = 'appwrite', userId } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isLast = attempt === maxAttempts
      // Don't retry on 4xx client errors (bad query, permission denied, etc.)
      const statusCode = error?.code ?? error?.status ?? 0
      const isClientError = statusCode >= 400 && statusCode < 500
      if (isClientError || isLast) {
        console.error(
          `[Appwrite] ${label} failed after ${attempt} attempt(s)`,
          { userId, statusCode, error }
        )
        return null
      }
      const delay = baseDelayMs * Math.pow(3, attempt - 1)
      console.warn(
        `[Appwrite] ${label} attempt ${attempt} failed, retrying in ${delay}ms…`,
        { userId, statusCode }
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return null
}

// ─── User Preferences Service ────────────────────────────────────────────────

export interface UserPreferencesDoc {
  userId: string
  userName?: string
  level: 'beginner' | 'intermediate' | 'advanced'
  cefr?: CefrLevel
  domainScores?: DomainScores
  topic: string
  correctionStyle: 'direct' | 'silent'
  persona: PersonaId
  targetLanguage?: TargetLanguage
  nativeLanguage?: string
  learningGoal?: LearningGoal
  onboardingComplete?: boolean
  currentUnitId?: string
  preferredScript?: 'native' | 'latin' | 'both'
  learnerGender?: 'masculine' | 'feminine'
  createdAt: number
  updatedAt: number
}

/**
 * Builds the row-level permissions that grant the owning user full access.
 */
function ownerPermissions(userId: string): string[] {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ]
}

/**
 * Sanitizes the userId for use as an Appwrite document ID.
 */
function docIdForUser(userId: string): string {
  return userId
}

export async function saveUserPreferences(
  userId: string,
  preferences: UserPreferences
): Promise<void> {
  const docId = docIdForUser(userId)
  const doc = {
    userId,
    userName: preferences.userName || undefined,
    level: preferences.level,
    cefr: preferences.cefr,
    domainScores: preferences.domainScores ? JSON.stringify(preferences.domainScores) as any : undefined,
    topic: preferences.topic,
    correctionStyle: preferences.correctionStyle,
    persona: preferences.persona || 'eli',
    targetLanguage: preferences.targetLanguage,
    nativeLanguage: preferences.nativeLanguage,
    learnerGender: preferences.learnerGender,
    preferredScript: preferences.preferredScript,
    learningGoal: preferences.learningGoal,
    onboardingComplete: preferences.onboardingComplete ?? true,
    currentUnitId: preferences.currentUnitId,
    updatedAt: Date.now(),
  }

  // Idempotent upsert: try update first, fall back to create on 404.
  try {
    await databases.updateDocument(DATABASE_ID, PREFERENCES_COLLECTION, docId, doc)
    return
  } catch (error: any) {
    const code = error?.code ?? error?.status ?? 0
    if (code !== 404) {
      console.error('[Appwrite] updateDocument(preferences) failed:', error)
      throw error
    }
  }

  try {
    await databases.createDocument(
      DATABASE_ID,
      PREFERENCES_COLLECTION,
      docId,
      { ...doc, createdAt: Date.now() },
      ownerPermissions(userId),
    )
  } catch (error: any) {
    const code = error?.code ?? error?.status ?? 0
    if (code === 409) {
      await databases.updateDocument(DATABASE_ID, PREFERENCES_COLLECTION, docId, doc)
      return
    }
    console.error('[Appwrite] createDocument(preferences) failed:', error)
    throw error
  }
}

export async function getUserPreferences(userId: string): Promise<UserPreferencesDoc | null> {
  return withRetry(async () => {
    // Primary: direct getDocument by ID (O(1))
    try {
      const doc = await databases.getDocument(DATABASE_ID, PREFERENCES_COLLECTION, docIdForUser(userId))
      return doc as unknown as UserPreferencesDoc
    } catch (error: any) {
      const code = error?.code ?? error?.status ?? 0
      if (code !== 404) throw error
    }

    // Fallback: legacy documents created with `unique()` IDs
    const response = await databases.listDocuments(DATABASE_ID, PREFERENCES_COLLECTION, [
      Query.equal('userId', userId),
      Query.limit(1),
    ])
    if (response.documents.length === 0) return null
    return response.documents[0] as unknown as UserPreferencesDoc
  }, { label: 'getUserPreferences', userId })
}

// ─── Language Progress Service ───────────────────────────────────────────────

export interface LanguageProgressDoc extends LanguageProgress {
  userId: string
  updatedAt: number
}

export async function saveLanguageProgress(
  userId: string,
  progress: LanguageProgress
): Promise<void> {
  // Deterministic doc ID — one row per (user, language).
  const docId = `${userId}_${progress.targetLanguage}`
  // weakPatterns in Appwrite is string[] with max 64 chars per item.
  // The in-memory WeakPattern type is a complex object that exceeds this limit.
  // We serialize both trackedVocab and weakPatterns together into the trackedVocab
  // JSON blob so no schema change is needed.
  const vocabBlob = JSON.stringify({
    vocab: progress.trackedVocab ?? [],
    weakPatterns: progress.weakPatterns ?? [],
  })
  const doc = {
    userId,
    ...progress,
    domainScores: JSON.stringify(progress.domainScores) as any,
    trackedVocab: vocabBlob as any,
    // Clear the weakPatterns string[] column — real data is in trackedVocab blob
    weakPatterns: [] as string[],
    updatedAt: Date.now(),
  }

  try {
    await databases.updateDocument(DATABASE_ID, PROGRESS_COLLECTION, docId, doc)
    return
  } catch (error: any) {
    const code = error?.code ?? error?.status ?? 0
    if (code !== 404) {
      console.error('[Appwrite] updateDocument(progress) failed:', error)
      throw error
    }
  }

  try {
    await databases.createDocument(
      DATABASE_ID,
      PROGRESS_COLLECTION,
      docId,
      doc,
      ownerPermissions(userId),
    )
  } catch (error: any) {
    const code = error?.code ?? error?.status ?? 0
    if (code === 409) {
      await databases.updateDocument(DATABASE_ID, PROGRESS_COLLECTION, docId, doc)
      return
    }
    console.error('[Appwrite] createDocument(progress) failed:', error)
    throw error
  }
}

export async function getLanguageProgress(
  userId: string,
  targetLanguage: TargetLanguage
): Promise<LanguageProgress | null> {
  const d = await withRetry(async () => {
    const docId = `${userId}_${targetLanguage}`
    // Primary: direct getDocument by deterministic ID
    try {
      return await databases.getDocument(DATABASE_ID, PROGRESS_COLLECTION, docId) as any
    } catch (error: any) {
      const code = error?.code ?? error?.status ?? 0
      if (code !== 404) throw error
    }

    // Fallback for legacy documents
    const response = await databases.listDocuments(DATABASE_ID, PROGRESS_COLLECTION, [
      Query.equal('userId', userId),
      Query.equal('targetLanguage', targetLanguage),
      Query.limit(1),
    ])
    if (response.documents.length === 0) return null
    return response.documents[0] as any
  }, { label: 'getLanguageProgress', userId })

  if (!d) return null
  // trackedVocab may be a combined blob { vocab, weakPatterns } (new format)
  // or a plain array JSON string (legacy format).
  let parsedVocab: any[] = []
  let parsedWeakPatterns: any[] = []
  if (d.trackedVocab) {
    try {
      const blob = JSON.parse(d.trackedVocab)
      if (blob && typeof blob === 'object' && !Array.isArray(blob) && blob.vocab) {
        // New combined format
        parsedVocab = Array.isArray(blob.vocab) ? blob.vocab : []
        parsedWeakPatterns = Array.isArray(blob.weakPatterns) ? blob.weakPatterns : []
      } else if (Array.isArray(blob)) {
        // Legacy: plain array
        parsedVocab = blob
        parsedWeakPatterns = d.weakPatterns ?? []
      }
    } catch {
      parsedVocab = []
      parsedWeakPatterns = d.weakPatterns ?? []
    }
  } else {
    parsedWeakPatterns = d.weakPatterns ?? []
  }
  return {
    targetLanguage: d.targetLanguage,
    cefr: d.cefr,
    domainScores: d.domainScores ? JSON.parse(d.domainScores) : { vocabulary: d.cefr ?? 'A1', grammar: d.cefr ?? 'A1', fluency: d.cefr ?? 'A1', listening: d.cefr ?? 'A1' },
    currentUnitId: d.currentUnitId,
    completedUnits: d.completedUnits ?? [],
    trackedVocab: parsedVocab,
    weakPatterns: parsedWeakPatterns,
    totalSessions: d.totalSessions ?? 0,
    totalMinutes: d.totalMinutes ?? 0,
    streakDays: d.streakDays ?? 0,
    lastSessionAt: d.lastSessionAt,
    sessionsSinceLastAssessment: d.sessionsSinceLastAssessment ?? 0,
  }
}

// ─── Session Analytics Service ───────────────────────────────────────────────

export async function saveSessionAnalytics(analytics: SessionAnalytics): Promise<void> {
  try {
    const doc = {
      ...analytics,
      domainScoresBefore: analytics.domainScoresBefore ? JSON.stringify(analytics.domainScoresBefore) : undefined,
      domainScoresAfter: analytics.domainScoresAfter ? JSON.stringify(analytics.domainScoresAfter) : undefined,
    }
    const userId = (analytics as any).userId
    await databases.createDocument(
      DATABASE_ID,
      ANALYTICS_COLLECTION,
      'unique()',
      doc,
      userId ? ownerPermissions(userId) : undefined,
    )
  } catch (error) {
    // Analytics failures are non-critical — log and continue
    console.warn('[Appwrite] Failed to save session analytics:', error)
  }
}
