'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { TranscriptMessage } from './TranscriptMessage'
import { WelcomeModal } from '../dialogs/WelcomeModal'
import { ConversationControl } from './ConversationControl'
import { ChatComposer } from './ChatComposer'
import { HandsfreeBar } from './HandsfreeBar'
import { TopControlBar } from './TopControlBar'
import { ServiceErrorBanner, type ServiceErrorType } from '../feedback/ServiceErrorBanner'
import { EndCallDialog } from '../dialogs/EndCallDialog'
import { HomeShell } from '../layout/HomeShell'
import { SettingsDrawer } from '../layout/SettingsDrawer'
import { HistoryDrawer } from '../layout/HistoryDrawer'
import { SessionRecapDialog } from '../dialogs/SessionRecapDialog'
import { NativeRewriteDialog } from '../dialogs/NativeRewriteDialog'
import { PhraseBankDialog } from '../dialogs/PhraseBankDialog'
import { MicErrorToast } from '../feedback/MicErrorToast'
import { geminiClient, GeminiServiceError, type MicErrorKind } from '@/lib/api/gemini-client'
import { AudioRecorder } from '@/lib/api/audio-recorder'
import { Paywall } from '../paywall/Paywall'
import { SubscriptionExpired } from '../paywall/SubscriptionExpired'
import { UpgradePrompt, type UpgradeReason } from '../paywall/UpgradePrompt'
import { FreeUsageBadge } from '../paywall/FreeUsageBadge'
import { isSubscribed, saveSubscriptionInfo, verifySubscription, needsServerVerification, syncFromAccountPrefs, isExpired, isPastDue, getSubscriptionInfo } from '@/lib/subscription/use-subscription'
import { FREE_TIER, getDailyUsage, incrementMessageCount, getRemainingMessages, hasReachedDailyLimit, isPersonaAllowed, isModeAllowed, isLevelAllowed } from '@/lib/subscription/free-tier'
import { LiveCallView } from './LiveCallView'
import {
  saveConversation as saveConvHybrid,
  loadPreferences,
  savePreferences,
  loadProgress,
  saveProgress,
  isOnboarded,
  getConversations as getConvHybrid,
  loadSettings,
} from '@/lib/storage/hybrid-storage'
import { shouldSkipOnboarding } from '@/lib/utils/onboarding-check'
import {
  loadCharacterMemory,
  saveCharacterMemory,
  emptyCharacterMemory,
  mergeMemoryUpdate,
  pickFactsToReference,
} from '@/lib/storage/character-memory'
import { addPhrasesFromSession } from '@/lib/storage/phrase-bank'
import { saveSessionRecap } from '@/lib/storage/session-recaps'
import { cefrToLanguageLevel, validateCefrLevelConsistency } from '@talkingo/shared/utils'

import {
  buildUpdatedProgress,
  getReviewWords,
  getMasteredWords,
  shouldReassess,
} from '@/lib/models/learner-model'
import {
  detectTeachingIntent,
  matchLessonTemplate,
  activateLesson,
  resumeLesson,
  advanceToNextStep,
  completeLesson,
  abandonLesson,
  detectStepAdvanceFromAI,
  detectUserSkip,
  detectUserStopLesson,
} from '@/lib/models/lesson-manager'
import { saveSessionAnalytics } from '@/lib/storage/appwrite-storage'
import { saveChatSession } from '@/lib/storage/chat-history'
import type {
  ConversationMessage,
  ConversationState,
  UserPreferences,
  PersonaId,
  Correction,
  VocabItem,
  SessionRecap,
  LanguageProgress,
  TargetLanguage,
  SkillDomain,
} from '@talkingo/shared/types'
import { DEFAULT_DOMAIN_SCORES } from '@talkingo/shared/types'
import type { SavedConversation } from '@/lib/utils/conversation-history'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import { getSeedById, pickNextSeed, getStartingSeedForLevel } from '@talkingo/shared/curriculum'
import { useAuth } from '@/context/AuthContext'

// ─── Ambient vocabulary injection helpers (Feature 2) ────────────────────────

/**
 * 1-in-3 chance to plant a phrase from the seed's targetVocab. Beginners
 * (A1) skip this entirely — they need explicit vocab, not noticing tasks.
 */
function pickPlantedPhrase(
  seedTargetVocab: string[],
  cefr: string | undefined
): { term: string; gloss: string; targetUses: number } | null {
  if (!seedTargetVocab || seedTargetVocab.length === 0) return null
  if (cefr === 'A1') return null
  if (Math.random() > 0.34) return null
  const pick = seedTargetVocab[Math.floor(Math.random() * seedTargetVocab.length)]
  return {
    term: pick,
    gloss: pick, // gloss is informational only — the AI fills in real meaning
    targetUses: 3,
  }
}

type View = 'loading' | 'welcome' | 'home' | 'in-call'

export function ConversationPage() {
  const { user, loading: authLoading, refresh: refreshAuth } = useAuth()

  // ── Top-level view ───────────────────────────────────────────────────────
  const [view, setView] = useState<View>('loading')
  const [forceWelcome, setForceWelcome] = useState(false) // re-onboarding from home

  // ── Conversation state ──────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [interimTranscript, setInterimTranscript] = useState('')
  const [conversationState, setConversationState] = useState<ConversationState>({
    level: 'intermediate',
    topic: 'general',
    correctionStyle: 'silent',
    flowScore: 3,
    persona: 'eli',
    targetLanguage: 'en',
  })
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [progress, setProgress] = useState<LanguageProgress | null>(null)
  // Domain score accumulators (not persisted — reset each app load, that's fine)
  const [domainAccumulators, setDomainAccumulators] = useState<Partial<Record<SkillDomain, number>>>({})
  const [conversationMode, setConversationMode] = useState<'manual' | 'handsfree' | 'callonly' | 'live'>('manual')

  // Gated mode change — free users can only use 'manual' (chat)
  const handleModeChange = useCallback((mode: 'manual' | 'handsfree' | 'callonly' | 'live') => {
    if (!isSubscribed(user?.id) && !isModeAllowed(mode)) {
      setUpgradeReason('mode')
      return
    }
    setConversationMode(mode)
  }, [user?.id])

  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [serviceError, setServiceError] = useState<ServiceErrorType | null>(null)
  const [showEndCallDialog, setShowEndCallDialog] = useState(false)
  const [callDuration, setCallDuration] = useState(0)

  // Session-only collected data for recap
  const [sessionCorrections, setSessionCorrections] = useState<Correction[]>([])
  const [sessionVocab, setSessionVocab] = useState<VocabItem[]>([])
  /** Rolling correction count for last 5 AI turns — used for adaptive hint injection */
  const recentCorrectionCountsRef = useRef<number[]>([]) // last 5 turn correction counts
  /** Phrase planted ambiently for THIS session, surfaced at recap time */
  const sessionPlantedPhraseRef = useRef<{ term: string; gloss: string; targetUses: number } | null>(null)

  // Recap dialog state
  const [recap, setRecap] = useState<SessionRecap | null>(null)
  const [recapLoading, setRecapLoading] = useState(false)
  const [recapOpen, setRecapOpen] = useState(false)

  // Mic error toast
  const [micError, setMicError] = useState<{ kind: MicErrorKind; detail?: string } | null>(null)

  // Native rewrite dialog ("Say it like a native")
  const [rewriteDialog, setRewriteDialog] = useState<{ phrase: string; context?: string } | null>(null)

  // Phrase bank dialog
  const [phraseBankOpen, setPhraseBankOpen] = useState(false)

  // Subscription / paywall
  const [showedPaywall, setShowedPaywall] = useState(false)
  const [isSubscribedCheck, setIsSubscribedCheck] = useState(() => isSubscribed(user?.id))

  // Upgrade prompt (shown when free users hit a limit)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null)
  const [remainingMessages, setRemainingMessages] = useState(() => getRemainingMessages(user?.id))

  // Check for successful payment return from Stripe
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('subscription') === 'success') {
      // Payment completed — mark as subscribed immediately
      saveSubscriptionInfo({ status: 'trialing', plan: 'monthly' }, user?.id)
      setIsSubscribedCheck(true)
      setShowedPaywall(true)

      // Fetch session to get customer ID (for "Manage" button)
      const sessionId = params.get('session_id')
      if (sessionId) {
        fetch('/api/stripe/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).then(r => r.json()).then(data => {
          if (data.customerId) {
            saveSubscriptionInfo({
              status: 'trialing',
              plan: data.plan || 'monthly',
              customerId: data.customerId,
            }, user?.id)
          }
        }).catch(() => {})
      }

      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [user?.id])

  // Verify subscription with server periodically (catches cancellations)
  useEffect(() => {
    if (!user?.id) return
    if (!isSubscribedCheck) return
    if (!needsServerVerification(user.id)) return

    verifySubscription(user.id).then(info => {
      const stillActive = info.status === 'active' || info.status === 'trialing'
      setIsSubscribedCheck(stillActive)
    })
  }, [user?.id, isSubscribedCheck])

  // Sync subscription state from Appwrite Account Prefs on login (cross-device)
  useEffect(() => {
    if (!user?.id || !user?.accountPrefs) return
    const prefs = user.accountPrefs
    if (prefs.stripeCustomerId) {
      const synced = syncFromAccountPrefs(prefs, user.id)
      const active = synced.status === 'active' || synced.status === 'trialing'
      setIsSubscribedCheck(active)
    }
  }, [user?.id, user?.accountPrefs])

  // Settings & history drawers
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Settings state (lifted from TopControlBar so SettingsDrawer can use them)
  const [settingsMicSensitivity, setSettingsMicSensitivity] = useState(75)
  const [settingsNoiseCancellation, setSettingsNoiseCancellation] = useState(true)
  const [settingsTheme, setSettingsTheme] = useState<'light' | 'dark' | 'auto'>('auto')
  const [settingsAutoSave, setSettingsAutoSave] = useState(true)
  const [settingsAiCorrections, setSettingsAiCorrections] = useState(true)
  const [settingsVoiceSpeed, setSettingsVoiceSpeed] = useState(1.0)

  // Apply theme when it changes
  const applyTheme = (t: 'light' | 'dark' | 'auto') => {
    setSettingsTheme(t)
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    if (t !== 'auto') root.classList.add(t)
  }

  const pendingRetryRef = useRef<(() => void) | null>(null)
  const warmupOpenerRef = useRef<any>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const stateRef = useRef(conversationState)
  const conversationModeRef = useRef(conversationMode)
  const isMutedRef = useRef(isMuted)
  const isSpeakerMutedRef = useRef(isSpeakerMuted)
  const isSpeakingRef = useRef(isSpeaking)
  const isProcessingRef = useRef(false)
  const viewRef = useRef<View>(view)

  useEffect(() => { stateRef.current = conversationState }, [conversationState])
  useEffect(() => { conversationModeRef.current = conversationMode }, [conversationMode])
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { isSpeakerMutedRef.current = isSpeakerMuted }, [isSpeakerMuted])
  useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])
  useEffect(() => { viewRef.current = view }, [view])

  // ── Wire mic error callback once ─────────────────────────────────────────
  useEffect(() => {
    geminiClient.setErrorCallback((kind, detail) => {
      setMicError({ kind, detail })
      setIsListening(false)
    })
    return () => geminiClient.setErrorCallback(null)
  }, [])

  // ── Initial load: pick view based on saved prefs ─────────────────────────
  useEffect(() => {
    // Wait for auth to fully resolve before touching Appwrite.
    // Without this gate, the effect fires with user=null on first render,
    // skips Appwrite entirely, finds no localStorage on a new device, and
    // incorrectly shows the onboarding screen before the real user is known.
    if (authLoading) return

    let cancelled = false
    ;(async () => {
      // Pass account prefs as the bulletproof primary source. They were already
      // loaded by AuthContext via account.get() — zero extra round trips, and
      // they're guaranteed readable by the owning user. This is what fixes the
      // "re-onboarding on every new device" issue.
      const prefs = await loadPreferences(
        user?.id ?? null,
        !!user,
        user?.accountPrefs ?? null,
      )
      if (cancelled) return

      // Debug logging for troubleshooting
      console.log('[ConversationPage] Load preferences:', {
        hasPrefs: !!prefs,
        targetLanguage: prefs?.targetLanguage,
        level: prefs?.level,
        cefr: prefs?.cefr,
        learningGoal: prefs?.learningGoal,
        onboardingComplete: prefs?.onboardingComplete,
        userId: user?.id,
        hasAccountPrefs: !!user?.accountPrefs?.onboardingComplete,
      })

      // Use unified onboarding check (server-first logic)
      const onboarded = shouldSkipOnboarding(prefs, user?.id)

      console.log('[ConversationPage] Onboarding check result:', {
        onboarded,
        reason: prefs?.onboardingComplete === true 
          ? 'server_flag' 
          : (prefs?.targetLanguage && prefs?.level && prefs?.learningGoal)
            ? 'essential_data'
            : 'not_onboarded',
      })

      if (prefs && onboarded) {
        // Validate CEFR/LanguageLevel consistency and fix if needed
        if (prefs.cefr && prefs.level && !validateCefrLevelConsistency(prefs.cefr as any, prefs.level)) {
          console.warn('[ConversationPage] Fixing inconsistent CEFR/Level:', {
            cefr: prefs.cefr,
            level: prefs.level,
            expectedLevel: cefrToLanguageLevel(prefs.cefr as any),
          })
          // Fix the inconsistency by updating level to match CEFR
          prefs.level = cefrToLanguageLevel(prefs.cefr as any)
          // Also update domain scores for consistency
          prefs.domainScores = {
            vocabulary: prefs.cefr as any,
            grammar: prefs.cefr as any,
            fluency: prefs.cefr as any,
            listening: prefs.cefr as any,
          }
          // Save the corrected preferences
          await savePreferences(user?.id ?? null, prefs, !!user)
        }

        setPreferences(prefs)
        const newState: ConversationState = stateFromPrefs(prefs, user?.name)
        setConversationState(newState)
        stateRef.current = newState
        geminiClient.setLanguage(prefs.targetLanguage)

        // Load progress for this language (best-effort)
        if (prefs.targetLanguage) {
          const p = await loadProgress(user?.id ?? null, !!user, prefs.targetLanguage)
          if (!cancelled) setProgress(p)
        }
        setView('home')

        // ── Warmup: pre-fetch opener in background so "Free Talk" feels instant ──
        if (!cancelled) {
          const warmupState = stateFromPrefs(prefs, user?.name)
          geminiClient.generateOpener(warmupState, user?.name)
            .then((res) => { if (!cancelled) warmupOpenerRef.current = res })
            .catch(() => {}) // silent — warmup is best-effort
        }
      } else {
        console.log('[ConversationPage] Showing welcome screen')
        setView('welcome')
      }
    })()
    return () => { cancelled = true }
  }, [user, authLoading])

  // Call duration timer
  useEffect(() => {
    if (view === 'in-call' && messages.length > 0) {
      const interval = setInterval(() => setCallDuration((d) => d + 1), 1000)
      return () => clearInterval(interval)
    }
  }, [view, messages.length])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages, interimTranscript])

  // ── Mic control (voice recording → send audio directly to Gemini) ────────
  const recorderRef = useRef<AudioRecorder | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const stopMicAndSendRef = useRef<() => void>(() => {})
  const noSpeechCountRef = useRef(0) // Track consecutive no-speech cycles

  const startMic = useCallback(async () => {
    if (isMutedRef.current) return

    // ── Free tier: check daily message limit before recording ─────────────
    if (!isSubscribed(user?.id) && hasReachedDailyLimit(user?.id)) {
      setUpgradeReason('messages')
      return
    }

    setIsListening(true)
    setRecordingDuration(0)

    // Create fresh recorder each time (ensures callbacks are current)
    recorderRef.current = new AudioRecorder({
      onStateChange: (state) => {
        if (state === 'recording') {
          noSpeechCountRef.current = 0
        }
      },
      onDurationUpdate: (s) => setRecordingDuration(s),
      onSilenceDetected: () => {
        if (conversationModeRef.current === 'handsfree') {
          stopMicAndSendRef.current()
        }
      },
      onNoSpeech: () => {
        setIsListening(false)
        setRecordingDuration(0)
        noSpeechCountRef.current++

        if (conversationModeRef.current === 'handsfree' && !isMutedRef.current) {
          if (noSpeechCountRef.current >= 3) {
            console.log('[Mic] 30s inactivity — pausing handsfree')
            setIsMuted(true)
            isMutedRef.current = true
            noSpeechCountRef.current = 0
          } else {
            setTimeout(() => startMic(), 1000)
          }
        }
      },
    })
    await recorderRef.current.start()
  }, [])

  const stopMic = useCallback(() => {
    setIsListening(false)
    setRecordingDuration(0)
    if (recorderRef.current && recorderRef.current.currentState !== 'idle') {
      recorderRef.current.cancel()
    }
  }, [])

  /** Stop recording and send audio to Gemini for transcription + response */
  const stopMicAndSend = useCallback(async () => {
    setIsListening(false)
    if (!recorderRef.current || (recorderRef.current.currentState !== 'recording' && recorderRef.current.currentState !== 'listening')) return

    try {
      const recording = await recorderRef.current.stop()
      setRecordingDuration(0)
      if (recording.durationSeconds < 2) return // Too short — likely just silence/noise

      // ── Free tier: check daily message limit for voice messages ─────────
      if (!isSubscribed(user?.id)) {
        if (hasReachedDailyLimit(user?.id)) {
          setUpgradeReason('messages')
          return
        }
        const updated = incrementMessageCount(user?.id)
        setRemainingMessages(FREE_TIER.DAILY_MESSAGES - updated.messageCount)
      }

      // Show voice bubble immediately — user sees their recording instantly
      const userMsgId = Date.now().toString()
      setMessages((prev) => [...prev, {
        id: userMsgId,
        text: '',
        isUser: true,
        timestamp: Date.now(),
        audio: {
          status: 'ready' as const,
          data: recording.audioBase64,
          format: 'mp3' as const, // Signal to decoder: don't wrap in WAV, decode directly
          durationMs: recording.durationSeconds * 1000,
        },
      }])

      // Send audio to Gemini in background
      setIsProcessing(true)
      isProcessingRef.current = true

      const result = await geminiClient.processAudioMessage(
        recording.audioBase64,
        recording.mimeType,
        stateRef.current,
        stateRef.current.userName
      )

      // If Gemini detected no speech (noise, cough, drinking, etc.) — discard silently
      if ((result as any).noSpeech) {
        setMessages((prev) => prev.filter(m => m.id !== userMsgId))
        setIsProcessing(false)
        isProcessingRef.current = false
        noSpeechCountRef.current++
        // Restart mic in handsfree (or pause if too many no-speech cycles)
        if (conversationModeRef.current === 'handsfree' && !isMutedRef.current) {
          if (noSpeechCountRef.current >= 3) {
            console.log('[Mic] 30s inactivity (noSpeech from API) — pausing')
            setIsMuted(true)
            isMutedRef.current = true
            noSpeechCountRef.current = 0
          } else {
            setTimeout(() => startMic(), 500)
          }
        }
        return
      }

      // Valid speech — reset inactivity counter
      noSpeechCountRef.current = 0

      // Update user bubble with transcription text (appears under voice bubble)
      if (result.transcription) {
        setMessages((prev) => prev.map(m =>
          m.id === userMsgId
            ? { ...m, text: result.transcription!, corrections: result.corrections.length > 0 ? result.corrections : undefined }
            : m
        ))
      }

      // Add AI response
      const aiMsgId = (Date.now() + 1).toString()
      setMessages((prev) => [...prev, {
        id: aiMsgId,
        text: result.aiResponse,
        isUser: false,
        vocab: result.vocab?.length ? result.vocab : undefined,
        teachingNote: result.teachingNote || undefined,
        timestamp: Date.now(),
        audio: voiceNotesEnabledRef.current ? { status: 'loading' as const } : undefined,
      }])

      if (result.corrections.length > 0) setSessionCorrections((prev) => [...prev, ...result.corrections])
      if (result.vocab?.length) setSessionVocab((prev) => [...prev, ...result.vocab!])

      setIsProcessing(false)
      isProcessingRef.current = false
      setServiceError(null)

      // TTS
      if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
        if (voiceNotesEnabledRef.current) {
          const persona = getPersonaById(stateRef.current.persona || 'eli')
          requestAudioForMessageRef.current?.(aiMsgId, result.aiResponse, persona?.voiceName)
        } else if (conversationModeRef.current === 'handsfree' && !isMutedRef.current) {
          // Voice notes off but handsfree — restart mic immediately
          setTimeout(() => startMic(), 300)
        }
      } else {
        speakAndResumeRef.current?.(result.aiResponse)
      }
    } catch (err) {
      // "no_speech" means the recording was silence — just ignore it silently
      if ((err as Error)?.message === 'no_speech') {
        setRecordingDuration(0)
        return
      }
      console.error('[stopMicAndSend] Error:', err)
      setIsProcessing(false)
      isProcessingRef.current = false
      setRecordingDuration(0)
      const errorType = err instanceof GeminiServiceError ? err.type : 'ai_unavailable'
      setServiceError(errorType)
    }
  }, [])
  useEffect(() => { stopMicAndSendRef.current = stopMicAndSend }, [stopMicAndSend])

  // ── Speak then optionally resume mic ─────────────────────────────────────
  // Used by:
  //   - call-only mode (voice-only, no transcript)
  //   - hands-free with the OLD inline speak (kept for the historical resume-mic flow)
  // In CHAT MODES (manual + handsfree with transcript) we now attach voice notes
  // to messages instead of blocking on TTS — see `requestAudioForMessage` below.
  const speakAndResume = useCallback((text: string) => {
    if (viewRef.current !== 'in-call') return
    // Live mode handles its own audio — skip TTS
    if (conversationModeRef.current === 'live') return
    // Chat modes use voice-note attachment, not blocking TTS
    if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
      // Resume mic for hands-free without waiting for TTS — voice note plays
      // independently and the player's onEnded triggers mic resume.
      return
    }

    const persona = getPersonaById(conversationState.persona || 'eli')
    const voiceName = persona?.voiceName

    if (isSpeakerMutedRef.current) {
      setIsSpeaking(true)
      const estimatedMs = Math.min(text.length * 50, 5000)
      setTimeout(() => {
        setIsSpeaking(false)
        if ((conversationModeRef.current === 'handsfree' || conversationModeRef.current === 'callonly') && !isMutedRef.current) {
          setTimeout(() => startMic(), 300)
        }
      }, estimatedMs)
      return
    }

    setIsSpeaking(true)
    geminiClient.speak(text, {
      voiceName,
      targetLanguage: conversationState.targetLanguage,
      onEnd: () => {
        setIsSpeaking(false)
        if ((conversationModeRef.current === 'handsfree' || conversationModeRef.current === 'callonly') && !isMutedRef.current) {
          setTimeout(() => startMic(), 300)
        }
      },
    })
  }, [startMic, conversationState.persona, conversationState.targetLanguage])

  // ── Voice note: attach audio to a message asynchronously ────────────────
  // Inflight TTS aborts so we don't waste quota when sessions reset.
  const ttsAbortersRef = useRef<Map<string, AbortController>>(new Map())

  const requestAudioForMessage = useCallback(async (
    messageId: string,
    text: string,
    voiceName?: string
  ) => {
    if (!text.trim()) return
    // Abort any inflight TTS for this same message id
    ttsAbortersRef.current.get(messageId)?.abort()
    const controller = new AbortController()
    ttsAbortersRef.current.set(messageId, controller)

    // Mark as loading
    setMessages((prev) => prev.map((m) =>
      m.id === messageId
        ? { ...m, audio: { status: 'loading', voiceName } }
        : m
    ))

    try {
      const result = await geminiClient.synthesizeAudio(text, {
        voiceName,
        targetLanguage: stateRef.current.targetLanguage,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      if (!result) {
        setMessages((prev) => prev.map((m) =>
          m.id === messageId ? { ...m, audio: { status: 'error', voiceName } } : m
        ))
        return
      }

      setMessages((prev) => prev.map((m) =>
        m.id === messageId
          ? { ...m, audio: { status: 'ready', data: result.data, format: (result as any).format || 'pcm', sampleRate: result.sampleRate, voiceName: result.voiceName } }
          : m
      ))
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return
      console.warn('[voice-note] failed:', err)
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, audio: { status: 'error', voiceName } } : m
      ))
    } finally {
      ttsAbortersRef.current.delete(messageId)
    }
  }, [])

  // Refs for late-bound access (used by stopMicAndSend which is declared before these)
  const speakAndResumeRef = useRef<(text: string) => void>(() => {})
  const requestAudioForMessageRef = useRef<(id: string, text: string, voice?: string) => void>(() => {})
  useEffect(() => { speakAndResumeRef.current = speakAndResume }, [speakAndResume])
  useEffect(() => { requestAudioForMessageRef.current = requestAudioForMessage }, [requestAudioForMessage])

  // ── Voice notes enabled toggle (user can flip in composer) ─────────────
  // Ref-mirrored so the latest value is read inside callbacks without re-creating them
  const [voiceNotesEnabled, setVoiceNotesEnabled] = useState(true)
  const voiceNotesEnabledRef = useRef(voiceNotesEnabled)
  useEffect(() => { voiceNotesEnabledRef.current = voiceNotesEnabled }, [voiceNotesEnabled])
  
  // Auto-play mode for voice notes: 'always' | 'handsfree-only' | 'never'
  // Initial value uses anon key — will be corrected once auth resolves (see effect below)
  const [autoPlayMode, setAutoPlayMode] = useState<'always' | 'handsfree-only' | 'never'>(
    () => (typeof window !== 'undefined' ? loadSettings(null)?.autoPlayVoiceNotes ?? 'handsfree-only' : 'handsfree-only')
  )
  const autoPlayModeRef = useRef(autoPlayMode)
  useEffect(() => { autoPlayModeRef.current = autoPlayMode }, [autoPlayMode])

  // Re-read settings once the real user is known (fixes the anon→user transition)
  useEffect(() => {
    if (authLoading) return
    const settings = loadSettings(user?.id ?? null)
    if (settings?.autoPlayVoiceNotes) {
      setAutoPlayMode(settings.autoPlayVoiceNotes)
    }
  }, [user?.id, authLoading])
  
  // Listen to settings changes from other tabs/windows
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes('settings')) {
        const settings = loadSettings(user?.id ?? null)
        if (settings?.autoPlayVoiceNotes) {
          setAutoPlayMode(settings.autoPlayVoiceNotes)
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [user?.id])
  
  // Context-aware auto-toggle: adjust voiceNotesEnabled based on conversation mode
  useEffect(() => {
    // Hands-free mode → enable voice notes by default (users expect audio)
    // Manual mode → disable voice notes by default (text-focused, faster)
    // Call-only/Live modes → N/A (handled separately)
    if (conversationMode === 'handsfree' || conversationMode === 'callonly') {
      setVoiceNotesEnabled(true)
    } else if (conversationMode === 'manual') {
      setVoiceNotesEnabled(false)
    }
  }, [conversationMode])

  const shouldAutoPlay = useCallback(() => {
    if (isSpeakerMutedRef.current) return false
    if (autoPlayModeRef.current === 'never') return false
    if (autoPlayModeRef.current === 'always') return true
    return conversationModeRef.current === 'handsfree'
  }, [])

  // ── Core user input handler ──────────────────────────────────────────────
  const handleUserInput = useCallback(async (userText: string) => {
    if (!userText.trim()) return
    if (isProcessingRef.current) return

    // ── Free tier: check daily message limit ─────────────────────────────
    if (!isSubscribed(user?.id)) {
      if (hasReachedDailyLimit(user?.id)) {
        setUpgradeReason('messages')
        return
      }
      // Increment usage count
      const updated = incrementMessageCount(user?.id)
      setRemainingMessages(FREE_TIER.DAILY_MESSAGES - updated.messageCount)
    }

    isProcessingRef.current = true
    setIsProcessing(true)
    setIsListening(false)
    setInterimTranscript('')
    geminiClient.stopListening()

    // ── Lesson path: detect user intent ──────────────────────────────────
    const currentLesson = stateRef.current.lessonPath

    // Check if user wants to stop the lesson
    if (currentLesson && detectUserStopLesson(userText)) {
      const userId = user?.id ?? 'anon'
      const lang = stateRef.current.targetLanguage ?? 'en'
      abandonLesson(userId, lang, currentLesson.lessonId)
      setConversationState((prev) => ({ ...prev, lessonPath: null }))
      stateRef.current = { ...stateRef.current, lessonPath: null }
      // Continue processing the message normally (AI will respond to "let's just chat")
    }

    // Check if user wants to skip current step
    if (currentLesson && detectUserSkip(userText)) {
      const userId = user?.id ?? 'anon'
      const lang = stateRef.current.targetLanguage ?? 'en'
      const cefr = stateRef.current.cefr
      const nextPath = advanceToNextStep(userId, lang, currentLesson, 'Skipped by user.', cefr)
      if (nextPath) {
        setConversationState((prev) => ({ ...prev, lessonPath: nextPath }))
        stateRef.current = { ...stateRef.current, lessonPath: nextPath }
      } else {
        // Lesson complete
        completeLesson(userId, lang, currentLesson.lessonId)
        setConversationState((prev) => ({ ...prev, lessonPath: null }))
        stateRef.current = { ...stateRef.current, lessonPath: null }
      }
    }

    // Detect teaching intent (only when no lesson is active)
    if (!stateRef.current.lessonPath) {
      const topic = detectTeachingIntent(userText)
      if (topic) {
        const lang = stateRef.current.targetLanguage ?? 'en'
        const template = matchLessonTemplate(topic, lang)
        if (template) {
          const userId = user?.id ?? 'anon'
          const cefr = stateRef.current.cefr
          const lessonPath = activateLesson(userId, lang, template, cefr)
          setConversationState((prev) => ({ ...prev, lessonPath }))
          stateRef.current = { ...stateRef.current, lessonPath }
        }
        // If no template matches, the AI handles it ad-hoc (no lessonPath set)
      }
    }

    const userMessageId = Date.now().toString()
    const streamingMsgId = (Date.now() + 1).toString()
    const userMessage: ConversationMessage = {
      id: userMessageId,
      text: userText,
      isUser: true,
      timestamp: Date.now(),
    }
    // Add user message + empty AI placeholder for streaming
    const aiPlaceholder: ConversationMessage = {
      id: streamingMsgId,
      text: '',
      isUser: false,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMessage, aiPlaceholder])

    try {
      // ── Compute errorRate signal for adaptive hint ────────────────────
      // Track corrections per turn (last 5). If rate > 0.6, inject encouragement hint.
      const recentCounts = recentCorrectionCountsRef.current
      const errorRate = recentCounts.length >= 3
        ? recentCounts.slice(-5).reduce((a, b) => a + b, 0) / Math.min(recentCounts.length, 5)
        : 0

      // Inject adaptive hint into state if error rate is high
      const stateForCall = errorRate > 0.6
        ? { ...stateRef.current, _adaptiveHint: 'high-error-rate' as const }
        : stateRef.current

      const result = await geminiClient.processUserMessageStreaming(
        userText,
        stateForCall,
        stateRef.current.userName,
        // Stream callback — update the AI message text progressively
        (partialJson) => {
          // Try to extract the "response" field from partial JSON
          const match = partialJson.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)/)
          if (match) {
            const partialText = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last && !last.isUser && last.id === streamingMsgId) {
                return [...prev.slice(0, -1), { ...last, text: partialText }]
              }
              return prev
            })
          }
        }
      )

      // Attach corrections to the user's message (they describe errors in what the user said)
      if (result.corrections.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMessageId ? { ...m, corrections: result.corrections } : m
          )
        )
      }

      const aiMessage: ConversationMessage = {
        id: streamingMsgId,
        text: result.aiResponse,
        translation: result.translation,
        isUser: false,
        vocab: result.vocab && result.vocab.length > 0 ? result.vocab : undefined,
        emotion: result.emotion,
        teachingNote: result.teachingNote || undefined,
        timestamp: Date.now(),
        audio: (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') 
          && voiceNotesEnabledRef.current 
          && messages.length > 0
          ? { status: 'loading' }
          : undefined,
      }
      // Update the streaming placeholder with final data
      setMessages((prev) => prev.map((m) => m.id === streamingMsgId ? aiMessage : m))
      setConversationState((prev) => ({ ...prev, flowScore: Math.min(prev.flowScore + 0.5, 5) }))

      if (result.corrections.length > 0) setSessionCorrections((prev) => [...prev, ...result.corrections])
      if (result.vocab && result.vocab.length > 0) setSessionVocab((prev) => [...prev, ...(result.vocab ?? [])])

      // Track correction count for this turn (for errorRate signal)
      recentCorrectionCountsRef.current = [
        ...recentCorrectionCountsRef.current.slice(-4),
        result.corrections.length,
      ]

      // ── Lesson path: detect step advancement from AI response ──────────
      const activeLessonPath = stateRef.current.lessonPath
      if (activeLessonPath && detectStepAdvanceFromAI(result.aiResponse)) {
        const userId = user?.id ?? 'anon'
        const lang = stateRef.current.targetLanguage ?? 'en'
        const cefr = stateRef.current.cefr
        const stepSummary = `Step ${activeLessonPath.currentStep} completed.`
        const nextPath = advanceToNextStep(userId, lang, activeLessonPath, stepSummary, cefr)
        if (nextPath) {
          setConversationState((prev) => ({ ...prev, lessonPath: nextPath }))
          stateRef.current = { ...stateRef.current, lessonPath: nextPath }
        } else {
          // Lesson complete!
          completeLesson(userId, lang, activeLessonPath.lessonId)
          setConversationState((prev) => ({ ...prev, lessonPath: null }))
          stateRef.current = { ...stateRef.current, lessonPath: null }
          // Add to completedLessons in progress
          if (progress) {
            const updatedProgress = {
              ...progress,
              completedLessons: [...(progress.completedLessons ?? []), activeLessonPath.lessonId],
            }
            setProgress(updatedProgress)
          }
        }
      }

      // Unit-complete signal — bump to next seed using smart picker
      if (result.unitComplete && !stateRef.current.lessonPath) {
        const domainScores = stateRef.current.domainScores ?? { vocabulary: 'A1', grammar: 'A1', fluency: 'A1', listening: 'A1' }
        const completedIds = progress?.completedUnits ?? []
        const nextSeed = pickNextSeed(domainScores as any, completedIds, stateRef.current.currentUnitId)
        if (nextSeed && nextSeed.id !== stateRef.current.currentUnitId) {
          setConversationState((prev) => ({ ...prev, currentUnitId: nextSeed.id }))
        }
      }

      setIsProcessing(false)
      isProcessingRef.current = false
      setServiceError(null)

      // Chat modes → fire-and-forget voice note. Other modes → blocking speak.
      if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
        if (voiceNotesEnabledRef.current) {
          const persona = getPersonaById(stateRef.current.persona || 'eli')
          requestAudioForMessage(aiMessage.id, result.aiResponse, persona?.voiceName)
        }
      } else {
        speakAndResume(result.aiResponse)
      }
    } catch (err) {
      console.error('[handleUserInput] AI error:', err)
      setIsProcessing(false)
      isProcessingRef.current = false
      // Remove the streaming placeholder on error
      setMessages((prev) => prev.filter((m) => m.id !== streamingMsgId))

      const errorType =
        err instanceof GeminiServiceError ? err.type : !navigator.onLine ? 'network' : 'ai_unavailable'

      setServiceError(errorType)
      pendingRetryRef.current = () => handleUserInputRef.current(userText)
    }
  }, [speakAndResume, requestAudioForMessage, progress, user])

  const handleUserInputRef = useRef(handleUserInput)
  useEffect(() => { handleUserInputRef.current = handleUserInput }, [handleUserInput])

  // Auto-start mic when switching to handsfree / callonly
  useEffect(() => {
    geminiClient.setMode(conversationMode === 'live' ? 'handsfree' : conversationMode)
    if (
      view === 'in-call' &&
      (conversationMode === 'handsfree' || conversationMode === 'callonly') &&
      !isSpeakingRef.current &&
      messages.length > 0
    ) {
      setTimeout(() => { if (!isMutedRef.current) startMic() }, 500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationMode, view])

  // ── Onboarding complete ──────────────────────────────────────────────────
  const handleOnboardingComplete = useCallback(async (prefs: UserPreferences) => {
    const completed: UserPreferences = { ...prefs, onboardingComplete: true }
    // Await the full save (localStorage + account prefs + document) BEFORE
    // transitioning. This guarantees a refresh / new device login won't see
    // a half-saved state.
    await savePreferences(user?.id ?? null, completed, !!user)

    // Refresh auth context so user.accountPrefs reflects the new onboarding
    // state in memory — important if the user navigates away and comes back
    // before the next account.get() naturally fires.
    if (user) {
      try { await refreshAuth() } catch { /* non-critical */ }
    }

    setPreferences(completed)
    geminiClient.setLanguage(completed.targetLanguage)
    setForceWelcome(false)

    if (completed.targetLanguage) {
      const p = await loadProgress(user?.id ?? null, !!user, completed.targetLanguage)
      setProgress(p)
    }

    const newState = stateFromPrefs(completed, user?.name)
    setConversationState(newState)
    stateRef.current = newState

    setView('home')
  }, [user, refreshAuth])

  // ── Start a session from home ────────────────────────────────────────────
  const startSession = useCallback(async (scenarioId: string, mode: 'continue' | 'new' = 'new') => {
    if (!preferences) return

    // ── Free tier: force mode to 'manual' if user isn't subscribed ────────
    if (!isSubscribed(user?.id) && !isModeAllowed(conversationMode)) {
      setConversationMode('manual')
    }

    // Check if this is a custom scenario
    let customScenarioPrompt: string | null = null
    if (scenarioId.startsWith('custom-')) {
      try {
        const stored = sessionStorage.getItem('talkingo_custom_scenario')
        if (stored) {
          const customData = JSON.parse(stored)
          if (customData.id === scenarioId) {
            customScenarioPrompt = customData.prompt
            // Clean up session storage
            sessionStorage.removeItem('talkingo_custom_scenario')
          }
        }
      } catch (e) {
        console.warn('[startSession] Failed to parse custom scenario:', e)
      }
    }

    const domainScores = progress?.domainScores ?? preferences.domainScores ?? DEFAULT_DOMAIN_SCORES
    const reviewWords = progress ? getReviewWords(progress.trackedVocab, progress.totalSessions) : []
    const masteredWords = progress ? getMasteredWords(progress.trackedVocab) : []

    // Pick a planted phrase for ambient injection (Feature 2)
    const seed = scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-') ? getSeedById(scenarioId) : null
    const planted = pickPlantedPhrase(seed?.targetVocab ?? [], progress?.cefr ?? preferences.cefr)
    sessionPlantedPhraseRef.current = planted

    // Load character memory for the chosen persona × language (Feature 4)
    const personaId = preferences.persona ?? 'eli'
    const targetLang = preferences.targetLanguage ?? 'en'
    let memory = null
    try {
      // For 'continue' mode, load from conversation-memory (localStorage)
      if (mode === 'continue' && user?.id) {
        const { loadMemory } = await import('@/lib/storage/conversation-memory')
        const convMemory = loadMemory(user.id, personaId, targetLang)
        if (convMemory) {
          memory = {
            userId: user.id,
            personaId,
            targetLanguage: targetLang,
            summary: convMemory.conversationSummary,
            lastTopics: convMemory.lastTopics,
            facts: convMemory.userFacts.map(fact => ({ fact, sessionNumber: convMemory.totalSessions })),
            sessionsCount: convMemory.totalSessions,
            lastSessionAt: convMemory.lastSessionAt,
          }
        }
      }
      
      // Fallback to character-memory (Appwrite/hybrid) if no localStorage memory
      if (!memory) {
        memory = await loadCharacterMemory(user?.id ?? null, !!user, personaId, targetLang)
      }
    } catch (e) {
      console.warn('[startSession] character memory load failed:', e)
    }

    const newState: ConversationState = {
      ...stateFromPrefs(preferences, user?.name),
      currentUnitId: scenarioId,
      // For custom scenarios, use the prompt as the topic
      topic: customScenarioPrompt || preferences.topic,
      domainScores,
      masteredWords,
      reviewWords,
      weakPatterns: progress?.weakPatterns?.map(p => typeof p === 'string' ? p : (p as any).description || (p as any).category || ''),
      sessionNumber: (progress?.totalSessions ?? 0) + 1,
      plantedPhrase: planted,
      characterMemory: memory && memory.summary
        ? {
            summary: memory.summary,
            lastTopics: memory.lastTopics,
            factsToReference: pickFactsToReference(memory, 3),
          }
        : null,
      // Resume lesson path if this is a lesson session
      lessonPath: scenarioId.startsWith('lesson-')
        ? resumeLesson(user?.id ?? 'anon', preferences.targetLanguage ?? 'en', scenarioId.replace('lesson-', ''), progress?.cefr ?? preferences.cefr)
        : null,
    }
    setConversationState(newState)
    stateRef.current = newState
    geminiClient.setLanguage(newState.targetLanguage)
    geminiClient.resetHistory()

    setMessages([])
    setSessionCorrections([])
    setSessionVocab([])
    setCallDuration(0)
    setInterimTranscript('')
    setIsProcessing(true)
    setView('in-call')

    try {
      // Use pre-fetched warmup opener if available (for free-talk sessions)
      let opener
      if (scenarioId === 'free-talk' && warmupOpenerRef.current) {
        opener = warmupOpenerRef.current
        warmupOpenerRef.current = null
        console.log('[startSession] Using pre-fetched warmup opener')
      } else {
        opener = await geminiClient.generateOpener(newState, user?.name)
      }
      const aiMessage: ConversationMessage = {
        id: Date.now().toString(),
        text: opener.aiResponse,
        translation: opener.translation,
        isUser: false,
        emotion: opener.emotion,
        vocab: opener.vocab && opener.vocab.length > 0 ? opener.vocab : undefined,
        timestamp: Date.now(),
        // First message (opener) is always text-only for instant response
        audio: undefined,
      }
      setMessages([aiMessage])
      if (opener.vocab && opener.vocab.length > 0) setSessionVocab((prev) => [...prev, ...opener.vocab!])
      setIsProcessing(false)
      setServiceError(null)
      if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
        if (voiceNotesEnabledRef.current) {
          const persona = getPersonaById(stateRef.current.persona || 'eli')
          requestAudioForMessage(aiMessage.id, opener.aiResponse, persona?.voiceName)
        }
      } else {
        speakAndResume(opener.aiResponse)
      }
    } catch (err) {
      console.error('[startSession] AI error:', err)
      setIsProcessing(false)
      const errorType =
        err instanceof GeminiServiceError ? err.type : !navigator.onLine ? 'network' : 'ai_unavailable'
      setServiceError(errorType)
      pendingRetryRef.current = () => startSession(scenarioId, mode)
    }
  }, [preferences, progress, user, speakAndResume, requestAudioForMessage])

  // ── Persona change from settings ─────────────────────────────────────────
  const handlePersonaChange = useCallback((personaId: PersonaId) => {
    // ── Free tier: only Eli and Alex allowed ─────────────────────────────
    if (!isSubscribed(user?.id) && !isPersonaAllowed(personaId)) {
      setUpgradeReason('persona')
      return
    }

    geminiClient.stopSpeaking()
    setIsSpeaking(false)
    isSpeakingRef.current = false
    stopMic()

    const updatedPrefs: UserPreferences | null = preferences ? { ...preferences, persona: personaId } : null
    if (updatedPrefs) {
      setPreferences(updatedPrefs)
      savePreferences(user?.id ?? null, updatedPrefs, !!user)
    }

    setConversationState((prev) => ({ ...prev, persona: personaId }))
    if (view === 'in-call') {
      // Restart with same unit, fresh history
      geminiClient.resetHistory()
      setMessages([])
      const unitId = stateRef.current.currentUnitId ?? 'greetings'
      startSession(unitId)
    }
  }, [preferences, user, view, stopMic, startSession])

  // ── Learning preferences change from settings ────────────────────────────
  const handleLearningPrefsChange = useCallback((changes: {
    targetLanguage?: string
    nativeLanguage?: string
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }) => {
    if (!preferences) return

    // If CEFR is changing, recalculate domain scores and language level for consistency
    const updatedPrefs: UserPreferences = { ...preferences }
    const cefrChanged = changes.cefr && changes.cefr !== preferences.cefr
    
    if (cefrChanged) {
      const newCefr = changes.cefr as any
      // Recalculate LanguageLevel based on new CEFR
      updatedPrefs.level = cefrToLanguageLevel(newCefr)
      // Update domain scores to match new CEFR level
      updatedPrefs.domainScores = {
        vocabulary: newCefr,
        grammar: newCefr,
        fluency: newCefr,
        listening: newCefr,
      }
      updatedPrefs.cefr = newCefr
      
      // Reset domain accumulators since the baseline has changed
      setDomainAccumulators({})
      
      // Reset current unit to appropriate starting point for new level
      const startingSeed = getStartingSeedForLevel(updatedPrefs.level)
      updatedPrefs.currentUnitId = startingSeed.id
      
      console.log('[handleLearningPrefsChange] Level changed, resetting accumulators and unit:', {
        oldCefr: preferences.cefr,
        newCefr: newCefr,
        newUnitId: startingSeed.id,
      })
      
      // IMPORTANT: Also update progress to reflect the user's manual level choice
      // This ensures HomeScreen displays the correct level (it prioritizes progress.cefr)
      if (progress) {
        const updatedProgress = {
          ...progress,
          cefr: newCefr,
          domainScores: updatedPrefs.domainScores,
        }
        setProgress(updatedProgress)
        // Save updated progress to backend
        saveProgress(user?.id ?? null, !!user, updatedProgress).catch(e => {
          console.warn('[handleLearningPrefsChange] Failed to save progress:', e)
        })
        console.log('[handleLearningPrefsChange] Updated progress with new CEFR:', newCefr)
      }
    }
    
    // Apply other changes
    Object.assign(updatedPrefs, changes)
    
    setPreferences(updatedPrefs)
    savePreferences(user?.id ?? null, updatedPrefs, !!user)

    // Update conversation state to reflect changes immediately
    const newState = stateFromPrefs(updatedPrefs, user?.name)
    setConversationState(newState)
    stateRef.current = newState

    // If target language changed, update the gemini client and reload progress
    if (changes.targetLanguage && changes.targetLanguage !== preferences.targetLanguage) {
      geminiClient.setLanguage(changes.targetLanguage as any)
      // Load progress for the new language
      ;(async () => {
        const p = await loadProgress(user?.id ?? null, !!user, changes.targetLanguage as any)
        setProgress(p)
      })()
    }
  }, [preferences, user, progress])

  // ── Re-assess level (triggers onboarding conversation) ───────────────────
  const handleReassess = useCallback(() => {
    setForceWelcome(true)
    // Note: The WelcomeModal will detect existing preferences and skip setup
  }, [])

  // ── Manual mic toggle ────────────────────────────────────────────────────
  const handleToggleListening = useCallback(() => {
    if (isListening) {
      // Stop recording and send the audio to Gemini
      stopMicAndSend()
    } else {
      if (isSpeaking) {
        geminiClient.stopSpeaking()
        setIsSpeaking(false)
        setIsProcessing(false)
        isProcessingRef.current = false
      }
      if (!isMuted && !isSpeaking) startMic()
    }
  }, [isListening, isSpeaking, isMuted, startMic, stopMicAndSend])

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) stopMic()
      else if (!isSpeakingRef.current) startMic()
      return next
    })
  }, [startMic, stopMic])

  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerMuted((prev) => {
      const next = !prev
      isSpeakerMutedRef.current = next
      if (next) {
        geminiClient.stopSpeaking()
        setIsSpeaking(false)
      }
      return next
    })
  }, [])

  const handleEndCallRequest = useCallback(() => setShowEndCallDialog(true), [])

  // ── End call → save + recap → home ───────────────────────────────────────
  const handleEndCallConfirm = useCallback(async (saveTranscript: boolean, confirmedVocab?: VocabItem[]) => {
    setShowEndCallDialog(false)

    geminiClient.stopSpeaking()
    setIsSpeaking(false)
    isSpeakingRef.current = false
    stopMic()

    // Cancel any inflight voice-note TTS
    ttsAbortersRef.current.forEach((c) => c.abort())
    ttsAbortersRef.current.clear()

    const wasMessageCount = messages.length
    const fullDuration = callDuration

    // Use confirmed vocab if provided, otherwise fall back to sessionVocab
    const finalVocab = confirmedVocab || sessionVocab

    if (saveTranscript && wasMessageCount > 0) {
      try {
        // Strip voice-note audio blobs before persisting (way too big)
        const messagesForSave = messages.map((m) => {
          if (!m.audio) return m
          const { audio: _audio, ...rest } = m
          return rest
        })
        await saveConvHybrid(
          user?.id ?? null,
          {
            messages: messagesForSave,
            duration: fullDuration,
            state: conversationState,
            topic: conversationState.topic,
            level: conversationState.level,
          },
          !!user
        )
      } catch (e) {
        console.warn('[end-call] save failed:', e)
      }
    }

    // Reset call-only state but keep progress and preferences
    setIsProcessing(false)
    setIsMuted(false)
    setIsSpeakerMuted(false)
    setServiceError(null)
    isProcessingRef.current = false
    pendingRetryRef.current = null

    // Auto-collect phrase bank entries from the just-finished session (Feature 7)
    if (wasMessageCount > 0) {
      try {
        await addPhrasesFromSession(
          user?.id ?? null,
          !!user,
          (conversationState.targetLanguage ?? 'en') as TargetLanguage,
          messages,
          conversationState.persona ?? 'eli',
          conversationState.currentUnitId ?? 'greetings'
        )
      } catch (e) {
        console.warn('[phrase-bank] collect failed:', e)
      }

      // Save to local chat history (System 12)
      try {
        const unit = getSeedById(conversationState.currentUnitId ?? '')
        const lessonTitle = conversationState.lessonPath?.title
        const title = lessonTitle
          ? `Lesson: ${lessonTitle}`
          : unit?.title ?? 'Free Talk'
        saveChatSession({
          sessionId: `${Date.now()}`,
          date: new Date().toISOString(),
          title,
          personaId: (conversationState.persona ?? 'eli') as PersonaId,
          targetLanguage: conversationState.targetLanguage ?? 'en',
          messages,
          durationSeconds: fullDuration,
        })
      } catch (e) {
        console.warn('[chat-history] save failed:', e)
      }
    }

    // ── Generate recap (best-effort) ──
    if (wasMessageCount >= 2) {
      setRecapOpen(true)
      setRecapLoading(true)
      try {
        const unit = getSeedById(conversationState.currentUnitId ?? '') ?? null
        const transcriptForRecap = messages.map((m) => ({
          role: m.isUser ? ('user' as const) : ('ai' as const),
          text: m.text,
        }))
        const r = await geminiClient.generateRecap({
          targetLanguage: conversationState.targetLanguage ?? 'en',
          unitId: unit?.id ?? 'greetings',
          unitTitle: unit?.title ?? 'Conversation',
          cefr: conversationState.cefr ?? 'B1',
          transcript: transcriptForRecap,
          corrections: sessionCorrections,
          vocabIntroduced: finalVocab,
          durationSeconds: fullDuration,
          plantedPhrase: sessionPlantedPhraseRef.current,
        })
        setRecap(r)

        // Save recap to localStorage (last 10 for history display)
        saveSessionRecap(
          user?.id ?? null,
          r,
          (conversationState.targetLanguage ?? 'en') as TargetLanguage,
          conversationState.persona
        )

        // Update progress
        await updateProgressAfterSession(r, finalVocab)

        // Update character memory in the background (non-blocking)
        updateCharacterMemoryAfterSession(transcriptForRecap).catch((e) => {
          console.warn('[memory-update] failed:', e)
        })
      } catch (err) {
        console.warn('[recap] failed:', err)
        setRecap({
          durationSeconds: fullDuration,
          unitId: conversationState.currentUnitId ?? 'greetings',
          unitTitle: getSeedById(conversationState.currentUnitId ?? '')?.title ?? 'Conversation',
          vocabSeen: sessionVocab,
          topCorrections: sessionCorrections.slice(0, 5),
          grammarTried: [],
          encouragement: 'Nice session. Keep showing up.',
          unitComplete: false,
          nextFocus: 'Try a few more turns next time.',
        })
        await updateProgressAfterSession(null, sessionVocab)
      } finally {
        setRecapLoading(false)
      }
    } else {
      // Too short — no recap, just go home.
      setMessages([])
      setInterimTranscript('')
      setCallDuration(0)
      geminiClient.resetHistory()
      setView('home')
    }
  }, [messages, callDuration, conversationState, sessionCorrections, sessionVocab, user, stopMic])



  /**
   * Update the rolling character memory for the current persona × language.
   * Runs in the background after a session — never blocks the recap.
   */
  const updateCharacterMemoryAfterSession = async (
    transcript: Array<{ role: 'user' | 'ai'; text: string }>
  ) => {
    if (transcript.length < 4) return // not enough signal
    const personaId = conversationState.persona ?? 'eli'
    const targetLang = (conversationState.targetLanguage ?? 'en') as TargetLanguage
    const userId = user?.id ?? 'anon'

    const existing = (await loadCharacterMemory(user?.id ?? null, !!user, personaId, targetLang))
      ?? emptyCharacterMemory(userId, personaId, targetLang)

    try {
      const update = await geminiClient.updateCharacterMemory({
        personaId,
        previousSummary: existing.summary,
        knownFacts: existing.facts.map((f) => f.fact),
        transcript,
      })
      const merged = mergeMemoryUpdate(existing, update, existing.sessionsCount + 1)
      await saveCharacterMemory(user?.id ?? null, !!user, merged)
      
      // Also save to conversation-memory (localStorage) for quick access on home screen
      if (user?.id) {
        const { saveMemory } = await import('@/lib/storage/conversation-memory')
        saveMemory({
          userId: user.id,
          personaId,
          targetLanguage: targetLang,
          lastScenarioId: conversationState.currentUnitId,
          lastTopics: update.lastTopics,
          userFacts: update.newFacts,
          conversationSummary: update.summary,
          lastSessionAt: Date.now(),
          totalSessions: (progress?.totalSessions ?? 0) + 1,
        })
      }
    } catch (e) {
      console.warn('[character-memory] update failed:', e)
    }
  }

  /** Updates LanguageProgress based on the just-finished session. */
  const updateProgressAfterSession = async (sessionRecap: SessionRecap | null, vocabToUse?: VocabItem[]) => {
    const targetLanguage = (conversationState.targetLanguage ?? 'en') as TargetLanguage
    const seedId = conversationState.currentUnitId ?? 'greetings'

    const { progress: newProgress, newAccumulators, analytics } = buildUpdatedProgress(
      progress,
      {
        recap: sessionRecap,
        vocabSeen: vocabToUse || sessionVocab,
        corrections: sessionCorrections,
        durationSeconds: callDuration,
        targetLanguage,
        seedId,
        userId: user?.id ?? 'anonymous',
        messageCount: messages.length,
      },
      domainAccumulators
    )

    setProgress(newProgress)
    setDomainAccumulators(newAccumulators)

    try {
      await saveProgress(user?.id ?? null, !!user, newProgress)
    } catch (e) {
      console.warn('[progress] save failed:', e)
    }

    // Log analytics (non-blocking)
    if (user?.id) {
      saveSessionAnalytics(analytics).catch(() => {})
    }

    // Persist current unit + domain scores on prefs
    if (preferences) {
      const updatedPrefs: UserPreferences = {
        ...preferences,
        currentUnitId: newProgress.currentUnitId,
        cefr: newProgress.cefr,
        domainScores: newProgress.domainScores,
      }
      setPreferences(updatedPrefs)
      try { await savePreferences(user?.id ?? null, updatedPrefs, !!user) } catch { /* ignore */ }
    }

    // Check if re-assessment is due
    if (shouldReassess(newProgress) && preferences?.targetLanguage) {
      console.log('[LearnerModel] Re-assessment due after', newProgress.sessionsSinceLastAssessment, 'sessions')
      // Reset counter — actual re-assessment happens next time user opens the app
      // (we don't interrupt the recap flow)
    }
  }

  const handleRecapDone = useCallback(() => {
    setRecapOpen(false)
    setRecap(null)
    setMessages([])
    setSessionCorrections([])
    setSessionVocab([])
    setInterimTranscript('')
    setCallDuration(0)
    geminiClient.resetHistory()
    setView('home')
  }, [])

  const handleEndCallCancel = useCallback(() => setShowEndCallDialog(false), [])

  const handleLoadConversation = useCallback((savedConv: SavedConversation) => {
    // Force manual mode for free users loading a conversation
    if (!isSubscribed(user?.id) && !isModeAllowed(conversationModeRef.current)) {
      setConversationMode('manual')
    }

    setMessages(savedConv.messages)
    setConversationState(savedConv.state)
    stateRef.current = savedConv.state
    geminiClient.setLanguage(savedConv.state.targetLanguage)
    geminiClient.resetHistory()
    setCallDuration(0)
    setView('in-call')
    const lastAi = savedConv.messages.filter((m) => !m.isUser).pop()
    if (!lastAi) return
    if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
      const persona = getPersonaById(stateRef.current.persona || 'eli')
      requestAudioForMessage(lastAi.id, lastAi.text, persona?.voiceName)
    } else {
      speakAndResume(lastAi.text)
    }
  }, [speakAndResume, requestAudioForMessage])

  const handleErrorRetry = useCallback(() => {
    setServiceError(null)
    const retry = pendingRetryRef.current
    pendingRetryRef.current = null
    if (retry) retry()
  }, [])

  const handleErrorDismiss = useCallback(() => {
    setServiceError(null)
    pendingRetryRef.current = null
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (view !== 'in-call') return

      switch (e.code) {
        case 'Space':
          if (conversationModeRef.current === 'manual') {
            e.preventDefault()
            handleToggleListening()
          }
          break
        case 'Escape':
          e.preventDefault()
          if (showEndCallDialog) setShowEndCallDialog(false)
          else handleEndCallRequest()
          break
        case 'KeyM':
          if (conversationModeRef.current === 'handsfree') { e.preventDefault(); handleMuteToggle() }
          break
        case 'KeyS':
          if (conversationModeRef.current === 'handsfree') { e.preventDefault(); handleToggleSpeaker() }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, handleToggleListening, handleEndCallRequest, handleMuteToggle, handleToggleSpeaker, showEndCallDialog])

  // Touch gestures for call-only mode
  useEffect(() => {
    if (conversationMode !== 'callonly' || view !== 'in-call') return
    let touchStartY = 0
    const onTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0].clientY }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches[0].clientY - touchStartY > 100) handleEndCallRequest()
    }
    window.addEventListener('touchstart', onTouchStart)
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [conversationMode, view, handleEndCallRequest])

  // ── Render ───────────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary via-primary-glow to-primary animate-loading-slide rounded-full" />
        </div>
      </div>
    )
  }

  if (view === 'welcome' || forceWelcome) {
    return (
      <>
        <WelcomeModal
          onComplete={handleOnboardingComplete}
          initialPreferences={preferences}
          forceFullFlow={forceWelcome}
          reassessmentMode={!!preferences} // Skip setup if user already has preferences
        />
        <MicErrorToast
          kind={micError?.kind ?? null}
          detail={micError?.detail}
          onDismiss={() => setMicError(null)}
        />
      </>
    )
  }

  if (view === 'home' && preferences) {
    // Expired/canceled subscription → show re-subscribe UI (they had premium before)
    if (!isSubscribedCheck) {
      const subInfo = getSubscriptionInfo(user?.id)
      if (subInfo.customerId && (subInfo.status === 'expired' || subInfo.status === 'canceled' || subInfo.status === 'past_due')) {
        return (
          <SubscriptionExpired
            userEmail={user?.email}
            userId={user?.id}
            customerId={subInfo.customerId}
            reason={subInfo.status === 'past_due' ? 'past_due' : subInfo.status === 'canceled' ? 'canceled' : 'expired'}
          />
        )
      }
      // Free users can enter the app — no hard paywall
    }

    return (
      <>
        <HomeShell
          preferences={preferences}
          progress={progress}
          userName={user?.name ?? preferences.userName}
          userId={user?.id ?? null}
          onStartSession={startSession}
          interactionMode={conversationMode}
          onInteractionModeChange={handleModeChange}
          onOpenPhraseBank={() => {
            if (!isSubscribed(user?.id)) { setUpgradeReason('phrasebank'); return }
            setPhraseBankOpen(true)
          }}
          onReassess={handleReassess}
          settingsMicSensitivity={settingsMicSensitivity}
          settingsNoiseCancellation={settingsNoiseCancellation}
          settingsTheme={settingsTheme}
          settingsAutoSave={settingsAutoSave}
          settingsAiCorrections={settingsAiCorrections}
          settingsVoiceSpeed={settingsVoiceSpeed}
          autoPlayMode={autoPlayMode}
          onMicSensitivity={setSettingsMicSensitivity}
          onNoiseCancellation={setSettingsNoiseCancellation}
          onTheme={applyTheme}
          onAutoSaveTranscripts={setSettingsAutoSave}
          onAiCorrections={setSettingsAiCorrections}
          onVoiceSpeed={setSettingsVoiceSpeed}
          onAutoPlayMode={setAutoPlayMode}
          learningPrefs={{
            targetLanguage: preferences.targetLanguage,
            nativeLanguage: preferences.nativeLanguage,
            cefr: preferences.cefr ?? progress?.cefr,
            learningGoal: preferences.learningGoal,
            correctionStyle: preferences.correctionStyle,
          }}
          onLearningPrefsChange={handleLearningPrefsChange}
          currentPersona={conversationState.persona}
          onPersonaChange={handlePersonaChange}
          domainScores={progress?.domainScores ?? preferences.domainScores}
        />
        <MicErrorToast
          kind={micError?.kind ?? null}
          detail={micError?.detail}
          onDismiss={() => setMicError(null)}
        />
        <PhraseBankDialog
          isOpen={phraseBankOpen}
          targetLanguage={(preferences.targetLanguage ?? 'en') as TargetLanguage}
          onClose={() => setPhraseBankOpen(false)}
        />

        {/* Upgrade prompt — shown when free users hit a limit from home */}
        {upgradeReason && (
          <UpgradePrompt
            reason={upgradeReason}
            onClose={() => setUpgradeReason(null)}
            userEmail={user?.email}
            userId={user?.id}
          />
        )}
      </>
    )
  }

  // in-call
  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
      </div>

      {/* Top Control Bar - Hidden during call-only and live modes */}
      {conversationMode !== 'callonly' && conversationMode !== 'live' && (
        <TopControlBar
          isActive={isListening}
          interactionMode={conversationMode}
          onInteractionModeChange={handleModeChange}
          currentPersona={conversationState.persona}
          onPersonaChange={handlePersonaChange}
          domainScores={progress?.domainScores ?? preferences?.domainScores}
          callDuration={callDuration}
          onEndCall={handleEndCallRequest}
          autoPlayVoiceNotes={autoPlayMode}
          onAutoPlayVoiceNotesChange={setAutoPlayMode}
          isChatMode={true}
          lessonInfo={conversationState.lessonPath ? {
            title: conversationState.lessonPath.title,
            currentStep: conversationState.lessonPath.currentStep,
            totalSteps: conversationState.lessonPath.totalSteps,
          } : null}
        />
      )}

      {/* Free tier usage badge — shows remaining messages */}
      {!isSubscribed(user?.id) && (
        <div className="absolute top-14 right-3 z-30">
          <FreeUsageBadge
            remaining={remainingMessages}
            onClick={() => setUpgradeReason('messages')}
          />
        </div>
      )}

      <ServiceErrorBanner
        error={serviceError}
        onRetry={handleErrorRetry}
        onDismiss={handleErrorDismiss}
        autoRetrySeconds={serviceError === 'rate_limited' ? 30 : 15}
      />

      <MicErrorToast
        kind={micError?.kind ?? null}
        detail={micError?.detail}
        onDismiss={() => setMicError(null)}
      />

      <div className="relative z-10 h-full flex flex-col">
        {conversationMode !== 'callonly' && conversationMode !== 'live' && (
          <main className="flex-1 min-h-0 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto h-full flex flex-col">
              <div
                ref={transcriptRef}
                className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 pr-1 pb-[160px] pt-20"
              >
                {messages.map((message, index) => {
                  // Find the AI's previous turn to give context to the rewrite
                  const prevAi = !message.isUser
                    ? undefined
                    : [...messages.slice(0, index)].reverse().find((m) => !m.isUser)?.text

                  // Only the LAST AI message should auto-play (and only in hands-free unless user opted to "always")
                  const isLastAi = !message.isUser
                    && message.id === [...messages].reverse().find((m) => !m.isUser)?.id
                  const autoPlay = isLastAi && shouldAutoPlay()

                  return (
                    <TranscriptMessage
                      key={message.id}
                      text={message.text}
                      translation={message.translation}
                      isUser={message.isUser}
                      corrections={message.corrections}
                      vocab={message.vocab}
                      emotion={message.emotion}
                      teachingNote={message.teachingNote}
                      delay={index < messages.length - 2 ? 0 : 60}
                      skipAnimation={index < messages.length - 2}
                      personaId={conversationState.persona || 'eli'}
                      audio={message.audio}
                      autoPlayAudio={autoPlay}
                      speakerMuted={isSpeakerMuted}
                      onAskNativeRewrite={
                        message.isUser
                          ? (phrase) => setRewriteDialog({ phrase, context: prevAi })
                          : undefined
                      }
                      onRetryAudio={
                        !message.isUser
                          ? () => {
                              const persona = getPersonaById(conversationState.persona || 'eli')
                              requestAudioForMessage(message.id, message.text, persona?.voiceName)
                            }
                          : undefined
                      }
                      onRequestAudio={
                        !message.isUser
                          ? () => {
                              const persona = getPersonaById(conversationState.persona || 'eli')
                              requestAudioForMessage(message.id, message.text, persona?.voiceName)
                            }
                          : undefined
                      }
                      onAudioStarted={
                        !message.isUser
                          ? () => {
                              setIsSpeaking(true)
                              isSpeakingRef.current = true
                              // Stop mic while AI is speaking
                              if (isListening) stopMic()
                            }
                          : undefined
                      }
                      onAudioEnded={
                        !message.isUser
                          ? () => {
                              setIsSpeaking(false)
                              isSpeakingRef.current = false
                              // Hands-free: resume mic when AI finishes speaking
                              if (
                                isLastAi
                                && conversationModeRef.current === 'handsfree'
                                && !isMutedRef.current
                              ) {
                                setTimeout(() => startMic(), 250)
                              }
                            }
                          : undefined
                      }
                    />
                  )
                })}

                {/* Thinking indicator — only shows before first streaming chunk */}
                {isProcessing && messages[messages.length - 1]?.text === '' && !messages[messages.length - 1]?.isUser && (
                  <div className="flex justify-start -mt-2">
                    <div className="px-4 py-2.5 rounded-2xl bg-primary/5 border border-primary/20 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '200ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '400ms' }} />
                        <span className="text-[10px] text-primary/70 font-medium ml-1">Thinking…</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        )}

        {conversationMode === 'callonly' || conversationMode === 'live' ? (
          <ConversationControl
            mode={conversationMode === 'live' ? 'callonly' : conversationMode}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            isMuted={isMuted}
            isSpeakerMuted={isSpeakerMuted}
            personaId={conversationState.persona || 'eli'}
            callDuration={callDuration}
            onToggleListen={handleToggleListening}
            onToggleMute={handleMuteToggle}
            onToggleSpeaker={handleToggleSpeaker}
            onEndCall={handleEndCallRequest}
          />
        ) : conversationMode === 'handsfree' ? (
          <HandsfreeBar
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            isMuted={isMuted}
            isSpeakerMuted={isSpeakerMuted}
            voiceNotesEnabled={voiceNotesEnabled}
            interimTranscript={interimTranscript}
            callDuration={callDuration}
            onSendText={(text) => {
              if (isListening) stopMic()
              if (isSpeakingRef.current) {
                geminiClient.stopSpeaking()
                setIsSpeaking(false)
                isSpeakingRef.current = false
              }
              handleUserInputRef.current(text)
            }}
            onToggleListen={handleToggleListening}
            onStopSpeaking={() => {
              geminiClient.stopSpeaking()
              setIsSpeaking(false)
              isSpeakingRef.current = false
            }}
            onToggleMute={handleMuteToggle}
            onToggleSpeaker={handleToggleSpeaker}
            onEndCall={handleEndCallRequest}
            onToggleVoiceNotes={() => setVoiceNotesEnabled((v) => !v)}
          />
        ) : (
          <ChatComposer
            handsfree={false}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            isMuted={isMuted}
            voiceNotesEnabled={voiceNotesEnabled}
            interimTranscript={interimTranscript}
            callDuration={callDuration}
            onSendText={(text) => {
              // Typing implicitly stops the mic and any active TTS
              if (isListening) stopMic()
              if (isSpeakingRef.current) {
                geminiClient.stopSpeaking()
                setIsSpeaking(false)
                isSpeakingRef.current = false
              }
              handleUserInputRef.current(text)
            }}
            onToggleListen={handleToggleListening}
            onStopSpeaking={() => {
              geminiClient.stopSpeaking()
              setIsSpeaking(false)
              isSpeakingRef.current = false
            }}
            onEndCall={handleEndCallRequest}
            onToggleVoiceNotes={() => setVoiceNotesEnabled((v) => !v)}
          />
        )}
      </div>

      {/* ── Live Call overlay — renders on top when mode is 'live' ── */}
      {conversationMode === 'live' && view === 'in-call' && (
        <LiveCallView
          state={conversationState}
          callDuration={callDuration}
          onEndCall={handleEndCallRequest}
          onTranscriptLine={(role, text) => {
            const msg: ConversationMessage = {
              id: `live-${Date.now()}-${Math.random()}`,
              text,
              isUser: role === 'user',
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, msg])
          }}
        />
      )}

      <EndCallDialog
        isOpen={showEndCallDialog}
        onClose={handleEndCallCancel}
        onConfirm={handleEndCallConfirm}
        messageCount={messages.length}
        callDuration={callDuration}
        autoSaveEnabled={true}
        extractedVocab={sessionVocab}
      />

      <SessionRecapDialog
        isOpen={recapOpen}
        recap={recap}
        loading={recapLoading}
        onClose={handleRecapDone}
        onContinue={handleRecapDone}
      />

      <NativeRewriteDialog
        isOpen={!!rewriteDialog}
        userPhrase={rewriteDialog?.phrase ?? ''}
        conversationContext={rewriteDialog?.context}
        targetLanguage={(conversationState.targetLanguage ?? 'en') as TargetLanguage}
        onClose={() => setRewriteDialog(null)}
      />

      {/* Upgrade prompt — shown when free users hit a limit */}
      {upgradeReason && (
        <UpgradePrompt
          reason={upgradeReason}
          onClose={() => setUpgradeReason(null)}
          userEmail={user?.email}
          userId={user?.id}
        />
      )}
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────

function stateFromPrefs(prefs: UserPreferences, userName?: string): ConversationState {
  const startingUnit = prefs.currentUnitId
    ? { id: prefs.currentUnitId }
    : getStartingSeedForLevel(prefs.level)
  return {
    level: prefs.level,
    cefr: prefs.cefr,
    topic: prefs.topic,
    correctionStyle: prefs.correctionStyle,
    persona: prefs.persona,
    userName: userName ?? prefs.userName,
    targetLanguage: prefs.targetLanguage,
    nativeLanguage: prefs.nativeLanguage,
    learningGoal: prefs.learningGoal,
    currentUnitId: startingUnit.id,
    flowScore: 3,
  }
}
