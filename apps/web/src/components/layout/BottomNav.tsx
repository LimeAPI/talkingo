'use client'

import { cn } from '@talkingo/shared/utils'
import { MessageCircle, GraduationCap, Clock, User } from 'lucide-react'

export type HomeTab = 'talk' | 'learn' | 'history' | 'profile'

interface BottomNavProps {
  activeTab: HomeTab
  onTabChange: (tab: HomeTab) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { id: HomeTab; label: string; icon: typeof MessageCircle }[] = [
    { id: 'talk', label: 'Talk', icon: MessageCircle },
    { id: 'learn', label: 'Learn', icon: GraduationCap },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'profile', label: 'Profile', icon: User },
  ]

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'bg-card/90 backdrop-blur-xl border-t border-border/60 shadow-lg',
        'safe-area-bottom'
      )}
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-2.5">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all duration-200',
                'min-w-[60px]',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'relative flex items-center justify-center w-8 h-8 rounded-2xl transition-all duration-300',
                isActive && 'bg-primary/12'
              )}>
                <Icon className={cn(
                  'w-5 h-5 transition-all duration-200',
                  isActive && 'scale-105'
                )} />
              </div>
              <span className={cn(
                'text-[10px] font-semibold transition-all duration-200',
                isActive ? 'opacity-100' : 'opacity-80'
              )}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
