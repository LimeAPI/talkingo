'use client'

import { cn } from '@talkingo/shared/utils'
import { ArrowRight, Sparkles, TrendingUp, Clock, CheckCircle2, PartyPopper } from 'lucide-react'
import type { Correction } from '@talkingo/shared/types'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface LevelUpOffer {
  fromLevel: number
  toLevel: number
  toLevelName: string
}

interface SessionRecapDialogProps {
  isOpen: boolean
  corrections: Correction[]
  durationSeconds: number
  /** Set when the learner is ready to be offered the next level. */
  levelUp?: LevelUpOffer | null
  onAcceptLevelUp: () => void
  onClose: () => void
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const TYPE_COLOR: Record<Correction['type'], string> = {
  grammar: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  vocabulary: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  pronunciation: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  naturalness: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
}

export function SessionRecapDialog({
  isOpen,
  corrections,
  durationSeconds,
  levelUp,
  onAcceptLevelUp,
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col" showCloseButton={false}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-secondary/5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Session recap</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground">Nice work — here&apos;s what we covered</h2>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDuration(durationSeconds)}</span>
            <span className="mx-1">·</span>
            <span>{uniqueCorrections.length} thing{uniqueCorrections.length === 1 ? '' : 's'} to polish</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Level-up celebration */}
          {levelUp && (
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-secondary/10 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <PartyPopper className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold text-foreground">You&apos;re ready to level up!</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                You&apos;ve been speaking smoothly with very few slip-ups. Want to step up to
                {' '}<span className="font-semibold text-foreground">Level {levelUp.toLevel} — {levelUp.toLevelName}</span>?
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={onAcceptLevelUp}
                  className="flex-1 bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Level up to {levelUp.toLevel}
                </Button>
              </div>
            </div>
          )}

          {/* Corrections list */}
          {nailedIt ? (
            <div className="flex flex-col items-center text-center py-6 gap-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
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
                    <span className="line-through opacity-60 text-correction-soft">{c.original}</span>
                    <ArrowRight className="w-3 h-3 text-correction/60 flex-shrink-0" />
                    <span className="font-semibold text-correction">{c.corrected}</span>
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
            {levelUp ? 'Maybe later' : 'Done'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
