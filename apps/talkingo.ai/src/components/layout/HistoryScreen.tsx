'use client'

import { Clock } from 'lucide-react'
import { Starfield } from '@/components/ui/orbital'

/**
 * History tab — intentionally empty.
 *
 * The previous conversation-history feature was removed. This tab is kept as a
 * placeholder so it can be repurposed for a future feature without having to
 * re-wire navigation. Conversation persistence still happens behind the scenes
 * (it powers learner memory and lesson progress) — it just isn't surfaced here.
 */
export function HistoryScreen() {
  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24">
      <Starfield className="z-0" density={100} />
      <div className="relative z-10 max-w-md mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-lavender animate-star-twinkle" />
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              History
            </h1>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-star-twinkle" style={{ animationDelay: '0.5s' }} />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/15 rounded-full blur-md" />
            <div className="relative w-20 h-20 rounded-full bg-card/80 border border-primary/15 flex items-center justify-center animate-nebula-pulse">
              <Clock className="w-8 h-8 text-primary/40" />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nothing here yet</p>
          <p className="text-xs text-foreground/60 max-w-[220px]">
            Something new is coming to this space soon.
          </p>
        </div>
      </div>
    </div>
  )
}
