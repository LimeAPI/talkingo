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
        className={cn('flex-shrink-0 drop-shadow-[0_4px_18px_hsl(var(--primary)/0.45)]', sizes[size])}
        aria-label="Talkingo Logo"
      >
        <defs>
          <linearGradient id="talkingo-logo-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="hsl(14, 96%, 60%)" />
            <stop offset="55%"  stopColor="hsl(330, 78%, 58%)" />
            <stop offset="100%" stopColor="hsl(268, 80%, 58%)" />
          </linearGradient>
          <linearGradient id="talkingo-logo-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="white" stopOpacity="0.35" />
            <stop offset="55%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="108" height="108" rx="28" fill="url(#talkingo-logo-fill)" />
        <rect x="6" y="6" width="108" height="108" rx="28" fill="url(#talkingo-logo-sheen)" />
        {/* Stylized "T" with chat bubble notch — language + conversation */}
        <path
          d="M32 40H88M60 40V86"
          stroke="white"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="86" cy="84" r="6" fill="white" opacity="0.95" />
      </svg>
      {showText && (
        <span
          className={cn('font-display font-bold text-aurora', textClassName)}
        >
          Talkingo
        </span>
      )}
    </div>
  )
}
