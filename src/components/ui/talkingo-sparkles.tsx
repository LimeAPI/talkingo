'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SparkleProps {
  id: number
  createdAt: number
  color: string
  size: number
  style: React.CSSProperties
}

const useRandomSparkle = (color: string = 'oklch(var(--primary))') => {
  const [sparkle, setSparkle] = useState<SparkleProps | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      const id = Date.now()
      const size = Math.random() * 8 + 4
      setSparkle({
        id,
        createdAt: Date.now(),
        color,
        size,
        style: {
          top: Math.random() * 100 + '%',
          left: Math.random() * 100 + '%',
        },
      })
    }, 600)
    return () => clearInterval(interval)
  }, [color])

  return sparkle
}

interface TalkingoSparklesProps {
  className?: string
  color?: string
  count?: number
}

export function TalkingoSparkles({ className, color = 'oklch(var(--primary))', count = 8 }: TalkingoSparklesProps) {
  const sparkle = useRandomSparkle(color)

  const staticSparkles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      cx: Math.random() * 100 + '%',
      cy: Math.random() * 100 + '%',
      size: Math.random() * 6 + 3,
      delay: Math.random() * 3,
    }))
  }, [count])

  return (
    <span className={cn('relative', className)} aria-hidden="true">
      {staticSparkles.map((s) => (
        <motion.svg
          key={s.id}
          width={s.size}
          height={s.size}
          viewBox="0 0 160 160"
          className="absolute pointer-events-none"
          style={{ left: s.cx, top: s.cy }}
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.2, 0],
            rotate: [0, 180],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: s.delay,
            ease: 'easeInOut',
          }}
        >
          <path
            d="M80 0C80 0 84.2846 41.2925 101.496 58.504C118.707 75.7154 160 80 160 80C160 80 118.707 84.2846 101.496 101.496C84.2846 118.707 80 160 80 160C80 160 75.7154 118.707 58.504 101.496C41.2925 84.2846 0 80 0 80C0 80 41.2925 75.7154 58.504 58.504C75.7154 41.2925 80 0 80 0Z"
            fill={color}
          />
        </motion.svg>
      ))}

      {sparkle && (
        <motion.svg
          key={sparkle.id}
          width={sparkle.size}
          height={sparkle.size}
          viewBox="0 0 160 160"
          className="absolute pointer-events-none"
          style={sparkle.style}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.4 }}
        >
          <path
            d="M80 0C80 0 84.2846 41.2925 101.496 58.504C118.707 75.7154 160 80 160 80C160 80 118.707 84.2846 101.496 101.496C84.2846 118.707 80 160 80 160C80 160 75.7154 118.707 58.504 101.496C41.2925 84.2846 0 80 0 80C0 80 41.2925 75.7154 58.504 58.504C75.7154 41.2925 80 0 80 0Z"
            fill={sparkle.color}
          />
        </motion.svg>
      )}
    </span>
  )
}
