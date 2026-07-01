'use client'

import { cn } from '@talkingo/shared/utils'
import { Mic, Square } from 'lucide-react'

interface ConversationButtonProps {
  isActive: boolean
  onClick: () => void
  size?: 'md' | 'lg' | 'xl'
}

export function ConversationButton({
  isActive,
  onClick,
  size = 'lg',
}: ConversationButtonProps) {
  const sizeClasses = { md: 'w-14 h-14', lg: 'w-16 h-16', xl: 'w-20 h-20' }
  const iconSizes  = { md: 'w-5 h-5',  lg: 'w-6 h-6',  xl: 'w-7 h-7'  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative rounded-full border-2 transition-all duration-300 flex items-center justify-center focus:outline-none group',
        sizeClasses[size],
        isActive
          ? 'bg-gradient-to-br from-primary to-primary-glow border-primary shadow-xl shadow-primary/20 scale-105 hover:scale-110 active:scale-95'
          : 'bg-card/90 backdrop-blur-sm border-border/60 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 hover:scale-105 active:scale-95'
      )}
      aria-label={isActive ? 'Stop recording' : 'Start recording'}
    >
      {isActive && (
        <>
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ring-expand" />
        </>
      )}
      <div className={cn(
        'relative z-10 transition-all duration-300',
        isActive ? 'text-primary-foreground' : 'text-foreground/80 group-hover:text-primary'
      )}>
        {isActive ? <Square className={iconSizes[size]} /> : <Mic className={iconSizes[size]} />}
      </div>
    </button>
  )
}
