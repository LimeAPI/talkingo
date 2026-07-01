'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Clock, MessageSquare, Sparkles, BookOpen, TrendingUp,
  ChevronDown, ArrowRight, GraduationCap,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { Stat } from '@/components/ui/Stat'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { loadSessionReports, type SessionReport } from '@/lib/storage/session-reports'
import { loadStructuredMemory, getMemoryStats } from '@/lib/storage/structured-memory'
import { getLanguageMeta } from '@talkingo/shared/languages'
import { getPersonaById } from '@talkingo/shared/gemini/personas'

/**
 * History tab — detailed, per-session learning reports.
 *
 * Reads the rich local report store (full correction lists + context). Each
 * session expands to show exactly what happened: every correction (your phrase →
 * the fix → why), new words, and the language/tutor/level it was in. The
 * recurring-patterns summary still comes from aggregate structured memory.
 */
export function HistoryScreen({ userId }: { userId?: string | null }) {
  const [reports, setReports] = useState<SessionReport[]>([])
  const [topPatterns, setTopPatterns] = useState<Array<{ pattern: string; frequency: number }>>([])
  const [vocab, setVocab] = useState<{ total: number; active: number }>({ total: 0, active: 0 })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const uid = userId ?? null
    try {
      const r = loadSessionReports(uid)
      setReports(r)
      // Aggregate stats + "patterns to watch" from structured memory (synced).
      const stats = getMemoryStats(loadStructuredMemory(uid))
      setTopPatterns(stats.topErrors.map((e) => ({ pattern: cleanPattern(e.pattern), frequency: e.frequency })))
      setVocab({ total: stats.totalVocab, active: stats.activeVocab })
      // Auto-expand the most recent session for quick review.
      if (r.length > 0) setExpandedId(r[0].id)
    } catch {
      setReports([])
      setTopPatterns([])
    } finally {
      setLoaded(true)
    }
  }, [userId])

  const totals = useMemo(() => {
    const time = reports.reduce((s, r) => s + (r.durationSeconds || 0), 0)
    return { sessions: reports.length, time }
  }, [reports])

  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24">
      <div className="relative z-10 max-w-md mx-auto px-5 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <Eyebrow>Your journey</Eyebrow>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground mt-1.5">History</h1>
        </div>

        {!loaded ? (
          <HistorySkeleton />
        ) : reports.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Summary strip — Sessions · Words · Practiced */}
            <div className="grid grid-cols-3 gap-3">
              <Stat wrap label="Sessions" value={String(totals.sessions)} />
              <Stat
                wrap
                label="Words"
                value={String(vocab.total)}
                sub={vocab.active > 0 ? `${vocab.active} active` : undefined}
              />
              <Stat wrap label="Practiced" value={formatDurationShort(totals.time)} />
            </div>

            {/* Recurring patterns to watch */}
            {topPatterns.length > 0 && (
              <section className="surface-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Patterns to watch</h2>
                </div>
                <div className="flex flex-col gap-1.5">
                  {topPatterns.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-primary/[0.04] border border-primary/15"
                    >
                      <span className="text-[12.5px] text-foreground/75 leading-snug">{e.pattern}</span>
                      <span className="shrink-0 font-mono text-[11px] text-primary/70">{e.frequency}×</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Session reports */}
            <div className="space-y-3">
              <Eyebrow muted className="px-1">Recent sessions</Eyebrow>
              {reports.map((r) => (
                <SessionCard
                  key={r.id}
                  report={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface-card p-4 h-[4.5rem] flex flex-col items-center justify-center gap-2">
            <div className="h-5 w-8 rounded bg-foreground/10" />
            <div className="h-2 w-12 rounded bg-foreground/[0.06]" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-foreground/10" />
              <div className="h-6 w-16 rounded-full bg-foreground/[0.06]" />
            </div>
            <div className="h-3 w-3/4 rounded bg-foreground/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionCard({
  report,
  expanded,
  onToggle,
}: {
  report: SessionReport
  expanded: boolean
  onToggle: () => void
}) {
  const lang = getLanguageMeta(report.targetLanguage)
  const tutor = getPersonaById(report.persona)?.name
  const fixCount = report.corrections.length

  return (
    <article className="surface-card overflow-hidden">
      {/* Clickable summary row */}
      <button
        onClick={onToggle}
        className="w-full text-left p-5 hover:bg-foreground/[0.02] transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-foreground leading-tight truncate">
              {report.title || 'Conversation'}
            </h3>
            <p className="font-mono text-[11px] text-foreground/45 mt-1">{relativeDate(report.date)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {fixCount > 0 ? (
              <StatusBadge tone="primary" icon={<Sparkles className="w-3 h-3" />}>
                {fixCount} {fixCount === 1 ? 'fix' : 'fixes'}
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Clean</StatusBadge>
            )}
            <ChevronDown className={cn('w-4 h-4 text-foreground/40 transition-transform', expanded && 'rotate-180')} />
          </div>
        </div>

        {/* Context + meta row */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3 text-[12px] text-foreground/55">
          <span className="inline-flex items-center gap-1.5 text-foreground/70 font-medium">
            {lang.native}
          </span>
          {tutor && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-foreground/25" />
              {tutor}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-foreground/25" />
            <GraduationCap className="w-3.5 h-3.5 text-foreground/40" />
            Lv {report.level}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-foreground/25" />
            <Clock className="w-3.5 h-3.5 text-foreground/40" />
            {formatDuration(report.durationSeconds)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-foreground/25" />
            <MessageSquare className="w-3.5 h-3.5 text-foreground/40" />
            {report.userTurns} {report.userTurns === 1 ? 'turn' : 'turns'}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 -mt-1 animate-fade-in">
          {/* New vocabulary */}
          {report.newVocab.length > 0 && (
            <div className="pt-3 border-t border-border/40">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-foreground/40" />
                <span className="text-[10px] uppercase tracking-wider text-foreground/45 font-semibold">New words</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {report.newVocab.map((w, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md bg-card border border-border/50 text-[11px] text-foreground/70">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Full corrections list */}
          <div className="pt-3 mt-3 border-t border-border/40">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-foreground/45 font-semibold">
                {fixCount > 0 ? 'Corrections' : 'Corrections'}
              </span>
            </div>

            {fixCount === 0 ? (
              <p className="text-[12.5px] text-foreground/55 leading-relaxed">
                No corrections this session — your speaking was clean. 
              </p>
            ) : (
              <div className="space-y-2">
                {report.corrections.map((c, i) => (
                  <div key={i} className="rounded-xl bg-card border border-border/50 px-3 py-2.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border text-primary bg-primary/10 border-primary/20 mb-1.5">
                      {c.type}
                    </span>
                    <div className="flex items-center gap-2 text-[13px] flex-wrap">
                      <span className="line-through opacity-50 text-foreground/70">{c.original}</span>
                      <ArrowRight className="w-3 h-3 text-primary/60 flex-shrink-0" />
                      <span className="font-semibold text-primary">{c.corrected}</span>
                    </div>
                    {c.note && (
                      <p className="text-[11px] text-muted-foreground leading-snug mt-1">{c.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border/60 flex items-center justify-center shadow-[var(--shadow-card)] mb-5">
        <Clock className="w-7 h-7 text-primary/50" strokeWidth={1.5} />
      </div>
      <p className="text-[15px] font-medium text-foreground mb-1.5">No sessions yet</p>
      <p className="text-sm text-foreground/55 max-w-[240px] leading-relaxed">
        Finish a conversation and a full report of what you covered will appear here.
      </p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanPattern(pattern: string): string {
  const label = pattern.includes(':') ? pattern.split(':').slice(1).join(':') : pattern
  const trimmed = label.trim().replace(/\s+/g, ' ')
  const capped = trimmed.length > 64 ? trimmed.slice(0, 63).trimEnd() + '…' : trimmed
  return capped.charAt(0).toUpperCase() + capped.slice(1)
}

function formatDuration(s: number) {
  if (!s || s < 1) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function formatDurationShort(s: number) {
  if (!s || s < 60) return `${Math.max(0, Math.round(s))}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function relativeDate(ts: number) {
  const now = Date.now()
  const diff = now - ts
  const day = 86400000
  const d = Math.floor(diff / day)
  if (d === 0) {
    const h = Math.floor(diff / 3600000)
    if (h === 0) {
      const m = Math.floor(diff / 60000)
      return m <= 1 ? 'Just now' : `${m}m ago`
    }
    return `${h}h ago`
  }
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
