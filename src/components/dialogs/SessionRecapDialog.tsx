'use client'

import { cn } from '@talkingo/shared/utils'
import { ArrowRight, Sparkles, TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, BookOpen, MessageSquare } from 'lucide-react'
import type { Correction } from '@talkingo/shared/types'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface RecapProgress {
  /** Tracked words the learner actually used this session. */
  wordsUsed: number
  /** New words introduced this session. */
  wordsIntroduced: number
  /** Sentence-length trend vs the previous session. */
  sentenceTrend: 'up' | 'flat' | 'down' | null
  /** Forms the learner fixed on their own after an earlier correction. */
  selfFixes?: number
}

interface SessionRecapDialogProps {
  isOpen: boolean
  corrections: Correction[]
  durationSeconds: number
  /** Outcome of the path scenario just practiced — drives the "done / keep going" card. */
  lessonOutcome?: { status: 'new' | 'practicing' | 'done'; title: string } | null
  /** True when shown on return for a session the user closed before finishing. */
  isWelcomeBack?: boolean
  /** Felt-progress numbers from the deterministic memory engine. */
  progress?: RecapProgress
  onClose: () => void
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const TYPE_COLOR: Record<Correction['type'], string> = {
  grammar: 'text-primary bg-primary/10 border-primary/20',
  vocabulary: 'text-primary bg-primary/10 border-primary/20',
  pronunciation: 'text-primary bg-primary/10 border-primary/20',
  naturalness: 'text-primary bg-primary/10 border-primary/20',
}

export function SessionRecapDialog({
  isOpen,
  corrections,
  durationSeconds,
  lessonOutcome,
  isWelcomeBack,
  progress,
  onClose,
}: SessionRecapDialogProps) {
  // De-duplicate identical corrections so the recap stays clean.
  const seen = new Set<string>()
  const uniqueCorrections = corrections.filter((c) => {
    const key = `${c.original}→${c.corrected}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const nailedIt = uniqueCorrections.length === 0

  // Build the felt-progress chips (only show ones with something to say).
  const trend = progress?.sentenceTrend
  const progressChips: { icon: typeof Sparkles; label: string }[] = []
  if (progress) {
    if (progress.wordsUsed > 0) {
      progressChips.push({ icon: Sparkles, label: `${progress.wordsUsed} new word${progress.wordsUsed === 1 ? '' : 's'} used` })
    }
    if ((progress.selfFixes ?? 0) > 0) {
      progressChips.push({ icon: CheckCircle2, label: `${progress.selfFixes} self-correction${progress.selfFixes === 1 ? '' : 's'}` })
    }
    if (progress.wordsIntroduced > 0) {
      progressChips.push({ icon: BookOpen, label: `${progress.wordsIntroduced} new word${progress.wordsIntroduced === 1 ? '' : 's'} introduced` })
    }
    if (trend === 'up') progressChips.push({ icon: TrendingUp, label: 'Longer sentences' })
    else if (trend === 'down') progressChips.push({ icon: TrendingDown, label: 'Shorter sentences' })
    else if (trend === 'flat') progressChips.push({ icon: Minus, label: 'Steady sentences' })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col" showCloseButton={false}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              {isWelcomeBack ? 'Welcome back' : 'Session recap'}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {isWelcomeBack ? 'Here\u2019s where we left off' : 'Nice work \u2014 here\u2019s what we covered'}
          </h2>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDuration(durationSeconds)}</span>
            <span className="mx-1">·</span>
            <span>{uniqueCorrections.length} thing{uniqueCorrections.length === 1 ? '' : 's'} to polish</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Scenario outcome — mastered vs keep practicing */}
          {lessonOutcome && (lessonOutcome.status === 'done' || lessonOutcome.status === 'practicing') && (
            <div
              className={cn(
                'rounded-2xl border p-4',
                lessonOutcome.status === 'done'
                  ? 'border-success/30 bg-gradient-to-br from-success/10 to-success/5'
                  : 'border-primary/25 bg-gradient-to-br from-primary/8 to-transparent'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {lessonOutcome.status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-primary" />
                )}
                <span className="text-sm font-bold text-foreground">
                  {lessonOutcome.status === 'done' ? 'You\u2019ve got this one!' : 'Good start \u2014 keep going'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {lessonOutcome.status === 'done'
                  ? 'You spoke well enough to mark this scenario done. It\u2019s ticked off on your path.'
                  : 'A little more talking and this scenario is yours. Come back and pick it up again.'}
              </p>
            </div>
          )}
          {/* Felt progress — what they actually did, surfaced from memory */}
          {progressChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {progressChips.map((chip, i) => {
                const Icon = chip.icon
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary"
                  >
                    <Icon className="w-3 h-3" />
                    {chip.label}
                  </span>
                )
              })}
            </div>
          )}

          {/* Corrections list */}
          {nailedIt ? (
            <div className="flex flex-col items-center text-center py-6 gap-2">
              <CheckCircle2 className="w-10 h-10 text-success" />
              <p className="text-sm font-semibold text-foreground">You nailed it</p>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                No corrections this time — your speaking was clean. Keep the streak going.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Things to polish
              </p>
              {uniqueCorrections.slice(0, 8).map((c, idx) => (
                <div key={idx} className="rounded-xl bg-card/60 border border-border/30 px-3 py-2.5">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border mb-1.5',
                    TYPE_COLOR[c.type] ?? TYPE_COLOR.grammar
                  )}>
                    {c.type}
                  </span>
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="line-through opacity-50 text-foreground/70">{c.original}</span>
                    <ArrowRight className="w-3 h-3 text-primary/60 flex-shrink-0" />
                    <span className="font-semibold text-primary">{c.corrected}</span>
                  </div>
                  {c.note && (
                    <p className="text-[11px] text-muted-foreground leading-snug mt-1">{c.note}</p>
                  )}
                </div>
              ))}
              {uniqueCorrections.length > 8 && (
                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  +{uniqueCorrections.length - 8} more saved to your progress
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/30 bg-muted/20">
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
