'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AvatarSVG } from './AvatarSVG'

interface PersonaAvatarProps {
  personaId: string
  state?: 'idle' | 'speaking' | 'listening' | 'thinking'
  size?: 'default' | 'sm' | 'lg' | 'xl'
  className?: string
}

const sizeMap = {
  default: 80,
  sm: 56,
  lg: 96,
  xl: 120,
}

export function PersonaAvatar({
  personaId,
  state = 'idle',
  size = 'default',
  className,
}: PersonaAvatarProps) {
  const dimension = sizeMap[size]

  return (
    <motion.div
      className={cn('relative inline-flex items-center justify-center', className)}
      animate={state === 'speaking' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={
        state === 'speaking'
          ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
          : { duration: 0.3 }
      }
    >
      <div className="relative">
        <AvatarSVG personaId={personaId} size={dimension} className="rounded-full" />

        {state === 'listening' && (
          <motion.span
            className="absolute inset-0 rounded-full"
            initial={{ opacity: 0.6, scale: 0.95 }}
            animate={{ opacity: [0.6, 0.2, 0.6], scale: [0.95, 1.12, 0.95] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            style={{
              background:
                'radial-gradient(circle, oklch(var(--primary) / 0.25) 0%, transparent 70%)',
            }}
          />
        )}

        {state === 'speaking' && (
          <motion.span
            className="absolute inset-0 rounded-full"
            initial={{ opacity: 0.4, scale: 1 }}
            animate={{ opacity: [0.4, 0.15, 0.4], scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
            style={{
              background:
                'radial-gradient(circle, oklch(var(--secondary) / 0.3) 0%, transparent 70%)',
            }}
          />
        )}
      </div>
    </motion.div>
  )
}
