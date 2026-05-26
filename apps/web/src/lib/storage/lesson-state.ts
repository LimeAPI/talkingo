/**
 * Lesson State Storage — localStorage only (no cross-device sync).
 *
 * Tracks active lessons (max 2 per language) so users can resume
 * from the home page. Completed lessons are tracked in Appwrite
 * via language_progress.completedLessons.
 *
 * STORAGE STRATEGY:
 * - localStorage only for mid-lesson state (instant, no network)
 * - Appwrite only for completedLessons[] (permanent, cross-device)
 * - Max 2 active lessons per language (oldest auto-archived on 3rd)
 */

import type { TargetLanguage } from '@talkingo/shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveLesson {
  /** Template ID from lesson-templates.ts */
  lessonId: string
  /** Human-readable title */
  title: string
  /** Current step (1-indexed) */
  currentStep: number
  /** Total steps in this lesson */
  totalSteps: number
  /** Brief AI-generated summary of what's been covered */
  summary: string
  /** When this lesson was last worked on */
  lastActiveAt: number
  /** When this lesson was started */
  startedAt: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ACTIVE_LESSONS = 2

function storageKey(userId: string, langId: TargetLanguage | string): string {
  return `talkingo_active_lessons_${userId}_${langId}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load active lessons for a user + language.
 * Returns up to 2 lessons sorted by most recently active.
 */
export function loadActiveLessons(
  userId: string,
  targetLanguage: TargetLanguage | string
): ActiveLesson[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, targetLanguage))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ActiveLesson[]
    // Sort by most recently active first
    return parsed.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, MAX_ACTIVE_LESSONS)
  } catch {
    return []
  }
}

/**
 * Save or update an active lesson.
 * If this would exceed MAX_ACTIVE_LESSONS, the oldest is removed.
 */
export function saveActiveLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lesson: ActiveLesson
): void {
  try {
    const existing = loadActiveLessons(userId, targetLanguage)
    
    // Remove this lesson if it already exists (we'll re-add with updated state)
    const filtered = existing.filter((l) => l.lessonId !== lesson.lessonId)
    
    // Add the updated lesson
    filtered.unshift(lesson)
    
    // Cap at MAX_ACTIVE_LESSONS (remove oldest)
    const capped = filtered.slice(0, MAX_ACTIVE_LESSONS)
    
    localStorage.setItem(storageKey(userId, targetLanguage), JSON.stringify(capped))
  } catch {
    // Ignore localStorage errors (quota, etc.)
  }
}

/**
 * Remove a lesson from active lessons (e.g., when completed or abandoned).
 */
export function removeActiveLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string
): void {
  try {
    const existing = loadActiveLessons(userId, targetLanguage)
    const filtered = existing.filter((l) => l.lessonId !== lessonId)
    localStorage.setItem(storageKey(userId, targetLanguage), JSON.stringify(filtered))
  } catch {
    // Ignore
  }
}

/**
 * Advance a lesson to the next step.
 * Updates the step counter and summary.
 */
export function advanceLessonStep(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string,
  newStep: number,
  summary: string
): void {
  const lessons = loadActiveLessons(userId, targetLanguage)
  const lesson = lessons.find((l) => l.lessonId === lessonId)
  if (!lesson) return

  lesson.currentStep = newStep
  lesson.summary = summary
  lesson.lastActiveAt = Date.now()

  saveActiveLesson(userId, targetLanguage, lesson)
}

/**
 * Create a new active lesson from a template.
 */
export function startLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string,
  title: string,
  totalSteps: number
): ActiveLesson {
  const lesson: ActiveLesson = {
    lessonId,
    title,
    currentStep: 1,
    totalSteps,
    summary: '',
    lastActiveAt: Date.now(),
    startedAt: Date.now(),
  }

  saveActiveLesson(userId, targetLanguage, lesson)
  return lesson
}

/**
 * Check if a specific lesson is currently active.
 */
export function isLessonActive(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string
): boolean {
  const lessons = loadActiveLessons(userId, targetLanguage)
  return lessons.some((l) => l.lessonId === lessonId)
}

/**
 * Get a specific active lesson by ID.
 */
export function getActiveLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string
): ActiveLesson | null {
  const lessons = loadActiveLessons(userId, targetLanguage)
  return lessons.find((l) => l.lessonId === lessonId) ?? null
}
