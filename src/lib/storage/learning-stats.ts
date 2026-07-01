'use client'

/**
 * Lightweight per-language learning stats — sessions, minutes, and streak.
 *
 * WHY: the old LanguageProgress system was frozen (hard-coded null), so the
 * Learn header and Profile constellation always showed 0. Session reports are
 * capped at 30, so they undercount lifetime activity. This tiny store keeps
 * honest lifetime counters plus the recent active-day stamps needed for a
 * streak — namespaced per target language so each language has its own numbers.
 *
 * Local-only and cheap. Stats are motivational, not load-bearing, so they don't
 * need to ride the synced critical path (unlike scenario progress).
 */

import type { LanguageProgress, UserPreferences } from '@talkingo/shared/types'
import { getCompletedLessons } from './lesson-progress'

interface LangStats {
  sessions: number
  minutes: number
  /** Recent active day-stamps (epoch day numbers), unique + sorted asc, capped. */
  days: number[]
}

type StatsRecord = Record<string, LangStats>

const KEY = (uid: string | null) => `talkingo_learning_stats_${uid || 'anon'}`
const MAX_DAYS = 90

const EPOCH_DAY = (ms: number) => Math.floor(ms / 86_400_000)

function load(userId: string | null): StatsRecord {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function save(userId: string | null, record: StatsRecord): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(record))
  } catch { /* quota — non-critical */ }
}

function emptyStats(): LangStats {
  return { sessions: 0, minutes: 0, days: [] }
}

/** Record one completed session for a language. */
export function recordSessionStat(
  userId: string | null,
  language: string,
  durationSeconds: number,
): void {
  const record = load(userId)
  const lang = language || 'en'
  const s = record[lang] ?? emptyStats()

  s.sessions += 1
  s.minutes += Math.max(0, Math.round(durationSeconds / 60))

  const today = EPOCH_DAY(Date.now())
  if (!s.days.includes(today)) {
    s.days.push(today)
    s.days.sort((a, b) => a - b)
    if (s.days.length > MAX_DAYS) s.days = s.days.slice(-MAX_DAYS)
  }

  record[lang] = s
  save(userId, record)
}

/** Current streak in days for a language (today counts; yesterday keeps it alive). */
function computeStreak(days: number[]): number {
  if (days.length === 0) return 0
  const set = new Set(days)
  const today = EPOCH_DAY(Date.now())
  let cursor = set.has(today) ? today : today - 1
  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor -= 1
  }
  return streak
}

/** Raw stats for a language. */
export function getLanguageStats(
  userId: string | null,
  language: string,
): { sessions: number; minutes: number; streakDays: number } {
  const s = load(userId)[language || 'en'] ?? emptyStats()
  return { sessions: s.sessions, minutes: s.minutes, streakDays: computeStreak(s.days) }
}

/**
 * Build a LanguageProgress view for the active language by combining the
 * lifetime counters, the (active-language) completed lessons, and the level.
 */
export function deriveLanguageProgress(
  userId: string | null,
  prefs: UserPreferences | null,
): LanguageProgress | null {
  if (!prefs) return null
  const lang = (prefs.targetLanguage as string) || 'en'
  const { sessions, minutes, streakDays } = getLanguageStats(userId, lang)
  return {
    talkingoLevel: prefs.talkingoLevel ?? 1,
    completedLessons: getCompletedLessons(),
    streakDays,
    totalSessions: sessions,
    totalMinutes: minutes,
  }
}
