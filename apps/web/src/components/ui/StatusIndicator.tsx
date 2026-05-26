'use client'

import { cn } from '@talkingo/shared/utils'
import { Sparkles } from 'lucide-react'

interface StatusIndicatorProps {
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  flowState: number
}

export function StatusIndicator({ difficulty, flowState }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium border',
        difficulty === 'beginner' && 'border-success/40 text-success',
        difficulty === 'intermediate' && 'border-correction/40 text-correction',
        difficulty === 'advanced' && 'border-primary/40 text-primary'
      )}>
        <span className="capitalize">{difficulty}</span>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/60 border border-border/50">
        <Sparkles className="w-3 h-3 text-muted-foreground" />
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all duration-300',
                level <= flowState ? 'bg-secondary shadow-sm' : 'bg-muted-foreground/20'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
