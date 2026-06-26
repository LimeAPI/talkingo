'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { TranscriptMessage } from './TranscriptMessage'
import { WelcomeModal } from '../dialogs/WelcomeModal'
import { ChatComposer } from './ChatComposer'
import { HandsfreeBar } from './HandsfreeBar'
import { TopControlBar } from './TopControlBar'
import { ServiceErrorBanner, type ServiceErrorType } from '../feedback/ServiceErrorBanner'
import { EndCallDialog } from '../dialogs/EndCallDialog'
import { HomeShell } from '../layout/HomeShell'
import type { LearningMode, InputMethod } from '../layout/TalkScreen'
import { SettingsDrawer } from '../layout/SettingsDrawer'
import { NativeRewriteDialog } from '../dialogs/NativeRewriteDialog'
import { PhraseBankDialog } from '../dialogs/PhraseBankDialog'
import { SessionRecapDialog } from '../dialogs/SessionRecapDialog'
import { MicErrorToast } from '../feedback/MicErrorToast'
import { geminiClient, GeminiServiceError, type MicErrorKind } from '@/lib/api/gemini-client'
import { createLiveCallService, type LiveCallService } from '@/lib/api/live-client'
import { AudioRecorder } from '@/lib/api/audio-recorder'
import { Paywall } from '../paywall/Paywall'
import { SubscriptionExpired } from '../paywall/SubscriptionExpired'
import { UpgradePrompt, type UpgradeReason } from '../paywall/UpgradePrompt'
import { FreeUsageBadge } from '../paywall/FreeUsageBadge'
import { TrialCountdownBadge } from '../paywall/TrialCountdownBadge'
import { PaymentSuccessDialog } from '../paywall/PaymentSuccessDialog'
import { CheckoutReturnHandler } from '../paywall/CheckoutReturnHandler'
import { CheckoutCancelledToast } from '../paywall/CheckoutCancelledToast'
import { InfoToast } from '../paywall/InfoToast'
import { CancellationBanner } from '../paywall/CancellationBanner'
import { authFetch } from '@/lib/api/auth-fetch'
import { isSubscribed, saveSubscriptionInfo, verifySubscription, needsServerVerification, syncFromAccountPrefs, isExpired, isPastDue, getSubscriptionInfo } from '@/lib/subscription/use-subscription'
import { FREE_TIER, getDailyUsage, incrementMessageCount, getRemainingMessages, hasReachedDailyLimit, isPersonaAllowed, isModeAllowed, isLevelAllowed } from '@/lib/subscription/free-tier'
import { LiveCallView } from './LiveCallView'
import {
  loadPreferences,
  savePreferences,
  isOnboarded,
  loadSettings,
} from '@/lib/storage/hybrid-storage'
import { shouldSkipOnboarding } from '@/lib/utils/onboarding-check'
import { talkingoLevelToLanguageLevel } from '@talkingo/shared/utils'
import {
  createSession as createChatSession,
  updateSession as updateChatSession,
  endSession as endChatSession,
  recoverActiveSessions,
  type SessionMode,
} from '@/lib/storage/chat-sessions'
import type {
  ConversationMessage,
  ConversationState,
  UserPreferences,
  PersonaId,
  Correction,
  TargetLanguage,
  LanguageProgress,
} from '@talkingo/shared/types'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import { getSeedById, getStartingSeedForLevel } from '@talkingo/shared/curriculum'
import { getLevelByNumber } from '@talkingo/shared/levels'
import { getLanguageMeta } from '@talkingo/shared/languages'
import { markLessonComplete } from '@/lib/storage/lesson-progress'
import {
  loadLocalLifeline,
  saveLocalLifeline,
  loadLocalUserNote,
  saveLocalUserNote,
  syncMemoryToAppwrite,
  loadMemoryFromAppwrite,
} from '@/lib/storage/learner-memory'
import {
  loadLocalStructuredMemory,
  processAndSaveSessionEnd,
  loadAndMergeStructuredMemory,
  syncStructuredMemoryRemote,
  saveStructuredUserNote,
  type StructuredMemory,
} from '@/lib/storage/hybrid-storage'
import { buildPlannerInjection, buildMemoryInjection, getLevelUpSignal } from '@/lib/storage/structured-memory'
import { useAuth } from '@/context/AuthContext'
import { useScriptPreference } from '@/lib/hooks/use-script-preference'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { MicOff } from 'lucide-react'


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
    talkingoLevel: 5,
    topic: 'general',
    correctionStyle: 'silent',
    persona: 'eli',
    targetLanguage: 'en',
  })
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [conversationMode, setConversationMode] = useState<'manual' | 'handsfree' | 'native' | 'live'>('manual')

  // ── Script preference with revert-on-failure ───────────────────────────
  const { effectiveScript, showScriptToggle, changeScript } = useScriptPreference({
    preferences,
    userId: user?.id ?? null,
    isAuthenticated: !!user,
    setPreferences: (p) => {
      setPreferences(p)
      // Update conversation state so rendered messages use the new script immediately
      const newState = stateFromPrefs(p, user?.displayName)
      setConversationState(newState)
    },
  })

  // ── New mode system: learning mode + input method ──────────────────────
  const [learningMode, setLearningMode] = useState<'free' | 'practice'>('free')
  const [inputMethod, setInputMethod] = useState<'voice' | 'text'>('text')

  // Sync inputMethod → internal conversationMode for backwards compat
  useEffect(() => {
    setConversationMode(inputMethod === 'voice' ? 'live' : 'manual')
  }, [inputMethod])

  const handleLearningModeChange = useCallback((mode: 'free' | 'practice') => {
    setLearningMode(mode)
  }, [])

  const handleInputMethodChange = useCallback((method: 'voice' | 'text') => {
    setInputMethod(method)
  }, [])

  // Legacy gated mode change — kept for internal use
  const handleModeChange = useCallback((mode: 'manual' | 'handsfree' | 'native' | 'live') => {
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
  // ── Session recap (shown after a call ends) ──────────────────────────────
  const [recapData, setRecapData] = useState<{
    corrections: Correction[]
    durationSeconds: number
    levelUp: { fromLevel: number; toLevel: number; toLevelName: string } | null
  } | null>(null)
  const currentScenarioRef = useRef<string | null>(null)
  const [callDuration, setCallDuration] = useState(0)

  // ── Auto-save session tracking ──────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const messagesRef = useRef<ConversationMessage[]>([]) // Always-current ref for saves

  // ── Learning system ────────────────────────────────────────────────

  // Session-only collected data for recap
  const [sessionCorrections, setSessionCorrections] = useState<Correction[]>([])
  const recentCorrectionCountsRef = useRef<number[]>([])
  const nativeServiceRef = useRef<LiveCallService | null>(null)
  /** Tracks the in-progress live/native transcript turn so we can merge text
   *  and analyze the COMPLETE utterance (not just the last streamed chunk). */
  const nativeTurnRef = useRef<{ id: string; text: string; isUser: boolean } | null>(null)

  // ── Cross-session memory ───────────────────────────────────────────
  const [memoryLifeline, setMemoryLifeline] = useState<string>('')
  const [userNote, setUserNote] = useState<string>('')
  const turnCountRef = useRef(0)
  const lastSavedMemoryRef = useRef<string>('') // avoid redundant Appwrite writes
  const memorySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Structured memory (Practice Planner) ────────────────────────────
  const structuredMemoryRef = useRef<StructuredMemory | null>(null)
  const [plannerInjection, setPlannerInjection] = useState<string>('')

  /** Shared helper — called by audio & text paths to avoid duplicate logic. */
  function captureMemoryUpdate(text: string | undefined): void {
    if (!text || text === lastSavedMemoryRef.current) return
    setMemoryLifeline(text)
    saveLocalLifeline(user?.id ?? null, text)
    lastSavedMemoryRef.current = text
    setConversationState((prev) => ({ ...prev, memoryLifeline: text }))
    if (turnCountRef.current % 5 === 1) {
      if (memorySyncTimerRef.current) clearTimeout(memorySyncTimerRef.current)
      memorySyncTimerRef.current = setTimeout(() => {
        if (user?.id) syncMemoryToAppwrite(user.id, text, userNote)
        memorySyncTimerRef.current = null
      }, 2000)
    }
  }

  // Mic error toast
  const [micError, setMicError] = useState<{ kind: MicErrorKind; detail?: string } | null>(null)
  // Mic paused due to inactivity
  const [showMicPausedToast, setShowMicPausedToast] = useState(false)

  // Native rewrite dialog ("Say it like a native")
  const [rewriteDialog, setRewriteDialog] = useState<{ phrase: string; context?: string } | null>(null)

  // Phrase bank dialog
  const [phraseBankOpen, setPhraseBankOpen] = useState(false)

  // Subscription / paywall
  const [showedPaywall, setShowedPaywall] = useState(false)
  // Initialize as false — will be set correctly once user loads (avoids reading wrong localStorage key)
  const [isSubscribedCheck, setIsSubscribedCheck] = useState(false)

  // Upgrade prompt (shown when free users hit a limit)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null)
  const [remainingMessages, setRemainingMessages] = useState<number>(FREE_TIER.DAILY_MESSAGES)

  // Post-payment flow
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)
  const [paymentSuccessInfo, setPaymentSuccessInfo] = useState<{
    trialEndsAt?: number
    plan?: 'monthly' | 'yearly'
  } | null>(null)
  const [showCheckoutCancelledToast, setShowCheckoutCancelledToast] = useState(false)
  const [showBillingUpdatedToast, setShowBillingUpdatedToast] = useState(false)
  // Unified provider-agnostic checkout return (`?provider=&status=success&session_id=`).
  // When present we hand the confirmation flow to <CheckoutReturnHandler/>.
  const [showCheckoutReturn, setShowCheckoutReturn] = useState(false)

  // Sync subscription state once user is loaded
  useEffect(() => {
    if (!user?.id) return
    setIsSubscribedCheck(isSubscribed(user.id))
    setRemainingMessages(getRemainingMessages(user.id))
  }, [user?.id])

  // Handle Stripe redirect outcomes (success / cancelled / billing-updated)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!user?.id) return

    const params = new URLSearchParams(window.location.search)
    const userId = user.id

    // ── Unified provider-agnostic return (`?provider=&status=success&...`) ──
    // Both Stripe and DodoPayments now redirect here. Hand the confirmation
    // (sync-checkout + status polling) to <CheckoutReturnHandler/>, which owns
    // the retry/backoff + persistence. We optimistically flip the UI and let
    // the handler clean the URL once it reaches a terminal state. The legacy
    // `?subscription=success` path below stays for backward compatibility.
    if (params.get('status') === 'success' && params.get('provider')) {
      saveSubscriptionInfo({ status: 'trialing', plan: 'monthly' }, userId)
      setIsSubscribedCheck(true)
      setShowedPaywall(true)
      setShowCheckoutReturn(true)
      return
    }

    // Successful checkout return — authoritative sync via Stripe
    if (params.get('subscription') === 'success') {
      const sessionId = params.get('session_id')
      // Optimistically mark as subscribed so UI flips immediately
      saveSubscriptionInfo({ status: 'trialing', plan: 'monthly' }, userId)
      setIsSubscribedCheck(true)
      setShowedPaywall(true)

      // Authoritative: pull from Stripe → write to Appwrite → use the result
      // here. This is what fixes "payment went through but app doesn't see it"
      // when the webhook hasn't fired yet (or won't fire in local dev).
      const syncCheckoutAndShowSuccess = async () => {
        if (sessionId) {
          try {
            const res = await authFetch('/api/stripe/sync-checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })
            if (res.ok) {
              const data = await res.json()
              saveSubscriptionInfo({
                status: data.status,
                plan: data.plan,
                customerId: data.customerId,
                trialEndsAt: data.trialEnd,
                currentPeriodEnd: data.periodEnd,
                cancelAtPeriodEnd: data.cancelAtPeriodEnd,
              }, userId)
              setIsSubscribedCheck(data.status === 'active' || data.status === 'trialing')
              setPaymentSuccessInfo({
                trialEndsAt: data.trialEnd,
                plan: data.plan,
              })
              setShowPaymentSuccess(true)
              return
            }
            // 202 = subscription not yet ready (rare); poll a couple of times
            if (res.status === 202) {
              for (let i = 0; i < 3; i++) {
                await new Promise(r => setTimeout(r, 1500))
                const retry = await authFetch('/api/stripe/sync-checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId }),
                })
                if (retry.ok) {
                  const data = await retry.json()
                  saveSubscriptionInfo({
                    status: data.status,
                    plan: data.plan,
                    customerId: data.customerId,
                    trialEndsAt: data.trialEnd,
                    currentPeriodEnd: data.periodEnd,
                    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
                  }, userId)
                  setIsSubscribedCheck(data.status === 'active' || data.status === 'trialing')
                  setPaymentSuccessInfo({
                    trialEndsAt: data.trialEnd,
                    plan: data.plan,
                  })
                  setShowPaymentSuccess(true)
                  return
                }
              }
            }
          } catch (err) {
            console.warn('[Payment] sync-checkout failed:', err)
          }
        }
        // Fallback: use whatever the status route says
        try {
          const info = await verifySubscription(userId)
          setPaymentSuccessInfo({ trialEndsAt: info.trialEndsAt, plan: info.plan })
        } catch {
          setPaymentSuccessInfo({ plan: 'monthly' })
        }
        setShowPaymentSuccess(true)
      }
      syncCheckoutAndShowSuccess()
    }

    // User backed out of Stripe checkout
    if (params.get('subscription') === 'cancelled') {
      setShowCheckoutCancelledToast(true)
    }

    // User came back from the customer portal — refresh state
    if (params.get('billing') === 'updated') {
      setShowBillingUpdatedToast(true)
      verifySubscription(userId).then(info => {
        const active = info.status === 'active' || info.status === 'trialing'
        setIsSubscribedCheck(active)
      }).catch(() => { /* ignore */ })
    }

    // Clean URL (preserve unrelated params like UTM)
    if (params.has('subscription') || params.has('session_id') || params.has('billing')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('subscription')
      url.searchParams.delete('session_id')
      url.searchParams.delete('billing')
      window.history.replaceState({}, '', url.pathname + url.search)
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
    // Canonical-first, legacy-fallback customer id (14.1).
    const hasCustomer =
      prefs.providerCustomerId || prefs.stripeCustomerId || prefs.dodopaymentsCustomerId
    if (hasCustomer) {
      const synced = syncFromAccountPrefs(prefs, user.id)
      const active = synced.status === 'active' || synced.status === 'trialing'
      setIsSubscribedCheck(active)
    }
  }, [user?.id, user?.accountPrefs])

  // Settings drawer
  const [settingsOpen, setSettingsOpen] = useState(false)

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
  const [showScrollButton, setShowScrollButton] = useState(false)

  const stateRef = useRef(conversationState)
  const conversationModeRef = useRef(conversationMode)
  const isMutedRef = useRef(isMuted)
  const isSpeakerMutedRef = useRef(isSpeakerMuted)
  const isSpeakingRef = useRef(isSpeaking)
  const isProcessingRef = useRef(false)
  const viewRef = useRef<View>(view)

  // ── Audio Pipeline Coordinator ─────────────────────────────────────────────
  // Lightweight state tracker ensuring mic and playback never overlap.
  // States: idle | recording | playing
  type PipelineState = 'idle' | 'recording' | 'playing'
  const pipelineStateRef = useRef<PipelineState>('idle')
  /** True when user has explicitly tapped the mute button (vs pipeline-paused) */
  const userManuallyMutedRef = useRef(false)
  /** True when mic was paused by the pipeline coordinator (not user action) */
  const pipelinePausedRef = useRef(false)

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
        talkLevel: prefs?.talkingoLevel,
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
        // Validate Talkingo Level/LanguageLevel consistency and fix if needed
        if (prefs.talkingoLevel && prefs.level && !/* removed */(prefs.talkingoLevel as any, prefs.level)) {
          console.warn('[ConversationPage] Fixing inconsistent Level:', {
            talkingoLevel: prefs.talkingoLevel,
            level: prefs.level,
            expectedLevel: talkingoLevelToLanguageLevel(prefs.talkingoLevel as any),
          })
          // Fix the inconsistency by updating level to match Talkingo Level
          prefs.level = talkingoLevelToLanguageLevel(prefs.talkingoLevel as any)
          // Save the corrected preferences
          await savePreferences(user?.id ?? null, prefs, !!user)
        }

        setPreferences(prefs)
        const newState: ConversationState = stateFromPrefs(prefs, user?.displayName)
        setConversationState(newState)
        stateRef.current = newState
        geminiClient.setLanguage(prefs.targetLanguage, prefs.nativeLanguage, prefs.talkingoLevel)

        setView('home')

        // ── Load cross-session memory (fire-and-forget) ────────────────
        if (!cancelled) {
          const loadMem = async () => {
            // Load structured memory first (new system)
            const { memory: localStructured, plannerInjection: localInjection } =
              loadLocalStructuredMemory(user?.id ?? null)
            structuredMemoryRef.current = localStructured
            setPlannerInjection(localInjection)

            // Legacy: still load lifeline for backward compat during migration
            const localMem = loadLocalLifeline(user?.id ?? null)
            const localNote = loadLocalUserNote(user?.id ?? null)
            setMemoryLifeline(localMem)
            setUserNote(localNote || localStructured.userNote)
            lastSavedMemoryRef.current = localMem

            // Try to load from Appwrite (may update local cache)
            if (user?.id) {
              try {
                const { memory: remoteMem, plannerInjection: remoteInjection } =
                  await loadAndMergeStructuredMemory(user.id)
                structuredMemoryRef.current = remoteMem
                setPlannerInjection(remoteInjection)
                if (remoteMem.userNote) {
                  setUserNote(remoteMem.userNote)
                }
              } catch {
                // Non-critical — local data is fine
              }

              // Legacy fallback: still sync old-style if no structured data
              if (!localStructured.sessions.length) {
                const remote = await loadMemoryFromAppwrite(user.id)
                if (remote.memoryLifeline && !localMem) {
                  setMemoryLifeline(remote.memoryLifeline)
                  saveLocalLifeline(user.id, remote.memoryLifeline)
                  lastSavedMemoryRef.current = remote.memoryLifeline
                }
                if (remote.userNote) {
                  setUserNote(remote.userNote)
                  saveLocalUserNote(user.id, remote.userNote)
                }
              }
            }
          }
          loadMem()
        }

        // ── Warmup: pre-fetch opener in background so "Free Talk" feels instant ──
        if (!cancelled) {
          const warmupState = stateFromPrefs(prefs, user?.displayName)
          geminiClient.generateOpener(warmupState, user?.displayName)
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

  // Track scroll position to show/hide scroll-to-bottom button
  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    setShowScrollButton(!isNearBottom)
  }, [])

  // Auto-scroll transcript (only if user is already near bottom)
  useEffect(() => {
    if (transcriptRef.current) {
      const el = transcriptRef.current
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
      if (isNearBottom || messages.length <= 2) {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [messages, interimTranscript])

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [])

  // ── Immediate auto-save: persist messages on every change (no debounce) ──
  // messagesRef always holds the current messages for the unload safety net.
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (!activeSessionId) return
    if (messages.length === 0) return

    // Immediate synchronous write — <2ms for text data, no race conditions
    updateChatSession(
      user?.id ?? null,
      activeSessionId,
      messages,
      conversationModeRef.current as SessionMode,
      callDuration
    )
  }, [messages, activeSessionId, callDuration, user?.id])

  // ── Recover interrupted sessions on mount ─────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    const recovered = recoverActiveSessions(user?.id ?? null)
    if (recovered && recovered.messages.length > 0) {
      console.log('[ChatSave] Recovered interrupted session:', recovered.id, 'with', recovered.messages.length, 'messages')

      // Process the interrupted session into structured memory so we don't lose
      // vocabulary tracking, error patterns, and session history data.
      try {
        const updatedMemory = processAndSaveSessionEnd(user?.id ?? null, {
          messages: recovered.messages,
          scenarioId: recovered.scenarioId || 'free-talk',
          title: recovered.title || 'Recovered session',
          duration: recovered.durationSeconds || 0,
          memoryHighlight: '', // No AI highlight available for interrupted sessions
        })
        structuredMemoryRef.current = updatedMemory
        setPlannerInjection(buildPlannerInjection(updatedMemory))
        console.log('[ChatSave] Processed recovered session into structured memory')
      } catch (err) {
        console.warn('[ChatSave] Failed to process recovered session memory:', err)
        // Non-critical — memory just won't include this session's data
      }
    }
  }, [user?.id, authLoading])

  // ── Safety net: flush on tab close using ref (always-current state) ───────
  // Since writes are immediate, this is a backup for the rare case where a
  // setMessages + immediate re-render hasn't triggered the effect yet.
  useEffect(() => {
    const handleUnload = () => {
      if (activeSessionId && messagesRef.current.length > 0) {
        updateChatSession(
          user?.id ?? null,
          activeSessionId,
          messagesRef.current,
          conversationModeRef.current as SessionMode,
          callDuration
        )
      }
    }
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [activeSessionId, callDuration, user?.id])

  // ── Mic control (voice recording → send audio directly to Gemini) ────────
  const recorderRef = useRef<AudioRecorder | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const stopMicAndSendRef = useRef<() => void>(() => {})
  const noSpeechCountRef = useRef(0) // Track consecutive no-speech cycles

  const startMic = useCallback(async () => {
    if (isMutedRef.current) return
    if (userManuallyMutedRef.current) return // Respect user's manual mute

    // ── Free tier: check daily message limit before recording ─────────────
    if (!isSubscribed(user?.id) && hasReachedDailyLimit(user?.id)) {
      setUpgradeReason('messages')
      return
    }

    setIsListening(true)
    setRecordingDuration(0)
    pipelineStateRef.current = 'recording'

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
          if (noSpeechCountRef.current >= 6) {
            console.log('[Mic] 60s inactivity — pausing handsfree')
            setIsMuted(true)
            isMutedRef.current = true
            noSpeechCountRef.current = 0
            setShowMicPausedToast(true)
            setTimeout(() => setShowMicPausedToast(false), 5000)
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
    pipelineStateRef.current = 'idle'
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
        // Note: server enforces the actual limit via incrementFreeUsage().
        // Client counter is updated when the API response confirms success below.
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
          if (noSpeechCountRef.current >= 6) {
            console.log('[Mic] 60s inactivity (noSpeech from API) — pausing')
            setIsMuted(true)
            isMutedRef.current = true
            noSpeechCountRef.current = 0
            setShowMicPausedToast(true)
            setTimeout(() => setShowMicPausedToast(false), 5000)
          } else {
            setTimeout(() => startMic(), 500)
          }
        }
        return
      }

      // Valid speech — reset inactivity counter
      noSpeechCountRef.current = 0

      // Sync client counter with server (server already decremented via incrementFreeUsage)
      if (!isSubscribed(user?.id)) {
        const updated = incrementMessageCount(user?.id)
        setRemainingMessages(FREE_TIER.DAILY_MESSAGES - updated.messageCount)
      }

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
        timestamp: Date.now(),
        audio: voiceNotesEnabledRef.current ? { status: 'loading' as const } : undefined,
      }])

      if (result.corrections.length > 0) setSessionCorrections((prev) => [...prev, ...result.corrections])

      // ── Capture memory update ────────────────────────────────────────
      turnCountRef.current++
      captureMemoryUpdate((result as any).memoryUpdate as string | undefined)

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
        if (conversationModeRef.current === 'handsfree' && !isMutedRef.current) {
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
        if (conversationModeRef.current === 'handsfree' && !isMutedRef.current) {
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
    if (conversationMode === 'handsfree' || conversationMode === 'native') {
      setVoiceNotesEnabled(true)
    } else if (conversationMode === 'manual') {
      setVoiceNotesEnabled(false)
    }
  }, [conversationMode])

  const shouldAutoPlay = useCallback(() => {
    if (isSpeakerMutedRef.current) return false
    if (autoPlayModeRef.current === 'never') return false
    if (autoPlayModeRef.current === 'always') return true
    return conversationModeRef.current === 'handsfree' || conversationModeRef.current === 'native'
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
        isUser: false,
        timestamp: Date.now(),
        audio: (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') 
          && voiceNotesEnabledRef.current 
          && messages.length > 0
          ? { status: 'loading' }
          : undefined,
      }

      // Multi-bubble delivery for multi-thought responses
      const hasMultipleParts = result.responseParts && result.responseParts.length >= 2
      if (hasMultipleParts) {
        // First bubble: replace the streaming placeholder with the first part
        const firstPart: ConversationMessage = {
          id: streamingMsgId,
          text: result.responseParts![0],
          isUser: false,
          timestamp: Date.now(),
          audio: (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree')
            && voiceNotesEnabledRef.current
            && messages.length > 0
            ? { status: 'loading' }
            : undefined,
        }
        setMessages((prev) => prev.map((m) => m.id === streamingMsgId ? firstPart : m))

        // Deliver subsequent parts with staggered delays (800-1200ms)
        const remainingParts = result.responseParts!.slice(1)
        for (let i = 0; i < remainingParts.length; i++) {
          const delay = 800 + Math.random() * 400 // 800-1200ms delay
          await new Promise((resolve) => setTimeout(resolve, delay))
          const partId = `${streamingMsgId}-part-${i + 1}`
          const partMessage: ConversationMessage = {
            id: partId,
            text: remainingParts[i],
            isUser: false,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, partMessage])
        }
      } else {
        setMessages((prev) => prev.map((m) => m.id === streamingMsgId ? aiMessage : m))
      }
      setConversationState((prev) => ({ ...prev, talkingoLevel: prev.talkingoLevel }))

      if (result.corrections.length > 0) setSessionCorrections((prev) => [...prev, ...result.corrections])

      // Track correction count for this turn (for errorRate signal)
      recentCorrectionCountsRef.current = [
        ...recentCorrectionCountsRef.current.slice(-4),
        result.corrections.length,
      ]

      // Unit-complete signal — removed (direct AI progression)

      // ── Capture memory update ────────────────────────────────────────
      turnCountRef.current++
      captureMemoryUpdate(result.memoryUpdate)

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
  }, [speakAndResume, requestAudioForMessage, user])

  const handleUserInputRef = useRef(handleUserInput)
  useEffect(() => { handleUserInputRef.current = handleUserInput }, [handleUserInput])

  // ── Voice-turn teaching: analyze each finalized user utterance in a live call ──
  // The Live API only streams audio, so it can't return corrections. After each
  // user turn we run a cheap text analysis in the background → corrections +
  // memory + wrong-language/script fixes. Soft-fails so it never disrupts the call.
  const handleVoiceUserTurn = useCallback(async (text: string, messageId?: string) => {
    const clean = text?.trim()
    if (!clean || clean.length < 2) return
    try {
      const result = await geminiClient.analyzeVoiceTurn(clean, stateRef.current)
      const corrections = (result.corrections ?? []) as Correction[]

      if (messageId && (result.normalizedTranscript || corrections.length > 0)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  text: result.normalizedTranscript || m.text,
                  corrections: corrections.length > 0 ? corrections : m.corrections,
                }
              : m
          )
        )
      }

      if (corrections.length > 0) setSessionCorrections((prev) => [...prev, ...corrections])
      turnCountRef.current++
      captureMemoryUpdate(result.memoryUpdate)
    } catch {
      // Soft-fail — teaching is best-effort; the conversation comes first.
    }
  }, [])
  const handleVoiceUserTurnRef = useRef(handleVoiceUserTurn)
  useEffect(() => { handleVoiceUserTurnRef.current = handleVoiceUserTurn }, [handleVoiceUserTurn])

  // ── Native mode: Gemini Live API with chat bubbles ────────────────────────
  useEffect(() => {
    if (conversationMode !== 'native' || view !== 'in-call') {
      if (nativeServiceRef.current) {
        nativeServiceRef.current.disconnect()
        nativeServiceRef.current = null
      }
      return
    }

    const service = createLiveCallService()
    nativeServiceRef.current = service
    setIsProcessing(true)
    setServiceError(null)

    service.setCallbacks({
      onStatus: (status) => {
        if (status === 'listening' || status === 'ready') {
          setIsListening(true)
          setIsSpeaking(false)
          setIsProcessing(false)
        } else if (status === 'speaking') {
          setIsListening(false)
          setIsSpeaking(true)
          setIsProcessing(false)
        } else if (status === 'connecting') {
          setIsProcessing(true)
        } else if (status === 'error' || status === 'closed') {
          setIsProcessing(false)
          setIsListening(false)
          setIsSpeaking(false)
        }
      },
      onTranscript: (event) => {
        const isUser = event.role === 'user'
        const prevTurn = nativeTurnRef.current

        // Resolve the message id + full merged text for this turn synchronously,
        // so the analysis below sees the COMPLETE utterance (Gemini streams
        // transcripts, sometimes cumulatively, sometimes incrementally).
        let id: string
        let mergedText: string
        if (prevTurn && prevTurn.isUser === isUser) {
          id = prevTurn.id
          mergedText =
            event.text.length >= prevTurn.text.length && event.text.startsWith(prevTurn.text)
              ? event.text
              : event.text.length > prevTurn.text.length
                ? event.text
                : prevTurn.text + event.text
        } else {
          id = `native-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          mergedText = event.text
        }
        nativeTurnRef.current = { id, text: mergedText, isUser }

        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.id === id) {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, text: mergedText }
            return updated
          }
          return [...prev, { id, text: mergedText, isUser, timestamp: Date.now() }]
        })

        // When the user finishes an utterance, analyze the full text for
        // corrections + memory and attach them to that bubble.
        if (isUser && event.final) {
          handleVoiceUserTurnRef.current(mergedText, id)
          nativeTurnRef.current = null // next user utterance starts a fresh bubble
        }
      },
      onInterrupted: () => {
        // Replace last incomplete AI message with an interruption marker
        // that auto-fades after 1.5 seconds instead of silently deleting it
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && !last.isUser) {
            const interruptedMsg = {
              ...last,
              text: '…',
              isInterruption: true,
            }
            // Auto-remove the interruption marker after 1.5s
            setTimeout(() => {
              setMessages((p) => p.filter((m) => m.id !== interruptedMsg.id))
            }, 1500)
            return [...prev.slice(0, -1), interruptedMsg]
          }
          return prev
        })
      },
      onError: (msg) => {
        console.error('[Native] Live service error:', msg)
        setServiceError('ai_unavailable')
        setIsProcessing(false)
      },
    })

    service
      .connect(conversationState)
      .then(async () => {
        await service.startMic()
        // Generate a localized opener in the user's target language
        try {
          const opener = await geminiClient.generateOpener(stateRef.current, stateRef.current.userName)
          service.sendText(opener.aiResponse)
        } catch {
          // Fallback to a localized greeting in the user's target language
          // (never a hardcoded English string).
          const hello = getLanguageMeta(stateRef.current.targetLanguage).sampleHello
          service.sendText(hello)
        }
      })
      .catch((err) => {
        console.error('[Native] Connection failed:', err)
        setServiceError('ai_unavailable')
        setIsProcessing(false)
      })

    return () => {
      service.disconnect()
      nativeServiceRef.current = null
      nativeTurnRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationMode, view])

  // Auto-start mic when switching to handsfree / native
  useEffect(() => {
    geminiClient.setMode(conversationMode === 'live' ? 'handsfree' : conversationMode)
    if (
      view === 'in-call' &&
      (conversationMode === 'handsfree' || conversationMode === 'native') &&
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
    geminiClient.setLanguage(completed.targetLanguage, completed.nativeLanguage, completed.talkingoLevel)
    setForceWelcome(false)

    if (completed.targetLanguage) {
      geminiClient.setLanguage(completed.targetLanguage, completed.nativeLanguage, completed.talkingoLevel)
    }

    const newState = stateFromPrefs(completed, user?.displayName)
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
            sessionStorage.removeItem('talkingo_custom_scenario')
          }
        }
      } catch (e) {
        console.warn('[startSession] Failed to parse custom scenario:', e)
      }
    }

    // Ensure we have preferences for state creation
    const prefs = preferences
    if (!prefs?.targetLanguage) return

    const newState = stateFromPrefs(prefs, user?.displayName)

    // ── Wire the clicked scenario into state ──────────────────────────────
    // This ensures the opener and every turn know what the user actually picked.
    if (scenarioId === 'free-talk') {
      newState.currentUnitId = 'free-talk'
    } else if (scenarioId.startsWith('custom-') && customScenarioPrompt) {
      // Custom scenarios: treat as free-flow, but attach the user's prompt
      newState.currentUnitId = 'free-talk'
      newState.customPrompt = customScenarioPrompt
    } else {
      // Real seed scenario — override whatever was in prefs
      newState.currentUnitId = scenarioId
    }

    // ── Inject cross-session memory into state ───────────────────────
    // Memory now works in BOTH modes (one consolidated system):
    //  - Practice mode → full planner (targets weak spots + remembers you)
    //  - Free Talk     → light memory (remembers you, no drilling)
    // Falls back to the legacy lifeline only if structured memory is empty.
    const noteText = userNote
    const structured = structuredMemoryRef.current
    const freeTalkMemory = structured ? buildMemoryInjection(structured) : ''

    if (learningMode === 'practice' && plannerInjection) {
      newState.practiceTargets = plannerInjection
    } else if (freeTalkMemory) {
      newState.practiceTargets = freeTalkMemory
    } else if (memoryLifeline) {
      newState.memoryLifeline = memoryLifeline
    }
    // userNote is already folded into the injections above; only add separately
    // when neither injection fired.
    if (noteText && !newState.practiceTargets) newState.userNotes = noteText
    turnCountRef.current = 0

    setConversationState(newState)
    stateRef.current = newState
    geminiClient.setLanguage(newState.targetLanguage, newState.nativeLanguage, newState.talkingoLevel)
    geminiClient.resetHistory()

    setMessages([])
    setSessionCorrections([])
    setCallDuration(0)
    setInterimTranscript('')
    setIsProcessing(true)
    setView('in-call')

    // Track scenario for module completion tracking
    if (scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')) {
      currentScenarioRef.current = scenarioId
    } else {
      currentScenarioRef.current = null
    }

    // ── Create auto-save session ──────────────────────────────────────────
    const sessionSeed = scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')
      ? getSeedById(scenarioId) : null
    const sessionTitle = customScenarioPrompt
      ? 'Custom Scenario'
      : sessionSeed?.title ?? 'Free Talk'
    const newSessionId = createChatSession(user?.id ?? null, {
      mode: conversationMode as SessionMode,
      personaId: (preferences.persona ?? 'eli') as PersonaId,
      targetLanguage: preferences.targetLanguage ?? 'en',
      title: sessionTitle,
      level: String(preferences.talkingoLevel ?? 5),
      scenarioId,
    })
    setActiveSessionId(newSessionId)

    try {
      // Native mode: LiveCallService handles the opener via system instruction
      if (conversationModeRef.current === 'native') {
        setIsProcessing(false)
        setServiceError(null)
        return
      }

      // Use pre-fetched warmup opener if available (for free-talk sessions) —
      // but only when we DON'T have memory to weave in. The warmup opener was
      // generated without memory context, so for returning users we generate a
      // fresh, memory-aware greeting instead.
      const hasMemory = !!(newState.practiceTargets || newState.memoryLifeline)
      let opener
      if (scenarioId === 'free-talk' && warmupOpenerRef.current && !hasMemory) {
        opener = warmupOpenerRef.current
        warmupOpenerRef.current = null
        console.log('[startSession] Using pre-fetched warmup opener')
      } else {
        opener = await geminiClient.generateOpener(newState, user?.displayName)
      }
      const aiMessage: ConversationMessage = {
        id: Date.now().toString(),
        text: opener.aiResponse,
        isUser: false,
        timestamp: Date.now(),
        audio: undefined,
      }
      setMessages([aiMessage])
      setIsProcessing(false)
      setServiceError(null)
      if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
        if (voiceNotesEnabledRef.current) {
          const persona = getPersonaById(stateRef.current.persona || 'eli')
          requestAudioForMessage(aiMessage.id, opener.aiResponse, persona?.voiceName)
        }
      } else {
        // 'live' mode: speak via TTS
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
  }, [preferences, user, speakAndResume, requestAudioForMessage])

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
    talkingoLevel?: number
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }) => {
    if (!preferences) return

    // If talkingoLevel is changing, recalculate domain scores and language level for consistency
    const updatedPrefs: UserPreferences = { ...preferences }
    const levelChanged = changes.talkingoLevel && changes.talkingoLevel !== preferences.talkingoLevel

    if (levelChanged) {
      const newLevelNum = changes.talkingoLevel as number
      updatedPrefs.talkingoLevel = newLevelNum

      // Reset current unit to appropriate starting point for new level
      const startingSeed = getStartingSeedForLevel(newLevelNum)
      updatedPrefs.currentUnitId = startingSeed.id

      console.log('[handleLearningPrefsChange] Level changed, resetting unit:', {
        oldLevel: preferences.talkingoLevel,
        newLevel: newLevelNum,
        newUnitId: startingSeed.id,
      })
    }
    
    // Apply other changes
    Object.assign(updatedPrefs, changes)
    
    setPreferences(updatedPrefs)
    savePreferences(user?.id ?? null, updatedPrefs, !!user)

    // Update conversation state to reflect changes immediately
    const newState = stateFromPrefs(updatedPrefs, user?.displayName)
    setConversationState(newState)
    stateRef.current = newState

    // If target language changed, update the gemini client
    if (changes.targetLanguage && changes.targetLanguage !== preferences.targetLanguage) {
      geminiClient.setLanguage(changes.targetLanguage as any, (changes.nativeLanguage ?? preferences.nativeLanguage) as any, (changes.talkingoLevel ?? preferences.talkingoLevel) as any)
    }
  }, [preferences, user])

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
      userManuallyMutedRef.current = next // Track user's intentional mute action
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

  // ── End call → recap → home ────────────────────────────────────────────
  const handleEndCallConfirm = useCallback(async (saveTranscript: boolean) => {
    setShowEndCallDialog(false)

    // Mark the completed scenario for module tracking
    if (currentScenarioRef.current) {
      markLessonComplete(currentScenarioRef.current)
    }

    // Disconnect native live service if active
    nativeServiceRef.current?.disconnect()
    nativeServiceRef.current = null

    geminiClient.stopSpeaking()
    setIsSpeaking(false)
    isSpeakingRef.current = false
    stopMic()

    // Cancel any inflight voice-note TTS
    ttsAbortersRef.current.forEach((c) => c.abort())
    ttsAbortersRef.current.clear()

    const fullDuration = callDuration

    // ── End the auto-save session (mark as ended) ─────────────────────────
    if (activeSessionId) {
      updateChatSession(
        user?.id ?? null,
        activeSessionId,
        messages,
        conversationModeRef.current as SessionMode,
        fullDuration
      )
      endChatSession(user?.id ?? null, activeSessionId, fullDuration)
      setActiveSessionId(null)
    }

    // ── Process session into structured memory (vocab + errors + summary) ──
    if (messages.length > 0) {
      const scenarioId = currentScenarioRef.current || conversationState.currentUnitId || 'free-talk'
      const sessionTitle = conversationState.topic === 'general' ? 'Free Talk' :
        (typeof conversationState.topic === 'string' ? conversationState.topic : 'Conversation')

      const updatedMemory = processAndSaveSessionEnd(user?.id ?? null, {
        messages,
        scenarioId,
        title: sessionTitle,
        duration: fullDuration,
        memoryHighlight: lastSavedMemoryRef.current,
        targetLanguage: conversationState.targetLanguage,
      })

      // Update refs and state for next session
      structuredMemoryRef.current = updatedMemory
      const newInjection = buildPlannerInjection(updatedMemory)
      setPlannerInjection(newInjection)

      // ── Build the session recap (corrections + level-up offer) ──────────
      const currentLevel = conversationState.talkingoLevel ?? 5
      const signal = getLevelUpSignal(updatedMemory, currentLevel)
      const levelUp = signal.ready
        ? {
            fromLevel: currentLevel,
            toLevel: currentLevel + 1,
            toLevelName: getLevelByNumber(currentLevel + 1).name,
          }
        : null
      setRecapData({
        corrections: sessionCorrections,
        durationSeconds: fullDuration,
        levelUp,
      })

      // Sync structured memory to Appwrite (fire-and-forget)
      if (user?.id) {
        syncStructuredMemoryRemote(user.id).catch(() => {})
      }
    }

    // ── Final memory sync to Appwrite (fire-and-forget) ────────────────
    if (user?.id && lastSavedMemoryRef.current) {
      syncMemoryToAppwrite(user.id, lastSavedMemoryRef.current, userNote)
    }
    if (memorySyncTimerRef.current) {
      clearTimeout(memorySyncTimerRef.current)
      memorySyncTimerRef.current = null
    }

    // Reset call-only state but keep progress and preferences
    setIsProcessing(false)
    setIsMuted(false)
    setIsSpeakerMuted(false)
    setServiceError(null)
    isProcessingRef.current = false
    pendingRetryRef.current = null

    // Keep messages in memory after live calls so users can review the transcript
    if (conversationModeRef.current !== 'live') {
      setMessages([])
    }
    setSessionCorrections([])
    setInterimTranscript('')
    setCallDuration(0)
    geminiClient.resetHistory()
    setView('home')
  }, [messages, callDuration, conversationState, sessionCorrections, user, stopMic, activeSessionId])

  // ── Accept the level-up offer from the recap ─────────────────────────────
  const handleAcceptLevelUp = useCallback(async () => {
    if (!recapData?.levelUp || !preferences) { setRecapData(null); return }
    const newLevel = recapData.levelUp.toLevel
    const updated: UserPreferences = {
      ...preferences,
      talkingoLevel: newLevel,
      level: talkingoLevelToLanguageLevel(newLevel as any),
    }
    setPreferences(updated)
    const newState = stateFromPrefs(updated, user?.displayName)
    setConversationState(newState)
    stateRef.current = newState
    geminiClient.setLanguage(updated.targetLanguage, updated.nativeLanguage, newLevel)
    try {
      await savePreferences(user?.id ?? null, updated, !!user)
    } catch {
      // Non-critical — local state already reflects the new level.
    }
    setRecapData(null)
  }, [recapData, preferences, user])

  const handleCloseRecap = useCallback(() => setRecapData(null), [])






  const handleEndCallCancel = useCallback(() => setShowEndCallDialog(false), [])

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

  // Touch gestures for live call mode
  useEffect(() => {
    if (conversationMode !== 'live' || view !== 'in-call') return
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
    return <LoadingScreen />
  }

  if (view === 'welcome' || forceWelcome) {
    return (
      <>
        <WelcomeModal
          onComplete={handleOnboardingComplete}
          initialPreferences={preferences}
          forceFullFlow={forceWelcome}
          reassessmentMode={!!preferences} // Skip setup if user already has preferences
          initialEmail={user ? (user.email || '') : undefined}
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

    // Derive legacy LanguageProgress — removed (simplified)
    const progress: LanguageProgress | null = null

    return (
      <>
        <HomeShell
          preferences={preferences}
          progress={progress}
          userName={user?.displayName ?? preferences.userName}
          userId={user?.id ?? null}
          onStartSession={startSession}
          learningMode={learningMode}
          inputMethod={inputMethod}
          onLearningModeChange={handleLearningModeChange}
          onInputMethodChange={handleInputMethodChange}
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
            targetLanguage: preferences?.targetLanguage,
            nativeLanguage: preferences?.nativeLanguage,
            talkLevel: preferences?.talkingoLevel,
            learningGoal: preferences?.learningGoal,
            correctionStyle: preferences?.correctionStyle as 'direct' | 'silent' | undefined,
          }}
          onLearningPrefsChange={handleLearningPrefsChange}
          currentPersona={conversationState.persona}
          onPersonaChange={handlePersonaChange}
          showScriptToggle={showScriptToggle}
          effectiveScript={effectiveScript}
          onScriptChange={changeScript}
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

      {/* Top Control Bar - Hidden during live call mode */}
      {conversationMode !== 'live' && (
        <TopControlBar
          isActive={isListening}
          interactionMode={conversationMode}
          onInteractionModeChange={handleModeChange}
          currentPersona={conversationState.persona}
          onPersonaChange={handlePersonaChange}
          learningPrefs={{
            targetLanguage: preferences?.targetLanguage,
            nativeLanguage: preferences?.nativeLanguage,
            talkLevel: preferences?.talkingoLevel,
            learningGoal: preferences?.learningGoal,
            correctionStyle: preferences?.correctionStyle as 'direct' | 'silent' | undefined,
          }}
          callDuration={callDuration}
          onEndCall={handleEndCallRequest}
          autoPlayVoiceNotes={autoPlayMode}
          onAutoPlayVoiceNotesChange={setAutoPlayMode}
          isChatMode={true}
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

      {/* Trial countdown badge — shows for users in trialing status */}
      {isSubscribed(user?.id) && (
        <div className="absolute top-14 right-3 z-30">
          <TrialCountdownBadge userId={user?.id} />
        </div>
      )}

      {/* Cancellation banner — shows when user cancelled but still has access */}
      {isSubscribed(user?.id) && (
        <CancellationBanner
          userId={user?.id}
          onReactivate={async () => {
            try {
              const res = await authFetch('/api/stripe/reactivate', { method: 'POST' })
              if (res.ok) {
                const info = await verifySubscription(user?.id)
                setIsSubscribedCheck(info.status === 'active' || info.status === 'trialing')
              }
            } catch { /* swallow */ }
          }}
        />
      )}

      {/* Post-payment success dialog */}
      {showPaymentSuccess && (
        <PaymentSuccessDialog
          onClose={() => setShowPaymentSuccess(false)}
          trialEndsAt={paymentSuccessInfo?.trialEndsAt}
          plan={paymentSuccessInfo?.plan}
        />
      )}

      {/* Unified provider-agnostic checkout return overlay. Confirms the
          subscription (sync-checkout + status polling) for both Stripe and
          DodoPayments so the user sees Premium immediately. */}
      {showCheckoutReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <CheckoutReturnHandler
            userId={user?.id}
            onSuccess={(info) => {
              setIsSubscribedCheck(info.status === 'active' || info.status === 'trialing')
              setPaymentSuccessInfo({ trialEndsAt: info.trialEndsAt, plan: info.plan })
              // Strip the return params now that the flow has finalized.
              const url = new URL(window.location.href)
              ;['provider', 'status', 'session_id', 'subscription_id'].forEach((k) =>
                url.searchParams.delete(k),
              )
              window.history.replaceState({}, '', url.pathname + url.search)
              // Briefly show the celebratory dialog, then dismiss the overlay.
              setShowCheckoutReturn(false)
              setShowPaymentSuccess(true)
            }}
            onError={() => {
              const url = new URL(window.location.href)
              ;['provider', 'status', 'session_id', 'subscription_id'].forEach((k) =>
                url.searchParams.delete(k),
              )
              window.history.replaceState({}, '', url.pathname + url.search)
              // Leave the handler's error card visible; allow dismissal on tap.
            }}
          />
        </div>
      )}

      {/* Checkout cancelled toast */}
      {showCheckoutCancelledToast && (
        <CheckoutCancelledToast onClose={() => setShowCheckoutCancelledToast(false)} />
      )}

      {/* Billing updated toast (after returning from customer portal) */}
      {showBillingUpdatedToast && (
        <InfoToast
          message="Your subscription has been updated."
          variant="success"
          onClose={() => setShowBillingUpdatedToast(false)}
          durationMs={4000}
        />
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

      {/* Mic paused due to inactivity toast */}
      {showMicPausedToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full glass-card border border-primary/40 bg-primary/10 backdrop-blur-xl shadow-xl">
            <MicOff className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground/90 whitespace-nowrap">
              Mic paused after inactivity
            </span>
            <button
              onClick={() => {
                setIsMuted(false)
                isMutedRef.current = false
                setShowMicPausedToast(false)
                startMic()
              }}
              className="ml-1 px-2.5 py-1 rounded-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-bold transition-all active:scale-95"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col">
        {conversationMode !== 'live' && (
          <main className="flex-1 min-h-0 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto h-full flex flex-col">
              <div
                ref={transcriptRef}
                onScroll={handleTranscriptScroll}
                className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 pr-1 pb-[240px] pt-20"
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
                    <div key={message.id} data-message-id={message.id}>
                    <TranscriptMessage
                      text={message.text}
                      isUser={message.isUser}
                      isInterruption={message.isInterruption}
                      corrections={message.corrections}
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
                              pipelineStateRef.current = 'playing'
                              // Pause mic via pipeline coordinator (not user-initiated mute)
                              if (isListening && recorderRef.current) {
                                recorderRef.current.pause()
                                pipelinePausedRef.current = true
                              } else if (isListening) {
                                stopMic()
                                pipelinePausedRef.current = true
                              }
                            }
                          : undefined
                      }
                      onAudioEnded={
                        !message.isUser
                          ? () => {
                              setIsSpeaking(false)
                              isSpeakingRef.current = false
                              pipelineStateRef.current = 'idle'
                              // Resume mic only if:
                              // 1. Pipeline paused the mic (not user-initiated mute)
                              // 2. Mode is handsfree/native
                              // 3. User has NOT manually muted (requirement 3.9)
                              if (
                                pipelinePausedRef.current
                                && !userManuallyMutedRef.current
                                && (conversationModeRef.current === 'handsfree' || conversationModeRef.current === 'native')
                              ) {
                                pipelinePausedRef.current = false
                                if (recorderRef.current && recorderRef.current.currentState === 'paused') {
                                  recorderRef.current.resume()
                                  pipelineStateRef.current = 'recording'
                                } else if (isLastAi) {
                                  setTimeout(() => startMic(), 250)
                                  pipelineStateRef.current = 'recording'
                                }
                              } else {
                                pipelinePausedRef.current = false
                              }
                            }
                          : undefined
                      }
                    />
                    </div>
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

              {/* Scroll-to-bottom button */}
              {showScrollButton && messages.length > 4 && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-52 left-1/2 -translate-x-1/2 z-20 w-10 h-10 rounded-full bg-card/90 border border-border/60 shadow-xl backdrop-blur-md flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 animate-fade-in-up"
                  aria-label="Scroll to bottom"
                >
                  <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                </button>
              )}
            </div>
          </main>
        )}

        {conversationMode === 'native' || conversationMode === 'handsfree' ? (
          <HandsfreeBar
            mode={conversationMode as 'handsfree' | 'native'}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            isMuted={isMuted}
            isSpeakerMuted={isSpeakerMuted}
            voiceNotesEnabled={voiceNotesEnabled}
            interimTranscript={interimTranscript}
            callDuration={callDuration}
            onSendText={(text) => {
              if (conversationModeRef.current === 'native') {
                nativeServiceRef.current?.sendText(text)
                return
              }
              if (isListening) stopMic()
              if (isSpeakingRef.current) {
                geminiClient.stopSpeaking()
                setIsSpeaking(false)
                isSpeakingRef.current = false
              }
              handleUserInputRef.current(text)
            }}
            onToggleListen={() => {
              if (conversationModeRef.current === 'native') {
                if (isMuted) {
                  nativeServiceRef.current?.startMic().catch(() => {})
                  setIsMuted(false)
                } else {
                  nativeServiceRef.current?.stopMic()
                  setIsMuted(true)
                }
                return
              }
              handleToggleListening()
            }}
            onStopSpeaking={() => {
              if (conversationModeRef.current === 'native') {
                nativeServiceRef.current?.interrupt()
                setIsSpeaking(false)
                isSpeakingRef.current = false
                return
              }
              geminiClient.stopSpeaking()
              setIsSpeaking(false)
              isSpeakingRef.current = false
            }}
            onToggleMute={() => {
              if (conversationModeRef.current === 'native') {
                setIsMuted((prev) => {
                  const next = !prev
                  if (next) {
                    nativeServiceRef.current?.stopMic()
                  } else {
                    nativeServiceRef.current?.startMic().catch(() => {})
                  }
                  return next
                })
                return
              }
              handleMuteToggle()
            }}
            onToggleSpeaker={handleToggleSpeaker}
            onEndCall={() => {
              nativeServiceRef.current?.disconnect()
              nativeServiceRef.current = null
              handleEndCallRequest()
            }}
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
            const id = `live-${Date.now()}-${Math.random()}`
            const msg: ConversationMessage = {
              id,
              text,
              isUser: role === 'user',
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, msg])
            // Teach + remember from the user's spoken turn (background, soft-fail).
            if (role === 'user') {
              handleVoiceUserTurnRef.current(text, id)
            }
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
      />

      <SessionRecapDialog
        isOpen={!!recapData}
        corrections={recapData?.corrections ?? []}
        durationSeconds={recapData?.durationSeconds ?? 0}
        levelUp={recapData?.levelUp ?? null}
        onAcceptLevelUp={handleAcceptLevelUp}
        onClose={handleCloseRecap}
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
    : getStartingSeedForLevel(prefs.talkingoLevel ?? 5)
  return {
    talkingoLevel: prefs.talkingoLevel ?? 5,
    topic: prefs.topic,
    correctionStyle: prefs.correctionStyle,
    persona: prefs.persona,
    userName: userName ?? prefs.userName,
    targetLanguage: prefs.targetLanguage,
    nativeLanguage: prefs.nativeLanguage,
    learningGoal: prefs.learningGoal,
    currentUnitId: startingUnit.id,
    preferredScript: prefs.preferredScript,
  }
}
