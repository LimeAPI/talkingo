'use client'

import { useState, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, Keyboard, Send, BookOpen, ChevronRight, PenLine,
  Coffee, UserPlus, MapPin, ShoppingBag, Utensils, Sun,
  Zap, MessageSquare, Sparkles, Target,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import { useAuth } from '@/context/AuthContext'
import { Starfield } from '@/components/ui/orbital'
import type {
  LanguageProgress, UserPreferences,
} from '@talkingo/shared/types'
import { getLanguageMeta } from '@talkingo/shared/languages'

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
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  }),
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

const QUICK_TOPICS = [
  { id: 'cafe', label: 'Order coffee', Icon: Coffee },
  { id: 'greetings', label: 'Meet someone', Icon: UserPlus },
  { id: 'directions', label: 'Ask directions', Icon: MapPin },
  { id: 'shopping', label: 'Go shopping', Icon: ShoppingBag },
  { id: 'restaurant', label: 'At a restaurant', Icon: Utensils },
  { id: 'daily-routine', label: 'Daily routine', Icon: Sun },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export function TalkScreen({
  preferences, progress, userName, userId,
  onStartSession, learningMode, inputMethod,
  onLearningModeChange, onInputMethodChange, onNavigateToLearn,
}: TalkScreenProps) {
  const { user } = useAuth()

  const lang = getLanguageMeta(preferences.targetLanguage)
  const minutes = progress?.totalMinutes ?? 0
  const sessions = progress?.totalSessions ?? 0
  const hasStats = sessions > 0 || minutes > 0

  return (
    <div className="relative flex-1 flex flex-col">
      <Starfield className="z-0" density={80} />

      <div className="relative z-10 max-w-lg mx-auto w-full px-5 sm:px-8 pt-5 pb-28 flex-1 flex flex-col overflow-y-auto overflow-x-hidden gap-4 custom-scrollbar">

        {/* ── Header ── */}
        <motion.div custom={0} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <p className="font-display text-2xl sm:text-3xl font-semibold text-foreground leading-tight">
            {greetingByTime()}{userName ? `, ${userName}` : ''}
          </p>
          <p className="text-sm text-foreground/50 mt-1">
            {hasStats ? (
              <>
                <span className="text-foreground/70 font-medium">{sessions}</span> sessions
                <span className="text-foreground/20 mx-1.5">·</span>
                <span className="text-foreground/70 font-medium">{formatShort(minutes)}</span> speaking
                <span className="text-foreground/20 mx-1.5">·</span>
              </>
            ) : null}
            Learning <span className="font-medium text-primary/80">{lang.native}</span>
          </p>
        </motion.div>

        {/* ── Learning Mode Selector ── */}
        <motion.div custom={1} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <div className="flex gap-2.5">
            <LearningModeCard
              active={learningMode === 'free'}
              onClick={() => onLearningModeChange('free')}
              icon={<MessageSquare className="w-4.5 h-4.5" />}
              title="Free Talk"
              subtitle="Just chat naturally"
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
              accentClass="from-secondary/20 to-secondary/5 border-secondary/30"
              activeAccent="from-secondary/30 to-secondary/10 border-secondary/50 shadow-secondary/15"
              iconColor="text-secondary"
            />
          </div>
        </motion.div>

        {/* ── Input Method Toggle ── */}
        <motion.div custom={2} variants={stagger} initial="hidden" animate="show" className="flex-shrink-0">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-foreground/40 uppercase tracking-widest">How do you want to talk?</span>
          </div>
          <div className="mt-2 flex gap-2">
            <InputMethodPill
              active={inputMethod === 'voice'}
              onClick={() => onInputMethodChange('voice')}
              icon={<Mic className="w-4 h-4" />}
              label="Voice"
              description="Speak naturally"
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
            <span className="text-[11px] font-semibold text-foreground/40 uppercase tracking-widest">Pick a topic</span>
            <button
              onClick={onNavigateToLearn}
              className="text-[11px] font-semibold text-primary/60 hover:text-primary/90 transition-colors flex items-center gap-0.5"
            >
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 flex-1 content-start">
            {QUICK_TOPICS.map(({ id, label, Icon }) => (
              <TopicCard
                key={id}
                icon={<Icon className="w-4 h-4" />}
                label={label}
                onClick={() => onStartSession(id, 'new')}
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
              'group relative w-full py-4 rounded-2xl font-semibold text-[15px] text-center transition-all duration-300 active:scale-[0.97] overflow-hidden',
              inputMethod === 'voice'
                ? 'bg-gradient-to-r from-primary via-primary to-primary-glow text-primary-foreground shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40'
                : 'bg-gradient-to-r from-foreground/90 to-foreground/80 text-background shadow-xl shadow-foreground/20 hover:shadow-2xl hover:shadow-foreground/30'
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
        'relative flex-1 flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all duration-300 overflow-hidden',
        'bg-gradient-to-br backdrop-blur-sm',
        active ? activeAccent + ' shadow-lg' : accentClass + ' hover:shadow-md',
      )}
    >
      {/* Active indicator */}
      {active && (
        <motion.div
          layoutId="learning-mode-indicator"
          className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-current opacity-80"
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        />
      )}

      <div className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300',
        active ? 'bg-white/15 shadow-inner' : 'bg-white/10',
        iconColor
      )}>
        {icon}
      </div>

      <div className="text-left">
        <p className={cn(
          'text-sm font-bold transition-colors',
          active ? 'text-foreground' : 'text-foreground/70'
        )}>{title}</p>
        <p className={cn(
          'text-[11px] mt-0.5 transition-colors',
          active ? 'text-foreground/60' : 'text-foreground/40'
        )}>{subtitle}</p>
      </div>
    </motion.button>
  )
}

// ─── Input Method Pill ────────────────────────────────────────────────────────

function InputMethodPill({ active, onClick, icon, label, description }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  description: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-250',
        active
          ? 'bg-card border-border/60 shadow-md'
          : 'bg-transparent border-border/30 hover:border-border/50 hover:bg-card/40'
      )}
    >
      {active && (
        <motion.div
          layoutId="input-method-active"
          className="absolute inset-0 rounded-xl ring-1 ring-primary/30 bg-primary/[0.03]"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <span className={cn(
        'relative z-10 transition-colors',
        active ? 'text-foreground' : 'text-foreground/40'
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

function TopicCard({ icon, label, onClick }: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-border/30',
        'bg-card/50 backdrop-blur-sm',
        'hover:bg-card hover:border-border/50 hover:shadow-sm',
        'transition-all duration-200 text-left group'
      )}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary/70 group-hover:text-primary group-hover:bg-primary/15 transition-colors">
        {icon}
      </div>
      <span className="text-xs font-medium text-foreground/70 group-hover:text-foreground/90 transition-colors">{label}</span>
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
        'bg-card/40 backdrop-blur-sm',
        focused
          ? 'border-primary/50 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.15)]'
          : 'border-border/30 hover:border-border/50'
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
