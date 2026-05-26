'use client'

import { useEffect, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { CheckCircle2, Sparkles, ArrowRight, BookOpen, Loader2, X, Pencil, Quote, Crown, Lock } from 'lucide-react'
import type { SessionRecap } from '@talkingo/shared/types'
import { isSubscribed } from '@/lib/subscription/use-subscription'
import { useAuth } from '@/context/AuthContext'

interface SessionRecapDialogProps {
  isOpen: boolean
  recap: SessionRecap | null
  loading: boolean
  onClose: () => void
  onContinue: () => void
}

export function SessionRecapDialog({ isOpen, recap, loading, onClose, onContinue }: SessionRecapDialogProps) {
  const { user } = useAuth()
  const isPremium = isSubscribed(user?.id)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (isOpen) setTimeout(() => setVisible(true), 50)
    else setVisible(false)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className={cn(
          'relative w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar bg-card/95 border border-border/50 rounded-3xl shadow-2xl transition-all duration-300',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-muted/50 flex items-center justify-center transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-foreground/70" />
        </button>

        <div className="p-6 sm:p-8">
          {loading || !recap ? (
            <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Putting together your recap…</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Session Recap</span>
                </div>
                <h2 className="text-2xl font-bold mb-1">{recap.unitTitle}</h2>
                <p className="text-sm text-muted-foreground">
                  {Math.round(recap.durationSeconds / 60)} min · {recap.unitComplete ? 'Unit complete' : 'Keep going next time'}
                </p>
              </div>

              {/* Encouragement */}
              <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                <p className="text-sm leading-relaxed">{recap.encouragement}</p>
              </div>

              {/* "Caught You" — phrases that were correct but unnatural */}
              {recap.nativeWouldSay && recap.nativeWouldSay.length > 0 && (
                <section className="mb-6">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3">
                    <Pencil className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-400">
                      Caught you sounding like a textbook
                    </span>
                    {!isPremium && <Lock className="w-3 h-3 text-muted-foreground ml-auto" />}
                  </h3>
                  {isPremium ? (
                  <div className="space-y-2.5">
                    {recap.nativeWouldSay.slice(0, 4).map((n, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20"
                      >
                        <div className="flex items-start gap-2 mb-1.5">
                          <Quote className="w-3 h-3 text-amber-400/70 mt-1 flex-shrink-0" />
                          <p className="text-xs text-foreground/80 italic leading-snug">
                            You said: <span className="font-medium not-italic">"{n.userPhrase}"</span>
                          </p>
                        </div>
                        <div className="ml-5 mb-1.5">
                          <p className="text-sm font-semibold text-foreground leading-snug">
                            A native would say: <span className="text-amber-400">"{n.nativeAlternative}"</span>
                          </p>
                          <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">
                            {n.register}
                          </span>
                        </div>
                        <p className="ml-5 text-[11px] text-muted-foreground leading-snug">{n.why}</p>
                      </div>
                    ))}
                  </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-muted/20 border border-border/30 text-center space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {recap.nativeWouldSay.length} native phrasing tip{recap.nativeWouldSay.length > 1 ? 's' : ''} available
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">Upgrade to see how natives would say it</p>
                    </div>
                  )}
                </section>
              )}

              {/* Planted-phrase recap (Feature 2 - ambient injection) */}
              {recap.plantedPhraseRecap && recap.plantedPhraseRecap.timesUsed > 0 && (
                <section className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-secondary/10 to-primary/5 border border-secondary/20">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary mb-2">
                    <Sparkles className="w-3.5 h-3.5" /> Did you catch this one?
                  </h3>
                  <p className="text-sm leading-relaxed mb-2">
                    You heard "<span className="font-bold">{recap.plantedPhraseRecap.term}</span>"
                    {' '}<span className="text-muted-foreground">{recap.plantedPhraseRecap.timesUsed} times</span> today.
                  </p>
                  <p className="text-xs text-foreground/70 italic mb-1">What did it mean?</p>
                  <details className="cursor-pointer">
                    <summary className="text-xs text-secondary font-medium select-none">Reveal</summary>
                    <p className="text-sm font-semibold text-foreground mt-2">
                      {recap.plantedPhraseRecap.gloss}
                    </p>
                  </details>
                </section>
              )}

              {/* Vocab */}
              {recap.vocabSeen.length > 0 && (
                <section className="mb-6">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    <BookOpen className="w-3.5 h-3.5" /> New vocabulary
                    {!isPremium && <Lock className="w-3 h-3 text-muted-foreground ml-auto" />}
                  </h3>
                  {isPremium ? (
                  <div className="space-y-2">
                    {recap.vocabSeen.slice(0, 8).map((v, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-xl bg-card/60 border border-border/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">{v.term}</span>
                            {v.romanization && (
                              <span className="text-[11px] text-muted-foreground italic">[{v.romanization}]</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{v.gloss}</p>
                          {v.example && (
                            <p className="text-[11px] text-foreground/60 mt-1 italic">e.g. {v.example}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-muted/20 border border-border/30 text-center space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {recap.vocabSeen.length} new word{recap.vocabSeen.length > 1 ? 's' : ''} learned this session
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">Upgrade to save vocabulary to your phrase bank</p>
                    </div>
                  )}
                </section>
              )}

              {/* Top corrections */}
              {recap.topCorrections.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    Things to watch
                  </h3>
                  <div className="space-y-2">
                    {recap.topCorrections.slice(0, 5).map((c, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-card/60 border border-border/30"
                      >
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="line-through opacity-60 text-correction-soft">{c.original}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-correction" />
                          <span className="font-semibold text-correction">{c.corrected}</span>
                        </div>
                        {c.note && <p className="text-[11px] text-muted-foreground mt-1">{c.note}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Grammar tried */}
              {recap.grammarTried.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Grammar you used
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {recap.grammarTried.map((g, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-xs font-medium text-secondary"
                      >
                        <CheckCircle2 className="w-3 h-3" /> {g}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Next focus */}
              <div className="mb-6 p-3 rounded-xl bg-muted/30 border border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Next session</p>
                <p className="text-sm">{recap.nextFocus}</p>
              </div>

              {/* CTA */}
              <button
                onClick={onContinue}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-white font-medium text-sm hover:shadow-lg hover:shadow-primary/25 transition-all"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
