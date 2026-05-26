'use client'

import { cn } from '@talkingo/shared/utils'
import { AvatarSVG } from './AvatarSVG'

interface AvatarProps {
  personaId: string
  state: 'speaking' | 'listening' | 'idle' | 'thinking'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({
  personaId,
  state,
  size = 'lg',
  className,
}: AvatarProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
  }

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      {/* Glow effect when speaking or thinking */}
      {(state === 'speaking' || state === 'thinking') && (
        <div
          className={cn(
            'absolute inset-0 rounded-full blur-xl opacity-40',
            state === 'speaking' ? 'animate-pulse' : 'animate-ping-slow',
            personaId === 'maya' && 'bg-orange-400',
            personaId === 'alex' && 'bg-blue-400',
            personaId === 'dr-chen' && 'bg-purple-400',
            personaId === 'sofia' && 'bg-emerald-400',
            personaId === 'eli' && 'bg-primary'
          )}
        />
      )}

      {/* Avatar container with animation */}
      <div
        className={cn(
          'relative rounded-full overflow-hidden transition-all duration-500',
          state === 'speaking' && 'animate-avatar-breathe scale-110',
          state === 'thinking' && 'scale-105 ring-2 ring-white/30',
          state === 'listening' && 'scale-105 ring-2 ring-white/20',
          state === 'idle' && 'opacity-90'
        )}
      >
        <AvatarSVG personaId={personaId} className="w-full h-full" />
      </div>

      {/* Status indicator dot */}
      <div
        className={cn(
          'absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background transition-all duration-300 flex items-center justify-center',
          state === 'speaking' && 'bg-secondary animate-pulse',
          state === 'thinking' && 'bg-yellow-400',
          state === 'listening' && 'bg-primary',
          state === 'idle' && 'bg-muted-foreground/50'
        )}
      />
    </div>
  )
}
