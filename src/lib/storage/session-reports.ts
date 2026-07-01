'use client'

/**
 * Session Reports — rich, per-session learning reports for the History tab.
 *
 * WHY A SEPARATE STORE (not structured-memory):
 *  - Structured memory is small and synced to Appwrite (one JSON field). Stuffing
 *    full correction lists into it would bloat that field and risk size limits.
 *  - Reports are a *display* concern (review what happened), not needed by the AI
 *    planner. So we keep them local-only and can afford to store the full detail:
 *    every correction (your phrase → the fix → why), new words, and context
 *    (language, tutor, level).
 *
 * Bounded: keeps the most recent MAX_REPORTS sessions, each with up to
 * MAX_CORRECTIONS corrections, so localStorage stays well within budget.
 */

import type { Correction, TargetLanguage, PersonaId } from '@talkingo/shared/types'

export interface SessionReport {
  id: string
  date: number
  /** Human-readable title (scenario name / "Free Talk" / "Custom scenario") */
  title: string
  scenarioId: string
  targetLanguage: TargetLanguage
  persona: PersonaId
  level: number
  durationSeconds: number
  userTurns: number
  /** Full list of corrections collected during the session. */
  corrections: Correction[]
  /** New vocabulary introduced this session (may be empty for Free Talk). */
  newVocab: string[]
}

const MAX_REPORTS = 30
const MAX_CORRECTIONS = 50
const KEY = (uid: string | null) => `talkingo_session_reports_${uid || 'anon'}`

/** De-duplicate corrections by original→corrected so the report stays clean. */
function dedupeCorrections(corrections: Correction[]): Correction[] {
  const seen = new Set<string>()
  const out: Correction[] = []
  for (const c of corrections) {
    if (!c?.original || !c?.corrected) continue
    const key = `${c.original}→${c.corrected}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length >= MAX_CORRECTIONS) break
  }
  return out
}

export function loadSessionReports(userId: string | null): SessionReport[] {
  try {
    const raw = localStorage.getItem(KEY(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as SessionReport[]).sort((a, b) => b.date - a.date)
  } catch {
    return []
  }
}

export function saveSessionReport(
  userId: string | null,
  report: Omit<SessionReport, 'id' | 'corrections'> & { corrections: Correction[] },
): SessionReport[] {
  const full: SessionReport = {
    ...report,
    id: `${report.date}-${Math.random().toString(36).slice(2, 8)}`,
    corrections: dedupeCorrections(report.corrections),
  }
  try {
    const existing = loadSessionReports(userId)
    const next = [full, ...existing].slice(0, MAX_REPORTS)
    localStorage.setItem(KEY(userId), JSON.stringify(next))
    return next
  } catch {
    // Quota — try storing just this report's essentials
    try {
      localStorage.setItem(KEY(userId), JSON.stringify([full]))
    } catch {
      /* give up silently */
    }
    return [full]
  }
}

export function clearSessionReports(userId: string | null): void {
  try {
    localStorage.removeItem(KEY(userId))
  } catch {
    /* ignore */
  }
}
