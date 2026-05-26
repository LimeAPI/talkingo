'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Settings, Bell, Moon, Sun, Monitor, LogOut, MessageSquare, Trash2, Clock, ChevronRight, X, Edit2, Check, X as XIcon, Megaphone, Lightbulb, Trophy, AlertOctagon, Zap, PhoneOff, Volume2, VolumeX, MoreVertical, GraduationCap, MessageCircle, Phone, Target, Plane, Briefcase, Home as Home2, Theater as Theater2, BookOpen } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { TalkingoLogo } from '../ui/TalkingoLogo'
import { AvatarSVG } from '../ui/AvatarSVG'
import { AI_PERSONAS, isPersonaUnlocked, getPersonaById } from '@talkingo/shared/gemini/personas'
import type { PersonaId, DomainScores } from '@talkingo/shared/types'
import { LANGUAGES } from '@talkingo/shared/languages'
import { getConversations, deleteConversation, formatDuration, formatDate, type SavedConversation } from '@/lib/utils/conversation-history'
import { loadSettings, saveSettings, type AppSettings } from '@/lib/storage/hybrid-storage'
import { updateUserName } from '@/lib/auth/auth'

interface AppNotification {
  $id: string
  userId: string
  type: 'announcement' | 'achievement' | 'tip' | 'warning' | 'update'
  title: string
  message: string
  link?: string         // Optional URL for click-through
  imageUrl?: string     // Optional image URL
  read: boolean
  createdAt: number
  targetAll: boolean
}

const NOTIF_TYPE_META: Record<string, { icon: React.ReactNode; color: string }> = {
  announcement: { icon: <Megaphone className="w-3.5 h-3.5" />, color: 'text-blue-400' },
  achievement:  { icon: <Trophy className="w-3.5 h-3.5" />,    color: 'text-yellow-400' },
  tip:          { icon: <Lightbulb className="w-3.5 h-3.5" />, color: 'text-green-400' },
  warning:      { icon: <AlertOctagon className="w-3.5 h-3.5" />, color: 'text-red-400' },
  update:       { icon: <Zap className="w-3.5 h-3.5" />,       color: 'text-purple-400' },
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'Just now'
}

function formatCallDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

interface TopControlBarProps {
  isActive?: boolean
  interactionMode?: 'manual' | 'handsfree' | 'callonly' | 'live'
  onInteractionModeChange?: (mode: 'manual' | 'handsfree' | 'callonly' | 'live') => void
  currentPersona?: PersonaId
  onPersonaChange?: (persona: PersonaId) => void
  onViewHistory?: () => void
  /** Domain scores used to gate locked personas. */
  domainScores?: DomainScores
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
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  } | null
  /** Called when user changes a learning preference */
  onLearningPrefsChange?: (changes: {
    targetLanguage?: string
    nativeLanguage?: string
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }) => void
  /** Called when user wants to re-assess their level (triggers conversation test) */
  onReassess?: () => void
  /** Called when user opens phrase bank */
  onOpenPhraseBank?: () => void
  /** Called when user opens settings drawer */
  onOpenSettings?: () => void
  /** Called when user opens history drawer */
  onOpenHistory?: () => void
}

export function TopControlBar({
  isActive = false,
  interactionMode: propInteractionMode,
  onInteractionModeChange,
  currentPersona = 'eli',
  onPersonaChange,
  domainScores,
  callDuration = 0,
  onEndCall,
  autoPlayVoiceNotes: propAutoPlayVoiceNotes,
  onAutoPlayVoiceNotesChange,
  isChatMode = false,
  lessonInfo,
  learningPrefs,
  onLearningPrefsChange,
  onReassess,
  onOpenPhraseBank,
  onOpenSettings,
  onOpenHistory,
}: TopControlBarProps) {
  const { user, signOut, refresh } = useAuth()

  const [activePanel, setActivePanel] = useState<'settings' | 'notifications' | 'history' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [conversations, setConversations] = useState<SavedConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<SavedConversation | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')

  // Notification state
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

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
  const [localInteractionMode, setLocalInteractionMode] = useState<'manual' | 'handsfree' | 'callonly' | 'live'>('manual')
  const interactionMode = propInteractionMode ?? localInteractionMode
  const setInteractionMode = (mode: 'manual' | 'handsfree' | 'callonly' | 'live') => {
    setLocalInteractionMode(mode)
    onInteractionModeChange?.(mode)
  }

  // Refresh conversations when history panel opens
  useEffect(() => {
    if (activePanel === 'history') {
      setConversations(getConversations(user?.id ?? null))
    }
  }, [activePanel, user?.id])

  // Fetch notifications - ONE TIME on mount, then only on manual refresh
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    
    setNotifLoading(true)
    try {
      const res = await fetch(`/api/notifications?userId=${user.id}`)
      if (!res.ok) return
      const json = await res.json()
      const allNotifs: AppNotification[] = json.notifications ?? []
      
      // Get list of already-seen notification IDs
      const seenIds = JSON.parse(localStorage.getItem('talkingo_seen_notifs') || '[]')
      
      // Filter out already-seen notifications
      const newNotifs = allNotifs.filter(n => !seenIds.includes(n.$id))
      
      // Update state with only new notifications
      setNotifications(newNotifs)
      const unread = newNotifs.filter(n => !n.read).length
      setUnreadCount(unread)
      
      // Mark all fetched notifications as "seen" (won't fetch again)
      const updatedSeen = [...seenIds, ...allNotifs.map(n => n.$id)]
      localStorage.setItem('talkingo_seen_notifs', JSON.stringify([...new Set(updatedSeen)]))
      
      // Cache for quick access
      try {
        localStorage.setItem('talkingo_notifications_cache', JSON.stringify({
          notifications: newNotifs,
          unreadCount: unread
        }))
        localStorage.setItem('talkingo_notifications_time', Date.now().toString())
      } catch {
        // Ignore quota errors
      }
    } catch {
      // silently fail — notifications are non-critical
    } finally {
      setNotifLoading(false)
    }
  }, [user?.id])

  // Fetch once on mount, NO continuous polling
  useEffect(() => {
    if (!user?.id) return
    fetchNotifications()
    // No interval - fetch only on mount and when panel opens
  }, [user?.id, fetchNotifications])

  const markAsRead = async (notifId: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notifId }),
      })
      setNotifications(prev => prev.map(n => n.$id === notifId ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // silently fail
    }
  }

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read)
    await Promise.all(unread.map(n => markAsRead(n.$id)))
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

  const handleTogglePanel = (panel: 'settings' | 'notifications' | 'history' | null) => {
    setActivePanel(activePanel === panel ? null : panel)
    if (panel === 'history') {
      setSelectedConversation(null)
    }
  }

  // Handle name editing
  const handleStartEditName = () => {
    setEditName(user?.name || '')
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

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteConversation(id, user?.id ?? null)) {
      setConversations(getConversations(user?.id ?? null))
      if (selectedConversation?.id === id) {
        setSelectedConversation(null)
      }
    }
  }

  const handleViewConversation = (conv: SavedConversation) => {
    setSelectedConversation(conv)
  }

  const handleBackToList = () => {
    setSelectedConversation(null)
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
              <span className="text-sm font-semibold text-foreground leading-tight truncate">
                {getPersonaById(currentPersona)?.name || 'AI Partner'}
              </span>
              {lessonInfo ? (
                <span className="text-[10px] text-secondary font-medium flex items-center gap-1 max-w-[140px]">
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
              <NavIconBtn active={activePanel === 'history'} onClick={() => { onOpenHistory ? onOpenHistory() : handleTogglePanel('history') }} label="History">
                <MessageSquare className="w-4 h-4" />
              </NavIconBtn>
              {onOpenPhraseBank && (
                <NavIconBtn active={false} onClick={onOpenPhraseBank} label="Phrase bank">
                  <BookOpen className="w-4 h-4" />
                </NavIconBtn>
              )}
              <NavIconBtn active={activePanel === 'settings'} onClick={() => { onOpenSettings ? onOpenSettings() : handleTogglePanel('settings') }} label="Settings">
                <Settings className="w-4 h-4" />
              </NavIconBtn>
              <div className="relative">
                <NavIconBtn
                  active={activePanel === 'notifications'}
                  onClick={() => handleTogglePanel('notifications')}
                  label={unreadCount > 0 ? `${unreadCount} unread` : 'Notifications'}
                >
                  <Bell className="w-4 h-4" />
                </NavIconBtn>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-primary to-secondary text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Notifications dropdown ── */}
      {activePanel === 'notifications' && (
        <div className="notif-dropdown animate-slide-down mt-1">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 flex-shrink-0">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-3">
              <button onClick={() => fetchNotifications()} className="text-[10px] text-primary hover:text-primary/80 font-medium">Refresh</button>
              {unreadCount > 0 && <button onClick={markAllAsRead} className="text-[10px] text-primary hover:text-primary/80 font-medium">Mark all read</button>}
            </div>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {notifLoading ? (
              <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-muted/20 animate-pulse" />)}</div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <Bell className="w-8 h-8 text-muted-foreground/25 mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {notifications.map((n) => {
                  const meta = NOTIF_TYPE_META[n.type] ?? NOTIF_TYPE_META.announcement
                  return (
                    <div key={n.$id} onClick={() => !n.read && markAsRead(n.$id)}
                      className={cn('flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-all',
                        n.read ? 'opacity-60 hover:opacity-80' : 'bg-primary/5 hover:bg-primary/8'
                      )}>
                      <div className={cn('mt-0.5 flex-shrink-0', meta.color)}>{meta.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-xs font-semibold text-foreground truncate">{n.title}</p>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
          ? 'bg-gradient-to-br from-primary/20 to-secondary/15 border border-primary/40 text-primary shadow-sm'
          : 'bg-card/60 border border-border/50 text-foreground/70 hover:border-primary/40 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
