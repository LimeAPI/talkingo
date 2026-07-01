'use client'

import { useState, useRef, useEffect, useMemo, type ReactNode, type ComponentType } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, Keyboard, Send, ChevronRight, PenLine,
  Coffee, Users, Plane, Briefcase, Lightbulb, Globe, Sparkles,
  MessageSquare, Target, Play, Check, Lock,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { useAuth } from '@/context/AuthContext'
import { isSubscribed } from '@/lib/subscription/use-subscription'
import type {
  LanguageProgress, UserPreferences,
} from '@talkingo/shared/types'
import { getLanguageMeta } from '@talkingo/shared/languages'
import { fetchScenariosWithCache, type CachedScenario } from '@/lib/cache/client-cache'
import { getCompletedLessons, getLessonStatusMap } from '@/lib/storage/lesson-progress'
import type { LessonStatus } from '@/lib/storage/lesson-progress'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LearningMode = 'free' | 'practice'
export type InputMethod = 'voice' | 'text'

interface TalkScreenProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userName?: string
  userId: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  learningMode: LearningMode
  inputMethod: InputMethod
  onLearningModeChange: (mode: LearningMode) => void
  onInputMethodChange: (method: InputMethod) => void
  onNavigateToLearn?: () => void
}

// ─── Animation ────────────────────────────────────────────────────────────────

const stagger = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i * 0.05, 0.16), duration: 0.42, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

// ─── Topic helpers ──────────────────────────────────────────────────────────
// Quick topics are now drawn live from the curriculum for the learner's current
// level — so every card maps to a REAL scenario seed (e.g. "cafe-l03"), the AI
// gets the right brief/grammar/vocab, and the cards reflect actual progress.

type TopicStatus = 'new' | 'practicing' | 'done'

/** Map a curriculum category to a representative icon. */
function iconForCategory(category: string): ComponentType<{ className?: string }> {
  switch (category) {
    case 'Daily Life': return Coffee
    case 'Social': return Users
    case 'Travel': return Plane
    case 'Work & Study': return Briefcase
    case 'Ideas & Stories': return Lightbulb
    case 'Culture & Deep': return Globe
    case 'Expression': return Sparkles
    default: return MessageSquare
  }
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'First Words', 2: 'Building Blocks', 3: 'Survival Mode', 4: 'Getting Comfortable',
  5: 'Conversation Ready', 6: 'Finding Flow', 7: 'Confident Speaker', 8: 'Nuance Hunter',
  9: 'Almost Native', 10: 'Native Vibes', 11: 'Polished', 12: 'Mastery',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TalkScreen({
  preferences, progress, userName, userId,
  onStartSession, learningMode, inputMethod,
  onLearningModeChange, onInputMethodChange, onNavigateToLearn,
}: TalkScreenProps) {
  const { user } = useAuth()
  const voiceLocked = !isSubscribed(user?.id)

  const lang = getLanguageMeta(preferences.targetLanguage)
  const minutes = progress?.totalMinutes ?? 0
  const sessions = progress?.totalSessions ?? 0
  const hasStats = sessions > 0 || minutes > 0

  const userLevel = progress?.talkingoLevel ?? preferences.talkingoLevel ?? 1

  // ── Live curriculum data ───────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<CachedScenario[]>([])
  const [completedLessons, setCompletedLessons] = useState<string[]>([])
  const [lessonStatus, setLessonStatus] = useState<Record<string, LessonStatus>>({})

  useEffect(() => {
    let cancelled = false
    fetchScenariosWithCache()
      .then((data) => { if (!cancelled) setScenarios(data) })
      .catch(() => { /* keep skeleton fallback */ })
    return () => { cancelled = true }
  }, [])

  // Read progress on mount and refresh when returning from a session.
  useEffect(() => {
    const refresh = () => {
      setCompletedLessons(getCompletedLessons())
      setLessonStatus(getLessonStatusMap())
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const doneSet = useMemo(() => new Set(completedLessons), [completedLessons])

  // Scenarios for the learner's current level (real seeds, real ids).
  const levelScenarios = useMemo(
    () => scenarios.filter(
      (s) => s.id !== 'free-talk' && (parseInt(String(s.difficulty), 10) || 1) === userLevel
    ),
    [scenarios, userLevel]
  )

  // The single best next action: resume an in-progress scenario, else the first
  // not-yet-done one at this level. Powers the "Continue" hero card.
  const nextScenario = useMemo(() => {
    const resume = levelScenarios.find(
      (s) => (lessonStatus[s.id] ?? 'new') === 'practicing' && !doneSet.has(s.id)
    )
    if (resume) return { scenario: resume, resume: true }
    const fresh = levelScenarios.find((s) => !doneSet.has(s.id))
    if (fresh) return { scenario: fresh, resume: false }
    return null
  }, [levelScenarios, lessonStatus, doneSet])

  // Up to 4 topic cards: not-done first (excluding the Continue card's scenario),
  // then completed ones so the grid never looks empty.
  const quickTopics = useMemo(() => {
    const continueId = nextScenario?.scenario.id
    const notDone = levelScenarios.filter((s) => !doneSet.has(s.id) && s.id !== continueId)
    const done = levelScenarios.filter((s) => doneSet.has(s.id) && s.id !== continueId)
    return [...notDone, ...done].slice(0, 4).map((s) => {
      const status: TopicStatus = doneSet.has(s.id)
        ? 'done'
        : (lessonStatus[s.id] ?? 'new') === 'practicing' ? 'practicing' : 'new'
      return { scenario: s, status }
    })
  }, [levelScenarios, doneSet, lessonStatus, nextScenario])

  const topicsLoading = scenarios.length === 0

  return (
    <div className="relative flex-1 flex flex-col">
      <div className="relative z-10 max-w-lg mx-auto w-full px-5 sm:px-8 pt-5 pb-28 flex-1 flex flex-col overflow-y-auto overflow-x-hidden gap-4 custom-scrollbar">

        {/* ── Header ── */}
        <motion.div custom={0} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
            {todayLabel()}
          </span>
          <p className="font-display text-[1.75rem] sm:text-3xl font-semibold text-foreground leading-[1.1] tracking-tight mt-1.5">
            {greetingByTime()}{userName ? `, ${userName}` : ''}
          </p>
          <p className="text-sm text-foreground/50 mt-1.5">
            {hasStats ? (
              <>
                <span className="text-foreground/70 font-medium">{sessions}</span> sessions
                <span className="text-foreground/25 mx-1.5">·</span>
                <span className="text-foreground/70 font-medium">{formatShort(minutes)}</span> speaking
                <span className="text-foreground/25 mx-1.5">·</span>
              </>
            ) : null}
            Learning <span className="font-medium text-primary">{lang.native}</span>
          </p>
        </motion.div>

        {/* ── Learning Mode Selector ── */}
        <motion.div custom={1} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <div className="flex gap-2.5">
            <LearningModeCard
              active={learningMode === 'free'}
              onClick={() => onLearningModeChange('free')}
              icon={<MessageSquare className="w-4.5 h-4.5" />}
              title="Casual Chat"
              subtitle="Just talk naturally"
              accentClass="from-primary/20 to-primary/5 border-primary/30"
              activeAccent="from-primary/30 to-primary/10 border-primary/50 shadow-primary/15"
              iconColor="text-primary"
            />
            <LearningModeCard
              active={learningMode === 'practice'}
              onClick={() => onLearningModeChange('practice')}
              icon={<Target className="w-4.5 h-4.5" />}
              title="Practice"
              subtitle="Work on weak spots"
              accentClass="from-foreground/[0.06] to-foreground/[0.02] border-border/50"
              activeAccent="from-foreground/[0.1] to-foreground/[0.03] border-foreground/25 shadow-foreground/10"
              iconColor="text-foreground/70"
            />
          </div>
        </motion.div>

        {/* ── Input Method Toggle ── */}
        <motion.div custom={2} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/45">How do you want to talk?</span>
          </div>
          <div className="mt-2 flex gap-2">
            <InputMethodPill
              active={inputMethod === 'voice'}
              onClick={() => onInputMethodChange('voice')}
              icon={<Mic className="w-4 h-4" />}
              label="Voice"
              description="Speak naturally"
              locked={voiceLocked}
            />
            <InputMethodPill
              active={inputMethod === 'text'}
              onClick={() => onInputMethodChange('text')}
              icon={<Keyboard className="w-4 h-4" />}
              label="Text"
              description="Type messages"
            />
          </div>
        </motion.div>

        {/* ── Topics ── */}
        <motion.div custom={3} variants={stagger} initial="hidden" animate="show" className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-1 mb-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/45">Pick a topic</span>
            <button
              onClick={onNavigateToLearn}
              className="text-[11px] font-semibold text-primary/70 hover:text-primary transition-colors flex items-center gap-0.5"
            >
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Continue hero — one tap to the most useful next conversation */}
          {nextScenario && (
            <button
              onClick={() => onStartSession(nextScenario.scenario.id, nextScenario.resume ? 'continue' : 'new')}
              className="group w-full text-left mb-2.5 p-3.5 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.12] to-primary/[0.03] hover:border-primary/50 hover:shadow-[var(--shadow-card)] transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  {nextScenario.resume ? <Sparkles className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                    {nextScenario.resume ? 'Pick up where you left off' : 'Continue your path'}
                  </p>
                  <h3 className="text-sm font-bold text-foreground truncate mt-0.5">{nextScenario.scenario.title}</h3>
                  <p className="text-[11px] text-foreground/50 truncate">
                    Level {userLevel} · {LEVEL_LABELS[userLevel] ?? `Level ${userLevel}`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-primary flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 flex-1 content-start">
            {topicsLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[58px] rounded-xl border border-border/40 bg-card/60 animate-pulse" />
                ))
              : quickTopics.map(({ scenario, status }) => (
                  <TopicCard
                    key={scenario.id}
                    icon={(() => { const Ic = iconForCategory(scenario.category); return <Ic className="w-4 h-4" /> })()}
                    label={scenario.title}
                    status={status}
                    onClick={() => onStartSession(scenario.id, status === 'practicing' ? 'continue' : 'new')}
                  />
                ))}
          </div>

          {/* Custom topic input */}
          <div className="mt-3 flex-shrink-0">
            <CustomTopicInput onStartSession={onStartSession} />
          </div>
        </motion.div>

        {/* ── Start Button ── */}
        <motion.div custom={4} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <button
            onClick={() => onStartSession('free-talk', 'new')}
            className={cn(
              'group relative w-full py-4 rounded-2xl font-semibold text-[15px] text-center transition-all duration-300 active:scale-[0.98] overflow-hidden',
              inputMethod === 'voice'
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30'
                : 'bg-foreground text-background shadow-lg shadow-foreground/15 hover:shadow-xl hover:shadow-foreground/20'
            )}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            </div>
            <span className="relative z-10 flex items-center justify-center gap-2.5">
              {inputMethod === 'voice' ? <Mic className="w-4.5 h-4.5" /> : <Send className="w-4 h-4" />}
              {inputMethod === 'voice' ? 'Start Talking' : 'Start Chatting'}
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Learning Mode Card ───────────────────────────────────────────────────────

function LearningModeCard({ active, onClick, icon, title, subtitle, accentClass, activeAccent, iconColor }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  title: string
  subtitle: string
  accentClass: string
  activeAccent: string
  iconColor: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative flex-1 flex flex-col items-start gap-2.5 p-4 rounded-2xl border transition-all duration-300 overflow-hidden',
        'bg-gradient-to-br',
        active ? activeAccent + ' shadow-[var(--shadow-card)]' : accentClass + ' hover:shadow-[var(--shadow-card)]',
      )}
    >
      {/* Active indicator */}
      {active && (
        <motion.div
          layoutId="learning-mode-indicator"
          className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-current opacity-70"
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        />
      )}

      <div className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 border',
        active ? 'bg-background/70 border-border/50 shadow-sm' : 'bg-background/40 border-border/40',
        iconColor
      )}>
        {icon}
      </div>

      <div className="text-left">
        <p className={cn(
          'text-sm font-bold transition-colors tracking-tight',
          active ? 'text-foreground' : 'text-foreground/70'
        )}>{title}</p>
        <p className={cn(
          'text-[11px] mt-0.5 transition-colors',
          active ? 'text-foreground/55' : 'text-foreground/40'
        )}>{subtitle}</p>
      </div>
    </motion.button>
  )
}

// ─── Input Method Pill ────────────────────────────────────────────────────────

function InputMethodPill({ active, onClick, icon, label, description, locked }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  description: string
  locked?: boolean
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-250',
        active
          ? 'bg-card border-primary/40 shadow-[var(--shadow-card)]'
          : 'bg-transparent border-border/50 hover:border-border/70 hover:bg-card/50'
      )}
    >
      {locked && (
        <span
          className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary"
          aria-label="Premium feature"
        >
          <Lock className="w-2.5 h-2.5" /> Premium
        </span>
      )}
      {active && (
        <motion.div
          layoutId="input-method-active"
          className="absolute inset-0 rounded-xl ring-1 ring-primary/25 bg-primary/[0.04]"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <span className={cn(
        'relative z-10 transition-colors',
        active ? 'text-primary' : 'text-foreground/40'
      )}>{icon}</span>
      <div className="relative z-10 text-left">
        <p className={cn(
          'text-xs font-bold transition-colors',
          active ? 'text-foreground' : 'text-foreground/60'
        )}>{label}</p>
        <p className={cn(
          'text-[10px] transition-colors',
          active ? 'text-foreground/50' : 'text-foreground/30'
        )}>{description}</p>
      </div>
    </motion.button>
  )
}

// ─── Topic Card ───────────────────────────────────────────────────────────────

function TopicCard({ icon, label, status = 'new', onClick }: {
  icon: ReactNode
  label: string
  status?: TopicStatus
  onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left group transition-all duration-200',
        'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-md)]',
        status === 'done'
          ? 'border-success/20 bg-success/[0.04] hover:border-success/40'
          : status === 'practicing'
            ? 'border-primary/30 bg-primary/[0.04] hover:border-primary/50'
            : 'border-border/60 bg-card hover:border-primary/30'
      )}
    >
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-colors',
        status === 'done'
          ? 'bg-success/10 border-success/20 text-success'
          : 'bg-primary/10 border-primary/20 text-primary/70 group-hover:text-primary group-hover:bg-primary/15'
      )}>
        {status === 'done' ? <Check className="w-4 h-4" /> : icon}
      </div>
      <span className={cn(
        'flex-1 min-w-0 text-xs font-medium truncate transition-colors',
        status === 'done' ? 'text-foreground/55' : 'text-foreground/70 group-hover:text-foreground'
      )}>{label}</span>
      {status === 'practicing' && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" aria-label="In progress" />
      )}
    </motion.button>
  )
}

// ─── Custom Topic Input ───────────────────────────────────────────────────────

function CustomTopicInput({ onStartSession }: { onStartSession: (id: string, mode: 'new') => void }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleStart = () => {
    const trimmed = value.trim()
    if (!trimmed) { inputRef.current?.focus(); return }
    const id = `custom-${Date.now()}`
    sessionStorage.setItem('talkingo_custom_scenario', JSON.stringify({ id, prompt: trimmed, createdAt: Date.now() }))
    setValue('')
    onStartSession(id, 'new')
  }

  return (
    <div
      className={cn(
        'relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-200',
        'bg-card',
        focused
          ? 'border-primary/50 shadow-[0_0_0_3px_oklch(var(--primary)/0.12)]'
          : 'border-border/50 hover:border-border/70'
      )}
    >
      <PenLine className="w-3.5 h-3.5 text-foreground/30 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Or type your own topic..."
        className="flex-1 bg-transparent text-xs text-foreground placeholder:text-foreground/35 focus:outline-none min-w-0"
      />
      <AnimatePresence>
        {value.trim() && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={handleStart}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/20 active:scale-90 transition-transform"
            aria-label="Start custom session"
          >
            <Send className="w-3 h-3" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatShort(m: number) {
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function greetingByTime() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}
