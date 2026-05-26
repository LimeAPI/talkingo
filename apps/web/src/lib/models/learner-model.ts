/**
 * Learner model utilities.
 *
 * Handles:
 * 1. Per-domain CEFR score updates (from domainSignals / domainDeltas)
 * 2. Spaced repetition vocabulary tracker
 * 3. Session analytics logging
 * 4. Auto re-assessment trigger
 */

import type {
  LanguageProgress,
  DomainScores,
  SkillDomain,
  TrackedVocabItem,
  VocabItem,
  Correction,
  SessionRecap,
  SessionAnalytics,
  TargetLanguage,
  CefrLevel,
  WeakPattern,
} from '@talkingo/shared/types'
import { DEFAULT_DOMAIN_SCORES } from '@talkingo/shared/types'

// ─── CEFR helpers ─────────────────────────────────────────────────────────────

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function cefrIndex(cefr: CefrLevel): number {
  return CEFR_ORDER.indexOf(cefr)
}

export function cefrFromIndex(idx: number): CefrLevel {
  return CEFR_ORDER[Math.max(0, Math.min(CEFR_ORDER.length - 1, idx))]
}

/** Derive overall CEFR from domain scores (median). */
export function overallCefr(scores: DomainScores): CefrLevel {
  const indices = Object.values(scores).map(cefrIndex).sort((a, b) => a - b)
  const mid = Math.floor(indices.length / 2)
  return cefrFromIndex(indices[mid])
}

/**
 * Apply domain signal deltas to current scores.
 * Each signal is -1 (down), 0 (same), or +1 (up).
 * We use a conservative update: 3 consecutive "up" signals to advance,
 * 2 consecutive "down" signals to demote. We track this via a simple
 * running counter stored in the progress object.
 *
 * For simplicity here we apply a fractional update: accumulate signals
 * and only change the CEFR level when the accumulated score crosses ±3.
 */
export function applyDomainDeltas(
  current: DomainScores,
  deltas: Partial<Record<SkillDomain, number>>,
  accumulators: Partial<Record<SkillDomain, number>>
): { scores: DomainScores; accumulators: Partial<Record<SkillDomain, number>> } {
  const newScores = { ...current }
  const newAcc = { ...accumulators }

  for (const domain of Object.keys(deltas) as SkillDomain[]) {
    const delta = deltas[domain] ?? 0
    newAcc[domain] = (newAcc[domain] ?? 0) + delta

    // Advance: 3 consecutive positive signals
    if ((newAcc[domain] ?? 0) >= 3) {
      newScores[domain] = cefrFromIndex(cefrIndex(current[domain]) + 1)
      newAcc[domain] = 0
    }
    // Demote: 2 consecutive negative signals
    if ((newAcc[domain] ?? 0) <= -2) {
      newScores[domain] = cefrFromIndex(cefrIndex(current[domain]) - 1)
      newAcc[domain] = 0
    }
  }

  return { scores: newScores, accumulators: newAcc }
}

// ─── Spaced repetition ────────────────────────────────────────────────────────

const SRS_MASTERED_THRESHOLD = 3   // timesCorrect to be "mastered"
const SRS_FORGET_SESSIONS = 7      // sessions without seeing → demote mastered → learning
const SRS_FORGET_SESSIONS_HARD = 14 // sessions without seeing → demote learning → forgotten

/**
 * Update the tracked vocab list after a session.
 * - New words from vocabSeen are added as 'new'
 * - Words the user used correctly (in corrections with no error) get timesCorrect++
 * - Words not seen for SRS_FORGET_SESSIONS sessions get demoted
 */
export function updateTrackedVocab(
  existing: TrackedVocabItem[],
  vocabSeen: VocabItem[],
  corrections: Correction[],
  currentSession: number
): TrackedVocabItem[] {
  const map = new Map<string, TrackedVocabItem>(existing.map((v) => [v.term.toLowerCase(), v]))

  // Add new vocab
  for (const v of vocabSeen) {
    const key = v.term.toLowerCase()
    if (!map.has(key)) {
      map.set(key, {
        term: v.term,
        gloss: v.gloss,
        lastSeenSession: currentSession,
        timesCorrect: 0,
        status: 'new',
      })
    } else {
      const existing = map.get(key)!
      map.set(key, { ...existing, lastSeenSession: currentSession })
    }
  }

  // Words the user used correctly (not in corrections) get a bump
  // We approximate: if a word was seen and NOT in corrections, count it as correct usage
  const errorTerms = new Set(corrections.map((c) => c.original.toLowerCase()))
  for (const v of vocabSeen) {
    const key = v.term.toLowerCase()
    if (!errorTerms.has(key)) {
      const item = map.get(key)
      if (item) {
        const newCount = item.timesCorrect + 1
        map.set(key, {
          ...item,
          timesCorrect: newCount,
          status: newCount >= SRS_MASTERED_THRESHOLD ? 'mastered' : 'learning',
        })
      }
    }
  }

  // Apply forgetting curve
  for (const [key, item] of map.entries()) {
    const sessionsSince = currentSession - item.lastSeenSession
    if (item.status === 'mastered' && sessionsSince >= SRS_FORGET_SESSIONS) {
      map.set(key, { ...item, status: 'learning' })
    } else if (item.status === 'learning' && sessionsSince >= SRS_FORGET_SESSIONS_HARD) {
      map.set(key, { ...item, status: 'forgotten' })
    }
  }

  // Keep max 500 items (drop oldest forgotten ones first)
  const items = Array.from(map.values())
  if (items.length > 500) {
    items.sort((a, b) => {
      if (a.status === 'forgotten' && b.status !== 'forgotten') return -1
      if (b.status === 'forgotten' && a.status !== 'forgotten') return 1
      return a.lastSeenSession - b.lastSeenSession
    })
    return items.slice(items.length - 500)
  }
  return items
}

/**
 * OPTIMIZATION: Compress SRS tracker by storing only active words.
 * Removes 'forgotten' words older than 30 sessions to prevent unbounded growth.
 * This keeps the database document size manageable (~2-5KB instead of 50-100KB).
 */
export function compressTrackedVocab(
  trackedVocab: TrackedVocabItem[],
  currentSession: number
): TrackedVocabItem[] {
  // Remove forgotten words that haven't been seen in 30+ sessions
  return trackedVocab.filter(item => {
    if (item.status === 'forgotten') {
      const sessionsSince = currentSession - item.lastSeenSession
      return sessionsSince < 30 // Keep only recent forgotten words
    }
    return true // Keep all new/learning/mastered words
  })
}

/**
 * Update weak patterns with structured format.
 * Merges new corrections into existing patterns, tracking frequency and examples.
 */
export function updateWeakPatterns(
  existing: WeakPattern[],
  newCorrections: Correction[],
  currentSession: number
): WeakPattern[] {
  const patternMap = new Map<string, WeakPattern>(
    existing.map(p => [`${p.type}:${p.category}`, p])
  )

  const now = new Date().toISOString()

  for (const correction of newCorrections) {
    // Determine pattern type from correction
    const type: WeakPattern['type'] = 
      correction.type === 'grammar' ? 'grammar' :
      correction.type === 'vocabulary' || correction.type === 'naturalness' ? 'vocabulary' :
      correction.type === 'pronunciation' ? 'pronunciation' :
      'syntax'

    // Use correction type as category
    const category = correction.type
    const key = `${type}:${category}`

    const existingPattern = patternMap.get(key)

    if (existingPattern) {
      // Update existing pattern
      const updatedExamples = [
        correction.original,
        ...existingPattern.examples
      ].slice(0, 3) // Keep last 3 examples

      patternMap.set(key, {
        ...existingPattern,
        examples: updatedExamples,
        frequency: existingPattern.frequency + 1,
        lastSeen: now,
        severity: existingPattern.frequency >= 5 ? 'high' :
                  existingPattern.frequency >= 3 ? 'medium' : 'low',
      })
    } else {
      // Create new pattern
      patternMap.set(key, {
        type,
        category,
        description: correction.note || `Issue with ${correction.type}`,
        examples: [correction.original],
        frequency: 1,
        severity: 'low',
        lastSeen: now,
      })
    }
  }

  // Convert map back to array, sorted by frequency (highest first)
  const patterns = Array.from(patternMap.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10) // Keep top 10 patterns

  return patterns
}

/**
 * Get words due for review this session.
 * Returns terms that are 'learning' or 'forgotten' and haven't been seen
 * for at least 3 sessions.
 */
export function getReviewWords(
  trackedVocab: TrackedVocabItem[] | undefined | null,
  currentSession: number,
  maxWords = 8
): string[] {
  if (!Array.isArray(trackedVocab)) return []
  return trackedVocab
    .filter((v) =>
      (v.status === 'learning' || v.status === 'forgotten') &&
      currentSession - v.lastSeenSession >= 3
    )
    .sort((a, b) => a.lastSeenSession - b.lastSeenSession)
    .slice(0, maxWords)
    .map((v) => v.term)
}

/**
 * Get mastered words (for prompt injection — "don't re-teach these").
 */
export function getMasteredWords(
  trackedVocab: TrackedVocabItem[] | undefined | null,
  max = 40
): string[] {
  if (!Array.isArray(trackedVocab)) return []
  return trackedVocab
    .filter((v) => v.status === 'mastered')
    .sort((a, b) => b.timesCorrect - a.timesCorrect)
    .slice(0, max)
    .map((v) => v.term)
}

// ─── Full progress update after a session ────────────────────────────────────

export interface SessionUpdateInput {
  recap: SessionRecap | null
  vocabSeen: VocabItem[]
  corrections: Correction[]
  durationSeconds: number
  targetLanguage: TargetLanguage
  seedId: string
  userId: string
  messageCount?: number
}

export function buildUpdatedProgress(
  prev: LanguageProgress | null,
  input: SessionUpdateInput,
  domainAccumulators: Partial<Record<SkillDomain, number>>
): {
  progress: LanguageProgress
  newAccumulators: Partial<Record<SkillDomain, number>>
  analytics: SessionAnalytics
} {
  const { recap, vocabSeen, corrections, durationSeconds, targetLanguage, seedId } = input

  const prevProgress: LanguageProgress = prev ?? {
    targetLanguage,
    cefr: 'A1',
    domainScores: { ...DEFAULT_DOMAIN_SCORES },
    currentUnitId: seedId,
    completedUnits: [],
    trackedVocab: [],
    weakPatterns: [],
    totalSessions: 0,
    totalMinutes: 0,
    streakDays: 0,
    sessionsSinceLastAssessment: 0,
  }

  const currentSession = prevProgress.totalSessions + 1

  // Apply domain deltas from recap
  const deltas = recap?.domainDeltas ?? {}
  const { scores: newDomainScores, accumulators: newAcc } = applyDomainDeltas(
    prevProgress.domainScores,
    deltas,
    domainAccumulators
  )

  // Update vocab tracker
  const newTrackedVocab = updateTrackedVocab(
    prevProgress.trackedVocab,
    vocabSeen,
    corrections,
    currentSession
  )

  // Compress SRS tracker to prevent unbounded growth
  const compressedVocab = compressTrackedVocab(newTrackedVocab, currentSession)

  // Update weak patterns with structured format
  const newWeakPatterns = updateWeakPatterns(
    prevProgress.weakPatterns,
    recap?.topCorrections ?? [],
    currentSession
  )

  // Completed units
  const completedUnits = recap?.unitComplete && !prevProgress.completedUnits.includes(seedId)
    ? [...prevProgress.completedUnits, seedId]
    : prevProgress.completedUnits

  // Streak
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const last = prevProgress.lastSessionAt ? new Date(prevProgress.lastSessionAt) : null
  if (last) last.setHours(0, 0, 0, 0)
  const daysDiff = last ? Math.round((today.getTime() - last.getTime()) / 86400000) : 1
  let streak = prevProgress.streakDays
  if (!last) streak = 1
  else if (daysDiff === 0) streak = Math.max(1, streak)
  else if (daysDiff === 1) streak = streak + 1
  else streak = 1

  const newCefr = overallCefr(newDomainScores)
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  const abandoned = durationSeconds < 120

  const progress: LanguageProgress = {
    targetLanguage,
    cefr: newCefr,
    domainScores: newDomainScores,
    currentUnitId: recap?.unitComplete ? (recap.unitId ?? seedId) : prevProgress.currentUnitId,
    completedUnits,
    trackedVocab: compressedVocab, // Use compressed version
    weakPatterns: newWeakPatterns, // Use structured weak patterns
    totalSessions: currentSession,
    totalMinutes: prevProgress.totalMinutes + minutes,
    streakDays: streak,
    lastSessionAt: Date.now(),
    sessionsSinceLastAssessment: prevProgress.sessionsSinceLastAssessment + 1,
  }

  const analytics: SessionAnalytics = {
    sessionId: `${input.userId}_${Date.now()}`,
    userId: input.userId,
    targetLanguage,
    seedId,
    seedTitle: recap?.unitTitle ?? seedId,
    durationSeconds,
    messageCount: input.messageCount ?? 0,
    correctionCount: corrections.length,
    vocabIntroduced: vocabSeen.length,
    unitComplete: recap?.unitComplete ?? false,
    domainScoresBefore: prevProgress.domainScores,
    domainScoresAfter: newDomainScores,
    abandoned,
    timestamp: Date.now(),
  }

  return { progress, newAccumulators: newAcc, analytics }
}

/** Should we trigger a re-assessment? Every 10 sessions. */
export function shouldReassess(progress: LanguageProgress): boolean {
  return progress.sessionsSinceLastAssessment >= 10
}
