'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Settings, Moon, Sun, Monitor, LogOut, X, Edit2, Check, PhoneOff, Volume2, VolumeX, MoreVertical, GraduationCap, MessageCircle, Phone, Headphones, Radio, Target, Plane, Briefcase, Home as Home2, Theater as Theater2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { TalkingoLogo } from '../ui/TalkingoLogo'
import { AvatarSVG } from '../ui/AvatarSVG'
import { AI_PERSONAS, getPersonaById } from '@talkingo/shared/gemini/personas'
import type { PersonaId } from '@talkingo/shared/types'
import { LANGUAGES } from '@talkingo/shared/languages'
import { loadSettings, saveSettings, type AppSettings } from '@/lib/storage/hybrid-storage'
import { updateUserName } from '@/lib/auth/auth'

function formatCallDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

interface TopControlBarProps {
  isActive?: boolean
  interactionMode?: 'manual' | 'handsfree' | 'native' | 'live'
  onInteractionModeChange?: (mode: 'manual' | 'handsfree' | 'native' | 'live') => void
  currentPersona?: PersonaId
  onPersonaChange?: (persona: PersonaId) => void
  /** Call duration in seconds - shown during active chat */
  callDuration?: number
  /** Callback to end the call */
  onEndCall?: () => void
  /** Auto-play mode for voice notes */
  autoPlayVoiceNotes?: 'always' | 'handsfree-only' | 'never'
  /** Callback when auto-play mode changes */
  onAutoPlayVoiceNotesChange?: (mode: 'always' | 'handsfree-only' | 'never') => void
  /** Whether this is chat mode (shows persona avatar) or home mode (shows logo) */
  isChatMode?: boolean
  /** Active lesson info — shown as indicator during session */
  lessonInfo?: { title: string; currentStep: number; totalSteps: number } | null
  /** Learning preferences — for the Learning section in settings */
  learningPrefs?: {
    targetLanguage?: string
    nativeLanguage?: string
    talkingoLevel?: number
  } | null
  /** Called when user changes a learning preference */
  onLearningPrefsChange?: (changes: {
    targetLanguage?: string
    nativeLanguage?: string
    talkingoLevel?: number
  }) => void
  /** Called when user wants to re-assess their level (triggers conversation test) */
  onReassess?: () => void
  /** Called when user opens settings drawer */
  onOpenSettings?: () => void
}

export function TopControlBar({
  isActive = false,
  interactionMode: propInteractionMode,
  onInteractionModeChange,
  currentPersona = 'eli',
  onPersonaChange,
  callDuration = 0,
  onEndCall,
  autoPlayVoiceNotes: propAutoPlayVoiceNotes,
  onAutoPlayVoiceNotesChange,
  isChatMode = false,
  lessonInfo,
  learningPrefs,
  onLearningPrefsChange,
  onReassess,
  onOpenSettings,
}: TopControlBarProps) {
  const { user, signOut, refresh } = useAuth()

  const [activePanel, setActivePanel] = useState<'settings' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')

  // Settings state - load from storage
  const [micSensitivity, setMicSensitivity] = useState(75)
  const [noiseCancellation, setNoiseCancellation] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto')
  const [language, setLanguage] = useState('english')
  const [autoSaveTranscripts, setAutoSaveTranscripts] = useState(true)
  const [aiCorrections, setAiCorrections] = useState(true)
  const [realTimeTranslation, setRealTimeTranslation] = useState(false)
  const [conversationMode, setConversationMode] = useState<'casual' | 'professional' | 'academic'>('casual')
  const [voiceSpeed, setVoiceSpeed] = useState(1.0)
  const [autoPlayVoiceNotes, setAutoPlayVoiceNotes] = useState<'always' | 'handsfree-only' | 'never'>('handsfree-only')

  // Load settings on mount — scoped to the current user
  useEffect(() => {
    const saved = loadSettings(user?.id)
    if (saved) {
      setMicSensitivity(saved.micSensitivity)
      setNoiseCancellation(saved.noiseCancellation)
      setTheme(saved.theme)
      setLanguage(saved.language)
      setAutoSaveTranscripts(saved.autoSaveTranscripts)
      setAiCorrections(saved.aiCorrections)
      setRealTimeTranslation(saved.realTimeTranslation)
      setConversationMode(saved.conversationMode)
      setVoiceSpeed(saved.voiceSpeed)
      if (saved.autoPlayVoiceNotes) setAutoPlayVoiceNotes(saved.autoPlayVoiceNotes)
    }
  }, [user?.id])

  // Auto-save settings when they change — scoped to the current user
  useEffect(() => {
    const settings: AppSettings = {
      micSensitivity,
      noiseCancellation,
      theme,
      language,
      autoSaveTranscripts,
      aiCorrections,
      realTimeTranslation,
      conversationMode,
      voiceSpeed,
      autoPlayVoiceNotes,
    }
    saveSettings(settings, user?.id)
  }, [micSensitivity, noiseCancellation, theme, language, autoSaveTranscripts, aiCorrections, realTimeTranslation, conversationMode, voiceSpeed, autoPlayVoiceNotes, user?.id])

  // Interaction mode — use prop if provided, otherwise local state
  const [localInteractionMode, setLocalInteractionMode] = useState<'manual' | 'handsfree' | 'native' | 'live'>('manual')
  const interactionMode = propInteractionMode ?? localInteractionMode
  const setInteractionMode = (mode: 'manual' | 'handsfree' | 'native' | 'live') => {
    setLocalInteractionMode(mode)
    onInteractionModeChange?.(mode)
  }

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') {
      root.classList.remove('light', 'dark')
    } else {
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
    }
  }, [theme])

  const isExpanded = activePanel !== null

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) setActivePanel(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isExpanded])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePanel(null)
      }
    }
    if (isExpanded) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isExpanded])

  const handleTogglePanel = (panel: 'settings' | null) => {
    setActivePanel(activePanel === panel ? null : panel)
  }

  // Handle name editing
  const handleStartEditName = () => {
    setEditName(user?.displayName || '')
    setIsEditingName(true)
  }

  const handleCancelEditName = () => {
    setIsEditingName(false)
    setEditName('')
  }

  const handleSaveName = async () => {
    if (!editName.trim() || !user) return
    
    try {
      await updateUserName(editName.trim())
      // Refresh user data from Appwrite to get updated name
      await refresh()
      setIsEditingName(false)
      console.log('[TopControlBar] Name updated successfully:', editName)
    } catch (error) {
      console.error('[TopControlBar] Failed to update name:', error)
      alert('Failed to update name. Please try again.')
    }
  }

  return (
    <div ref={containerRef} className="fixed top-3 left-1/2 -translate-x-1/2 z-50">
      {(isActive || isExpanded) && <div className="control-ambient-glow" />}

      {/* ── Floating pill ── */}
      <div className={cn(
        'voice-control-bar flex items-center rounded-2xl backdrop-blur-xl border transition-all duration-300',
        'px-4 py-2.5 w-[min(340px,calc(100vw-2rem))]',
        isExpanded
          ? 'bg-card/95 border-primary/40 shadow-xl shadow-black/20'
          : 'bg-card/80 border-border/50 hover:border-primary/25 shadow-lg shadow-black/15'
      )}>
        {/* Left */}
        {isChatMode ? (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-border/40 flex-shrink-0">
              <AvatarSVG personaId={currentPersona} size={32} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground leading-tight truncate">
                  {getPersonaById(currentPersona)?.name || 'AI Partner'}
                </span>
                {/* In-session mode badge */}
                {interactionMode && interactionMode !== 'live' && (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border shrink-0',
                    interactionMode === 'manual' && 'bg-primary/10 border-primary/30 text-primary',
                    interactionMode === 'handsfree' && 'bg-foreground/[0.06] border-border text-foreground/70',
                    interactionMode === 'native' && 'bg-primary/10 border-primary/30 text-primary',
                  )}>
                    {interactionMode === 'manual' && <MessageCircle className="w-2.5 h-2.5" />}
                    {interactionMode === 'handsfree' && <Headphones className="w-2.5 h-2.5" />}
                    {interactionMode === 'native' && <Radio className="w-2.5 h-2.5" />}
                    {interactionMode === 'manual' ? 'Chat' : interactionMode === 'handsfree' ? 'Handsfree' : 'Native'}
                  </span>
                )}
              </div>
              {lessonInfo ? (
                <span className="text-[10px] text-primary font-medium flex items-center gap-1 max-w-[140px]">
                  <GraduationCap className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{lessonInfo.title}</span>
                  <span className="flex-shrink-0">· {lessonInfo.currentStep}/{lessonInfo.totalSteps}</span>
                </span>
              ) : callDuration > 0 ? (
                <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums">
                  {formatCallDuration(callDuration)}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <TalkingoLogo size="sm" showText className="h-7" textClassName="text-sm" />
          </div>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isChatMode ? (
            <>
              {onInteractionModeChange && interactionMode !== 'live' && (
                <NavIconBtn
                  active={interactionMode === 'handsfree'}
                  onClick={() => onInteractionModeChange(interactionMode === 'manual' ? 'handsfree' : 'manual')}
                  label={interactionMode === 'handsfree' ? 'Hands-free ON' : 'Manual mode'}
                >
                  {interactionMode === 'handsfree' ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
                      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                    </svg>
                  )}
                </NavIconBtn>
              )}
              {onAutoPlayVoiceNotesChange && (
                <NavIconBtn
                  active={(propAutoPlayVoiceNotes ?? 'handsfree-only') === 'always'}
                  onClick={() => onAutoPlayVoiceNotesChange((propAutoPlayVoiceNotes ?? 'handsfree-only') === 'always' ? 'handsfree-only' : 'always')}
                  label="Auto-play voice"
                >
                  {(propAutoPlayVoiceNotes ?? 'handsfree-only') === 'always'
                    ? <Volume2 className="w-4 h-4" />
                    : <VolumeX className="w-4 h-4" />}
                </NavIconBtn>
              )}
              {onEndCall && (
                <button
                  onClick={onEndCall}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shadow-red-500/25"
                  aria-label="End call"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <>
              <NavIconBtn active={activePanel === 'settings'} onClick={() => { onOpenSettings ? onOpenSettings() : handleTogglePanel('settings') }} label="Settings">
                <Settings className="w-4 h-4" />
              </NavIconBtn>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── NavIconBtn helper ────────────────────────────────────────────────────────

function NavIconBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        'hover:scale-105 active:scale-95',
        active
          ? 'bg-primary/12 border border-primary/40 text-primary shadow-sm'
          : 'bg-card/60 border border-border/50 text-foreground/70 hover:border-primary/40 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
