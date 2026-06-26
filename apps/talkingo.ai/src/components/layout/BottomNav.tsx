'use client'

import { motion } from 'framer-motion'
import { cn } from '@talkingo/shared/utils'
import { MessageCircle, GraduationCap, Clock, User } from 'lucide-react'

export type HomeTab = 'talk' | 'learn' | 'history' | 'profile'

interface BottomNavProps {
  activeTab: HomeTab
  onTabChange: (tab: HomeTab) => void
}

const tabs: { id: HomeTab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'talk', label: 'Talk', icon: MessageCircle },
  { id: 'learn', label: 'Learn', icon: GraduationCap },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'profile', label: 'Profile', icon: User },
]

const orbitColors: Record<HomeTab, string> = {
  talk: 'text-primary',
  learn: 'text-secondary',
  history: 'text-accent',
  profile: 'text-success',
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className={cn(
        'md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40',
        'rounded-[28px] border border-border/40 bg-card/90',
        'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.40),0_0_0_1px_rgba(255,215,0,0.04)_inset]',
        'safe-area-bottom backdrop-blur-xl'
      )}
      aria-label="Main navigation"
    >
      <div className="relative flex items-center px-2 py-2 gap-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabChange(id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1',
                'w-16 px-2 py-2 rounded-2xl transition-colors duration-200',
                '[-webkit-tap-highlight-color:transparent]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                isActive ? orbitColors[id] : 'text-foreground/50 hover:text-foreground/80'
              )}
            >
              {/* Static accent border on active */}
              {isActive && (
                <motion.div
                  layoutId="orbit-ring"
                  className="absolute inset-0 rounded-2xl border-2 border-current/30"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className={cn(
                'w-5 h-5 relative z-10 transition-transform duration-200',
                isActive ? 'scale-110' : 'scale-100'
              )} />
              <span className={cn(
                'text-xs font-semibold relative z-10',
                isActive ? 'opacity-100' : 'opacity-70'
              )}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
