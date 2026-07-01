'use client'

import { cn } from '@talkingo/shared/utils'

interface TalkingoLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  textClassName?: string
}

const sizes = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
}

export function TalkingoLogo({
  className,
  size = 'md',
  showText = false,
  textClassName,
}: TalkingoLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 120 120"
        className={cn('flex-shrink-0 drop-shadow-[0_4px_18px_oklch(var(--primary)/0.45)]', sizes[size])}
        aria-label="Talkingo Logo"
      >
        <g
          className="animate-orbital-spin"
          style={{ transformOrigin: '60px 60px', animationDuration: '8s' }}
        >
          <circle
            cx="60"
            cy="60"
            r="42"
            fill="none"
            stroke="#FFD700"
            strokeWidth="3"
            strokeOpacity="0.3"
          />
          <circle cx="102" cy="60" r="9" fill="#FFD700" />
        </g>
        <circle cx="60" cy="60" r="22" fill="#FFD700" />
      </svg>
      {showText && (
        <span
          className={cn(
            'font-display font-semibold tracking-tight text-aurora',
            textClassName
          )}
        >
          Talkingo
        </span>
      )}
    </div>
  )
}
