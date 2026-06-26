'use client'

import { motion } from 'framer-motion'
import { cn } from '@talkingo/shared/utils'
import { MessageCircle, GraduationCap, Clock, User } from 'lucide-react'
import type { HomeTab } from './BottomNav'

interface DesktopTopNavProps {
  activeTab: HomeTab
  onTabChange: (tab: HomeTab) => void
  userName?: string
}

const tabs: { id: HomeTab; label: string; icon: typeof MessageCircle; color: string }[] = [
  { id: 'talk', label: 'Talk', icon: MessageCircle, color: 'text-primary' },
  { id: 'learn', label: 'Learn', icon: GraduationCap, color: 'text-secondary' },
  { id: 'history', label: 'History', icon: Clock, color: 'text-accent' },
  { id: 'profile', label: 'Profile', icon: User, color: 'text-success' },
]

export function DesktopTopNav({ activeTab, onTabChange }: DesktopTopNavProps) {
  return (
    <nav
      className={cn(
        'hidden md:flex fixed top-5 left-1/2 -translate-x-1/2 z-50',
        'rounded-[28px] border border-border/40 bg-card/90 backdrop-blur-xl',
        'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.40),0_0_0_1px_rgba(255,215,0,0.04)_inset]'
      )}
      aria-label="Main navigation"
    >
      <div className="relative flex items-center px-2 py-2 gap-1">
        {tabs.map(({ id, label, icon: Icon, color }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabChange(id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1',
                'min-w-[72px] px-3 py-2 rounded-2xl transition-colors duration-200',
                '[-webkit-tap-highlight-color:transparent]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                isActive ? color : 'text-foreground/50 hover:text-foreground/80'
              )}
            >
              {/* Static accent border on active */}
              {isActive && (
                <motion.div
                  layoutId="top-orbit-ring"
                  className="absolute inset-0 rounded-2xl border-2 border-current/30"
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
