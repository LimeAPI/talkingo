'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Sparkles, Play, Flame, BookOpen,
  ArrowRight, MessageCircle, Phone, Send, GraduationCap, Headphones, Lock, Crown,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { isSubscribed } from '@/lib/subscription/use-subscription'
import { useAuth } from '@/context/AuthContext'
import { isModeAllowed } from '@/lib/subscription/free-tier'
import type {
  LanguageProgress, UserPreferences, TargetLanguage,
  CefrLevel,
} from '@talkingo/shared/types'
import { getLanguageMeta } from '@talkingo/shared/languages'
import { cefrToTalkingoLevel, getLevelByNumber } from '@talkingo/shared/levels'
import { FREE_TALK_SCENARIO } from '@talkingo/shared/curriculum'
import { hasPreviousSession, getMostRecentMemory } from '@/lib/storage/conversation-memory'

interface TalkScreenProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userName?: string
  userId: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  interactionMode: 'manual' | 'handsfree' | 'callonly' | 'live'
  onInteractionModeChange: (mode: 'manual' | 'handsfree' | 'callonly' | 'live') => void
  onNavigateToLearn?: () => void
}

export function TalkScreen({
  preferences,
  progress,
  userName,
  userId,
  onStartSession,
  interactionMode,
  onInteractionModeChange,
  onNavigateToLearn,
}: TalkScreenProps) {
  const { user } = useAuth()
  const isPremium = isSubscribed(user?.id)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const lang = getLanguageMeta(preferences.targetLanguage)
  const userCefr: CefrLevel = progress?.cefr ?? preferences.cefr ?? 'A1'
  const talkingoLevel = cefrToTalkingoLevel(userCefr)
  const levelInfo = getLevelByNumber(talkingoLevel)

  const resolvedUserId = userId || ''
  const hasPrevSession = resolvedUserId && hasPreviousSession(
    resolvedUserId, preferences.persona || 'eli', preferences.targetLanguage || 'en'
  )
  const recentMemory = resolvedUserId ? getMostRecentMemory(resolvedUserId) : null

  const streak  = progress?.streakDays ?? 0
  const minutes = progress?.totalMinutes ?? 0
  const sessions = progress?.totalSessions ?? 0

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-6 pb-20">
      <div className={cn(
        'w-full max-w-sm space-y-6 transition-all duration-600',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}>

        {/* ── Greeting + Stats ── */}
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {greetingByTime()}{userName ? `, ${userName}` : ''}
          </p>
          <h1 className="font-display text-3xl sm:text-[2rem] font-extrabold tracking-tight leading-tight">
            Talk in{' '}
            <span className="text-aurora">{lang.native}</span>
          </h1>

          {/* Stat pills */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="cefr-badge">Lv.{talkingoLevel} · {levelInfo.name}</span>
            {streak > 0 && (
              <StatPill icon={<Flame className="w-3.5 h-3.5 text-orange-400" />} value={`${streak}d`} />
            )}
            {sessions > 0 && (
              <StatPill icon={<MessageCircle className="w-3.5 h-3.5 text-primary" />} value={`${sessions}`} />
            )}
            {minutes > 0 && (
              <StatPill icon={<Sparkles className="w-3.5 h-3.5 text-secondary" />} value={`${minutes}m`} />
            )}
          </div>
        </div>

        {/* ── Mode toggle — top, before actions ── */}
        <div className="flex items-center justify-center">
          <div
            className="inline-flex items-center gap-1 p-1.5 rounded-2xl bg-card/80 border border-border/60 shadow-sm"
            role="tablist"
            aria-label="Conversation mode"
          >
            <ModeTab
              active={interactionMode === 'manual'}
              onClick={() => onInteractionModeChange('manual')}
              icon={<MessageCircle className="w-3.5 h-3.5" />}
              label="Chat"
            />
            <ModeTab
              active={interactionMode === 'handsfree'}
              onClick={() => onInteractionModeChange('handsfree')}
              icon={<Headphones className="w-3.5 h-3.5" />}
              label="Handsfree"
              locked={!isPremium}
            />
            <ModeTab
              active={interactionMode === 'live'}
              onClick={() => onInteractionModeChange('live')}
              icon={<Phone className="w-3.5 h-3.5" />}
              label="Call"
              locked={!isPremium}
            />
          </div>
        </div>

        {/* ── Continue last session ── */}
        {hasPrevSession && recentMemory && (
          <button
            onClick={() => onStartSession(recentMemory.lastScenarioId || FREE_TALK_SCENARIO.id, 'continue')}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl',
              'bg-card/70 border border-border/50 shadow-sm',
              'hover:border-primary/40 hover:bg-card/85 hover:shadow-md transition-all group'
            )}
          >
            <div className="w-9 h-9 rounded-2xl bg-primary/12 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/18 transition-colors">
              <Play className="w-4 h-4 text-primary fill-current ml-0.5" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <span className="text-sm font-semibold text-foreground block leading-tight">Continue last session</span>
              {recentMemory.lastTopics.length > 0 && (
                <span className="text-xs text-muted-foreground truncate block mt-0.5">
                  {recentMemory.lastTopics.slice(0, 2).join(' · ')}
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium flex-shrink-0">
              {formatLastSession(recentMemory.lastSessionAt)}
            </span>
          </button>
        )}

        {/* ── Primary CTA: Free Talk ── */}
        <button
          onClick={() => onStartSession('free-talk', 'new')}
          className="btn-gradient w-full py-5"
        >
          <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="text-left flex-1">
            <span className="text-base font-bold block leading-tight">Free Talk</span>
            <span className="text-xs opacity-85 font-normal">Any topic, any direction</span>
          </div>
          <ArrowRight className="w-5 h-5 opacity-80 flex-shrink-0" />
        </button>

        {/* ── Secondary actions ── */}
        <div className="space-y-2.5">
          {/* Browse Scenarios & Grammar — navigates to Learn tab */}
          <button
            onClick={onNavigateToLearn}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl',
              'bg-card/70 border border-border/50 shadow-sm',
              'hover:border-primary/40 hover:bg-card/85 hover:shadow-md transition-all group'
            )}
          >
            <div className="w-9 h-9 rounded-2xl bg-muted/50 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/12 transition-colors">
              <GraduationCap className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 text-left">
              <span className="text-sm font-semibold text-foreground block leading-tight">Scenarios & Grammar</span>
              <span className="text-xs text-muted-foreground mt-0.5 block">107 scenarios · 87 lessons · A1→C2</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary/70 transition-colors flex-shrink-0" />
          </button>

          {/* Custom scenario input */}
          <CustomInput onStartSession={onStartSession} />
        </div>

      </div>
    </div>
  )
}

// ─── Stat pill (minimal) ──────────────────────────────────────────────────────

function StatPill({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/70 border border-border/50 text-xs font-semibold text-foreground/85">
      {icon}
      {value}
    </span>
  )
}

// ─── Mode tab (for the Chat / Handsfree / Call toggle) ────────────────────────

function ModeTab({ active, onClick, icon, label, locked }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  locked?: boolean
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200',
        active
          ? 'bg-primary text-white shadow-md'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
      )}
    >
      {icon}
      {label}
      {locked && <Lock className="w-2.5 h-2.5 opacity-60" />}
    </button>
  )
}

// ─── Custom input ─────────────────────────────────────────────────────────────

function CustomInput({ onStartSession }: { onStartSession: (id: string, mode: 'new') => void }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleStart = () => {
    const trimmed = value.trim()
    if (!trimmed) { inputRef.current?.focus(); return }
    const id = `custom-${Date.now()}`
    sessionStorage.setItem('talkingo_custom_scenario', JSON.stringify({
      id, prompt: trimmed, createdAt: Date.now(),
    }))
    setValue('')
    onStartSession(id, 'new')
  }

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all duration-200',
      'bg-card/70 border',
      focused
        ? 'border-primary/50 bg-card/85 shadow-md'
        : 'border-border/50 hover:border-border/60 shadow-sm'
    )}>
      <Sparkles className="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Or type your own scenario…"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
      />
      <button
        onClick={handleStart}
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200',
          value.trim()
            ? 'bg-primary text-white shadow-sm hover:scale-105 active:scale-95'
            : 'bg-muted/50 text-muted-foreground/40'
        )}
        aria-label="Start custom session"
        disabled={!value.trim()}
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greetingByTime(): string {
  const h = new Date().getHours()
  if (h < 5)  return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Late night'
}

function formatLastSession(timestamp: number): string {
  const diff = Date.now() - timestamp
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

export type { TargetLanguage }
