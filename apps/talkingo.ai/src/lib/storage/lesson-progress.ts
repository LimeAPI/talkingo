// Persistence for completed lesson IDs with quality metrics.
// Using localStorage directly since the broader LanguageProgress system is frozen.

const STORAGE_KEY = 'talkingo_completed_lessons'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LessonQuality {
  completedAt: number
  totalCorrections: number
  correctionTypes: Record<string, number>
}

export type CompletedLessonsRecord = Record<string, LessonQuality>

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Load the raw data from localStorage and migrate old string[] format if needed.
 * Returns a Record<string, LessonQuality>.
 */
function loadCompletedLessonsRecord(): CompletedLessonsRecord {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)

    // Backward compatibility: migrate old string[] format to new Record format
    if (Array.isArray(parsed)) {
      const migrated: CompletedLessonsRecord = {}
      for (const id of parsed) {
        if (typeof id === 'string') {
          migrated[id] = {
            completedAt: 0, // unknown — legacy entry
            totalCorrections: 0,
            correctionTypes: {},
          }
        }
      }
      // Persist migrated format
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      } catch { /* storage full */ }
      return migrated
    }

    // Already in new format
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as CompletedLessonsRecord
    }

    return {}
  } catch {
    return {}
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get all completed lesson IDs as a string array (backward-compatible API).
 */
export function getCompletedLessons(): string[] {
  return Object.keys(loadCompletedLessonsRecord())
}

/**
 * Get the full quality record for all completed lessons.
 */
export function getCompletedLessonsWithQuality(): CompletedLessonsRecord {
  return loadCompletedLessonsRecord()
}

/**
 * Get quality data for a specific lesson, or null if not completed.
 */
export function getLessonQuality(lessonId: string): LessonQuality | null {
  const record = loadCompletedLessonsRecord()
  return record[lessonId] ?? null
}

/**
 * Mark a lesson as complete with optional quality metrics.
 * Returns the updated list of completed lesson IDs (backward-compatible).
 * If the lesson was previously marked without quality data (totalCorrections === 0 and no correctionTypes),
 * it can be updated with real quality data.
 */
export function markLessonComplete(
  lessonId: string,
  quality?: { totalCorrections: number; correctionTypes: Record<string, number> }
): string[] {
  const record = loadCompletedLessonsRecord()

  const existing = record[lessonId]
  // Allow updating if:
  // - No existing entry (first time), OR
  // - Existing entry has no quality (completedAt === 0 or empty correctionTypes) AND we have real quality data
  const hasRealQuality = quality && (quality.totalCorrections > 0 || Object.keys(quality.correctionTypes).length > 0)
  const existingLacksQuality = existing && existing.completedAt === 0 && Object.keys(existing.correctionTypes).length === 0

  if (existing && !existingLacksQuality && !hasRealQuality) {
    // Already has good data, don't overwrite
    return Object.keys(record)
  }

  record[lessonId] = {
    completedAt: existing?.completedAt || Date.now(),
    totalCorrections: quality?.totalCorrections ?? 0,
    correctionTypes: quality?.correctionTypes ?? {},
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch { /* storage full */ }

  return Object.keys(record)
}

/**
 * Check if a lesson has been completed.
 */
export function isLessonComplete(lessonId: string): boolean {
  return getCompletedLessons().includes(lessonId)
}
