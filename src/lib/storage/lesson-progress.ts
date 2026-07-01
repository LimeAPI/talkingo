
// Per-scenario progress with a smart 3-state model.
//
// A scenario is never "done just because the call ended". Instead each attempt
// is judged and the scenario settles into one of three states:
//   • 'new'        — never meaningfully attempted
//   • 'practicing' — attempted, but not mastered yet → "keep talking"
//   • 'done'       — actually spoken well (Rule B: AI mastery signal AND enough
//                    speaking, with a robust fallback so it never gets stuck)
//
// Status only ever ratchets UP (new → practicing → done). Once a scenario is
// 'done' it stays 'done'. Legacy entries (no status field) are treated as 'done'
// so existing progress is never lost.
//
// Stored in localStorage since the broader LanguageProgress system is frozen.

const STORAGE_KEY = 'talkingo_completed_lessons'

// ─── Tuning knobs (Rule B) ─────────────────────────────────────────────────────

/** Must speak at least this many turns before a scenario can be 'done'. */
export const MIN_TURNS_FOR_DONE = 4
/** A long, reasonably clean conversation also counts as 'done' even without an
 *  explicit AI signal — keeps completion from getting stuck (e.g. voice modes). */
const SOLID_TURNS_FALLBACK = 8
/** Max average corrections-per-turn for the fallback path to grant 'done'. */
const FALLBACK_MAX_ERROR_RATE = 1.5

// ─── Types ───────────────────────────────────────────────────────────────────

export type LessonStatus = 'new' | 'practicing' | 'done'

export interface LessonQuality {
  /** Timestamp the scenario became 'done' (0 while still 'new'/'practicing'). */
  completedAt: number
  totalCorrections: number
  correctionTypes: Record<string, number>
  /** 3-state status. Optional for backward-compat — absence means 'done' (legacy). */
  status?: LessonStatus
  /** How many times the learner has worked this scenario. */
  attempts?: number
  /** User turns spoken in the most recent attempt. */
  userTurns?: number
  /** When the scenario was first attempted. */
  firstAttemptAt?: number
  /** When the scenario was last attempted. */
  lastAttemptAt?: number
}

export type CompletedLessonsRecord = Record<string, LessonQuality>

const STATUS_RANK: Record<LessonStatus, number> = { new: 0, practicing: 1, done: 2 }

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Load the raw data from localStorage and migrate the old string[] format.
 */
function loadCompletedLessonsRecord(): CompletedLessonsRecord {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)

    // Backward compatibility: migrate old string[] format → Record (as 'done').
    if (Array.isArray(parsed)) {
      const migrated: CompletedLessonsRecord = {}
      for (const id of parsed) {
        if (typeof id === 'string') {
          migrated[id] = {
            completedAt: 0,
            totalCorrections: 0,
            correctionTypes: {},
            status: 'done',
          }
        }
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)) } catch { /* full */ }
      return migrated
    }

    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as CompletedLessonsRecord
    }
    return {}
  } catch {
    return {}
  }
}

function safeWrite(record: CompletedLessonsRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch { /* storage full — non-critical */ }
}

/** Resolve an entry's effective status (legacy entries with no status = 'done'). */
function statusOf(entry: LessonQuality | undefined): LessonStatus {
  if (!entry) return 'new'
  return entry.status ?? 'done'
}

// ─── Decision logic (Rule B, robust) ──────────────────────────────────────────

/**
 * Decide a scenario's status from a single attempt.
 *
 * Rule B: a scenario is 'done' only when the learner actually spoke enough AND
 * there's a mastery signal. The AI's explicit `unitComplete` is the primary
 * signal; a long, clean conversation is a robust fallback so completion never
 * stalls when the signal is absent (e.g. live/voice modes that don't emit it).
 */
export function decideStatus(input: {
  userTurns: number
  aiSignaledComplete: boolean
  totalCorrections: number
}): LessonStatus {
  const { userTurns, aiSignaledComplete, totalCorrections } = input

  if (userTurns < 1) return 'new'
  if (userTurns < MIN_TURNS_FOR_DONE) return 'practicing'

  // Primary path: the AI judged the learner has handled this scenario.
  if (aiSignaledComplete) return 'done'

  // Fallback path: a substantial, reasonably clean conversation also counts.
  const errorRate = totalCorrections / Math.max(1, userTurns)
  if (userTurns >= SOLID_TURNS_FALLBACK && errorRate <= FALLBACK_MAX_ERROR_RATE) {
    return 'done'
  }

  return 'practicing'
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Record one attempt at a scenario and return the resulting status.
 * Status ratchets up only; quality fields reflect the latest attempt.
 */
export function recordLessonAttempt(
  lessonId: string,
  attempt: {
    userTurns: number
    aiSignaledComplete: boolean
    totalCorrections: number
    correctionTypes: Record<string, number>
  }
): { status: LessonStatus; lessonId: string } {
  const record = loadCompletedLessonsRecord()
  const existing = record[lessonId]
  const now = Date.now()

  const attemptStatus = decideStatus(attempt)
  const prevStatus = statusOf(existing)
  const finalStatus: LessonStatus =
    STATUS_RANK[attemptStatus] >= STATUS_RANK[prevStatus] ? attemptStatus : prevStatus

  const wasDone = prevStatus === 'done' && (existing?.completedAt ?? 0) > 0

  record[lessonId] = {
    status: finalStatus,
    completedAt: finalStatus === 'done' ? (wasDone ? existing!.completedAt : now) : 0,
    totalCorrections: attempt.totalCorrections,
    correctionTypes: attempt.correctionTypes,
    attempts: (existing?.attempts ?? 0) + 1,
    userTurns: attempt.userTurns,
    firstAttemptAt: existing?.firstAttemptAt ?? now,
    lastAttemptAt: now,
  }

  safeWrite(record)
  return { status: finalStatus, lessonId }
}

/**
 * Get the IDs of scenarios that are fully 'done'.
 * (Named for backward-compat — "completed" now means "done".)
 */
export function getCompletedLessons(): string[] {
  const record = loadCompletedLessonsRecord()
  return Object.keys(record).filter((id) => statusOf(record[id]) === 'done')
}

/** Get the IDs of scenarios currently 'practicing' (attempted, not done). */
export function getPracticingLessons(): string[] {
  const record = loadCompletedLessonsRecord()
  return Object.keys(record).filter((id) => statusOf(record[id]) === 'practicing')
}

/** Get a full id → status map for the whole record. */
export function getLessonStatusMap(): Record<string, LessonStatus> {
  const record = loadCompletedLessonsRecord()
  const map: Record<string, LessonStatus> = {}
  for (const id of Object.keys(record)) map[id] = statusOf(record[id])
  return map
}

/** Get the status for a single scenario. */
export function getLessonStatus(lessonId: string): LessonStatus {
  return statusOf(loadCompletedLessonsRecord()[lessonId])
}

/** Get the full quality record for all scenarios with progress. */
export function getCompletedLessonsWithQuality(): CompletedLessonsRecord {
  return loadCompletedLessonsRecord()
}

/** Get quality data for a specific scenario, or null if untouched. */
export function getLessonQuality(lessonId: string): LessonQuality | null {
  return loadCompletedLessonsRecord()[lessonId] ?? null
}

/**
 * Explicitly mark a scenario 'done' (legacy/manual completion).
 * Retained for backward-compat; the smart flow uses recordLessonAttempt.
 * Returns the updated list of done lesson IDs.
 */
export function markLessonComplete(
  lessonId: string,
  quality?: { totalCorrections: number; correctionTypes: Record<string, number> }
): string[] {
  const record = loadCompletedLessonsRecord()
  const existing = record[lessonId]
  const now = Date.now()

  record[lessonId] = {
    status: 'done',
    completedAt: existing?.completedAt && existing.completedAt > 0 ? existing.completedAt : now,
    totalCorrections: quality?.totalCorrections ?? existing?.totalCorrections ?? 0,
    correctionTypes: quality?.correctionTypes ?? existing?.correctionTypes ?? {},
    attempts: existing?.attempts ?? 1,
    userTurns: existing?.userTurns ?? 0,
    firstAttemptAt: existing?.firstAttemptAt ?? now,
    lastAttemptAt: now,
  }

  safeWrite(record)
  return getCompletedLessons()
}

/** Check if a scenario is fully 'done'. */
export function isLessonComplete(lessonId: string): boolean {
  return getLessonStatus(lessonId) === 'done'
}

// ─── Cross-device sync bridge ──────────────────────────────────────────────────
// The numeric state model (0/1/2) used by the compact progress code. Kept here
// so the storage layer is the single translator between local string statuses
// and the portable code.

const STATUS_TO_NUM: Record<LessonStatus, 0 | 1 | 2> = { new: 0, practicing: 1, done: 2 }
const NUM_TO_STATUS: Record<number, LessonStatus> = { 0: 'new', 1: 'practicing', 2: 'done' }

/** Export the whole local record as a {seedId → numeric state} map (non-'new' only). */
export function exportLessonStates(): Record<string, 0 | 1 | 2> {
  const record = loadCompletedLessonsRecord()
  const out: Record<string, 0 | 1 | 2> = {}
  for (const id of Object.keys(record)) {
    const num = STATUS_TO_NUM[statusOf(record[id])]
    if (num > 0) out[id] = num
  }
  return out
}

/**
 * Merge an incoming {seedId → numeric state} map into the local record,
 * ratcheting each scenario UP only (never demote). Used when restoring or
 * merging synced progress from another device.
 * Returns true if anything changed locally.
 */
export function applyLessonStates(incoming: Record<string, number>): boolean {
  const record = loadCompletedLessonsRecord()
  const now = Date.now()
  let changed = false

  for (const [id, rawState] of Object.entries(incoming)) {
    const incomingStatus = NUM_TO_STATUS[Math.max(0, Math.min(2, Math.round(rawState)))] ?? 'new'
    if (incomingStatus === 'new') continue

    const prevStatus = statusOf(record[id])
    if (STATUS_RANK[incomingStatus] <= STATUS_RANK[prevStatus]) continue // already >= incoming

    const existing = record[id]
    record[id] = {
      status: incomingStatus,
      completedAt: incomingStatus === 'done'
        ? (existing?.completedAt && existing.completedAt > 0 ? existing.completedAt : now)
        : 0,
      totalCorrections: existing?.totalCorrections ?? 0,
      correctionTypes: existing?.correctionTypes ?? {},
      attempts: existing?.attempts ?? 0,
      userTurns: existing?.userTurns ?? 0,
      firstAttemptAt: existing?.firstAttemptAt ?? now,
      lastAttemptAt: existing?.lastAttemptAt ?? now,
    }
    changed = true
  }

  if (changed) safeWrite(record)
  return changed
}

/**
 * Replace the entire local record with the given {seedId → numeric state} map.
 * Used when switching the active target language so the single-key local store
 * always reflects the language currently being practiced.
 */
export function replaceLessonStates(states: Record<string, number>): void {
  const record: CompletedLessonsRecord = {}
  const now = Date.now()
  for (const [id, rawState] of Object.entries(states)) {
    const status = NUM_TO_STATUS[Math.max(0, Math.min(2, Math.round(rawState)))] ?? 'new'
    if (status === 'new') continue
    record[id] = {
      status,
      completedAt: status === 'done' ? now : 0,
      totalCorrections: 0,
      correctionTypes: {},
      attempts: 0,
      userTurns: 0,
      firstAttemptAt: now,
      lastAttemptAt: now,
    }
  }
  safeWrite(record)
}
