'use client'

import { cn } from '@talkingo/shared/utils'

interface VoiceVisualizerProps {
  isActive: boolean
  mode?: 'listening' | 'speaking' | 'idle'
  size?: 'small' | 'medium' | 'large'
}

export function VoiceVisualizer({
  isActive,
  mode = 'idle',
  size = 'medium',
}: VoiceVisualizerProps) {
  const barCount = 13

  const sizeClasses = {
    small: { width: 'w-1', height: 'h-16', maxHeight: '3rem' },
    medium: { width: 'w-1.5', height: 'h-20', maxHeight: '5rem' },
    large: { width: 'w-2', height: 'h-24', maxHeight: '6rem' },
  }

  const { width, height, maxHeight } = sizeClasses[size]

  return (
    <div className={cn('flex items-end justify-center gap-1.5', height)}>
      {Array.from({ length: barCount }).map((_, i) => {
        const centerIndex = Math.floor(barCount / 2)
        const distanceFromCenter = Math.abs(i - centerIndex)
        const baseHeight = Math.max(0.5, 1 - distanceFromCenter * 0.15)

        return (
          <div
            key={i}
            className={cn(
              width,
              'rounded-full transition-all duration-300',
              isActive && mode !== 'idle'
                ? mode === 'speaking'
                  ? 'bg-gradient-to-t from-primary to-primary-glow waveform-bar'
                  : 'bg-gradient-to-t from-secondary to-secondary-glow waveform-bar-listening'
                : 'bg-muted/30'
            )}
            style={{
              animationDelay: `${i * 0.06}s`,
              minHeight: `${baseHeight}rem`,
              maxHeight: isActive && mode !== 'idle' ? maxHeight : `${baseHeight}rem`,
              opacity: isActive && mode !== 'idle' ? 1 : 0.4,
            }}
          />
        )
      })}
    </div>
  )
}
