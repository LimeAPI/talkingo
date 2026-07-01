'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { TranscriptMessage } from './TranscriptMessage'
import { WelcomeModal } from '../dialogs/WelcomeModal'
import { ChatComposer } from './ChatComposer'
import { HandsfreeBar } from './HandsfreeBar'
import { TopControlBar } from './TopControlBar'
import { ServiceErrorBanner, type ServiceErrorType } from '../feedback/ServiceErrorBanner'
import { EndCallDialog } from '../dialogs/EndCallDialog'
import { HomeShell } from '../layout/HomeShell'
import type { HomeTab } from '../layout/BottomNav'
import type { LearningMode, InputMethod } from '../layout/TalkScreen'
import { NativeRewriteDialog } from '../dialogs/NativeRewriteDialog'
import { SessionRecapDialog } from '../dialogs/SessionRecapDialog'
import { MicErrorToast } from '../feedback/MicErrorToast'
import { geminiClient, GeminiServiceError, type MicErrorKind } from '@/lib/api/gemini-client'
import { createLiveCallService, type LiveCallService } from '@/lib/api/live-client'
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
import { isSubscribed, verifySubscription, needsServerVerification, syncFromAccountPrefs, isExpired, isPastDue, getSubscriptionInfo } from '@/lib/subscription/use-subscription'
import { FREE_TIER, getDailyUsage, incrementMessageCount, getRemainingMessages, hasReachedDailyLimit, isPersonaAllowed, isModeAllowed, isLevelAllowed } from '@/lib/subscription/free-tier'
import { capLevelForUser, resolveAllowedPersona, isLevelAllowedForUser } from '@/lib/subscription/entitlements'
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
import { saveSessionReport } from '@/lib/storage/session-reports'
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
import { getLanguageMeta } from '@talkingo/shared/languages'
import { recordLessonAttempt, type LessonStatus } from '@/lib/storage/lesson-progress'
import { mergePathProgressOnLoad, captureActiveProgress, switchLanguageProgress } from '@/lib/storage/path-sync'
import { recordSessionStat, deriveLanguageProgress } from '@/lib/storage/learning-stats'
import {
  loadLocalLifeline,
  saveLocalLifeline,
  loadLocalUserNote,
  saveLocalUserNote,
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
import { buildPlannerInjection, buildMemoryInjection, computePlannerTargets, getLatestSessionProgress } from '@/lib/storage/structured-memory'
import {
  createSessionCoach,
  observeUserTurn,
  registerCorrections,
  computeNudge,
  summarizeCoach,
  addCoachTargets,
  type SessionCoach,
} from '@/lib/learning/session-coach'
import { useAuth } from '@/context/AuthContext'
import { useScriptPreference } from '@/lib/hooks/use-script-preference'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { MicOff } from 'lucide-react'


type View = 'loading' | 'welcome' | 'home' | 'in-call'

/**
 * Unescape a JSON string fragment mid-stream. The streamed reply is partial
 * JSON, so we can't JSON.parse it yet — but we still want clean text in the
 * bubble as it arrives. Handles the standard escapes plus \uXXXX so stray
 * backslashes/tabs/unicode don't flash on screen before the final parse.
 */
function unescapeJsonStringFragment(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_m, esc: string) => {
    switch (esc[0]) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case 'b': return '\b'
      case 'f': return '\f'
      case '"': return '"'
      case '\\': return '\\'
      case '/': return '/'
      case 'u': return String.fromCharCode(parseInt(esc.slice(1), 16))
      default: return esc
    }
  })
}

export function ConversationPage() {
  const { user, loading: authLoading, refresh: refreshAuth } = useAuth()

  // ── Top-level view ───────────────────────────────────────────────────────
  const [view, setView] = useState<View>('loading')
  const [forceWelcome, setForceWelcome] = useState(false) // re-onboarding from home
  // Home tab lives here (not in HomeShell) so it survives entering a session
  // and returning — the learner lands back where they were, not on Talk.
  const [homeTab, setHomeTab] = useState<HomeTab>('talk')

  // ── Conversation state ──────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [interimTranscript, setInterimTranscript] = useState('')
  const [conversationState, setConversationState] = useState<ConversationState>({
    talkingoLevel: 5,
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
    /** True when shown on return for a session the user closed before finishing. */
    isWelcomeBack?: boolean
    /** Felt-progress numbers surfaced from the deterministic memory engine. */
    progress?: {
      wordsUsed: number
      wordsIntroduced: number
      sentenceTrend: 'up' | 'flat' | 'down' | null
      selfFixes?: number
    }
    /** Outcome of the scenario the learner just practiced (path scenarios only). */
    lessonOutcome?: { status: LessonStatus; title: string } | null
  } | null>(null)
  const currentScenarioRef = useRef<string | null>(null)
  /** True once the AI has signalled the learner has handled the current scenario
   *  (the `unitComplete` mastery signal). Reset at the start of each session. */
  const unitCompleteSeenRef = useRef<boolean>(false)
  const sessionTitleRef = useRef<string>('Free Talk')
  const [callDuration, setCallDuration] = useState(0)
  // Bumped after a session ends so derived stats (streak/sessions/minutes) refresh.
  const [statsRefresh, setStatsRefresh] = useState(0)
  // Live per-language progress (streak/sessions/minutes + completed lessons),
  // recomputed when the language changes or a session finishes.
  const languageProgress = useMemo(
    () => deriveLanguageProgress(user?.id ?? null, preferences),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, preferences?.targetLanguage, preferences?.talkingoLevel, statsRefresh],
  )

  // ── Auto-save session tracking ──────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const messagesRef = useRef<ConversationMessage[]>([]) // Always-current ref for saves

  // ── Learning system ────────────────────────────────────────────────

  // Session-only collected data for recap
  const [sessionCorrections, setSessionCorrections] = useState<Correction[]>([])
  const recentCorrectionCountsRef = useRef<number[]>([])
  /** Live within-session teaching coach (gentle "circle back" nudges). Null
   *  between sessions; created at session start, cleared at session end. */
  const sessionCoachRef = useRef<SessionCoach | null>(null)
  const nativeServiceRef = useRef<LiveCallService | null>(null)
  /** Tracks the in-progress live/native transcript turn so we can merge text
   *  and analyze the COMPLETE utterance (not just the last streamed chunk). */
  const nativeTurnRef = useRef<{ id: string; text: string; isUser: boolean } | null>(null)
  /** Latest finalized-or-streaming user utterance, used as a fallback so the
   *  teaching analysis still runs if the Live API never flags the turn "final". */
  const lastUserTurnRef = useRef<{ id: string; text: string } | null>(null)
  /** Ids of user turns already sent for analysis — prevents double-analysis when
   *  both the `final` flag AND `turn_complete` fire for the same utterance. */
  const analyzedTurnIdsRef = useRef<Set<string>>(new Set())

  // ── Cross-session memory ───────────────────────────────────────────
  const [memoryLifeline, setMemoryLifeline] = useState<string>('')
  const [userNote, setUserNote] = useState<string>('')
  const turnCountRef = useRef(0)
  const lastSavedMemoryRef = useRef<string>('') // last AI highlight (→ session highlight)

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
    // We intentionally do NOT sync this paragraph to Appwrite. The remote
    // `memoryLifeline` field is owned exclusively by the structured-memory JSON
    // (synced once at session end), so the paragraph and the structured blob can
    // no longer race and clobber each other cross-device. The paragraph still
    // persists remotely — it rides along as the session highlight inside the
    // structured memory.
  }

  // Mic error toast
  const [micError, setMicError] = useState<{ kind: MicErrorKind; detail?: string } | null>(null)
  // Mic paused due to inactivity
  const [showMicPausedToast, setShowMicPausedToast] = useState(false)

  // Native rewrite dialog ("Say it like a native")
  const [rewriteDialog, setRewriteDialog] = useState<{ phrase: string; context?: string } | null>(null)

  // Subscription / paywall
  const [showedPaywall, setShowedPaywall] = useState(false)
  // Initialize as false — will be set correctly once user loads (avoids reading wrong localStorage key)
  const [isSubscribedCheck, setIsSubscribedCheck] = useState(false)

  // Upgrade prompt (shown when free users hit a limit)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null)
  const [remainingMessages, setRemainingMessages] = useState<number>(FREE_TIER.LIFETIME_MESSAGES)

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
      // Don't fake a status/plan here. CheckoutReturnHandler confirms the REAL
      // snapshot (trial vs monthly vs yearly) via sync-checkout/status polling
      // and persists it. We only optimistically unlock the UI — server-side
      // gates still enforce real entitlement, so this can't grant unpaid access.
      setIsSubscribedCheck(true)
      setShowedPaywall(true)
      setShowCheckoutReturn(true)
      return
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

  // Settings state (lifted so HomeShell/ProfileScreen can use them)
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
  /** Monotonic token for staggered multi-bubble delivery. Bumped whenever a new
   *  turn begins so any in-flight delayed parts from a previous reply abort
   *  instead of popping in late / out of order. */
  const partDeliveryRef = useRef(0)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  // Measured height of the pinned bottom bar (chat composer / hands-free bar).
  // Drives the transcript's bottom padding so the latest message always clears
  // the bar — replaces the old hardcoded pb-[240px] that broke when the bar grew.
  const [composerHeight, setComposerHeight] = useState(140)

  const stateRef = useRef(conversationState)
  const conversationModeRef = useRef(conversationMode)
  const isMutedRef = useRef(isMuted)
  const isSpeakerMutedRef = useRef(isSpeakerMuted)
  const isSpeakingRef = useRef(isSpeaking)
  const isProcessingRef = useRef(false)
  const viewRef = useRef<View>(view)
  // Mirrors of the values startSession reads. startSession is a memoized
  // callback that doesn't list these in its deps (to avoid rebuilding the big
  // handler), so reading them via refs keeps them fresh — otherwise a toggle
  // like Free→Practice or freshly-computed planner targets wouldn't take effect
  // until some unrelated dependency happened to change.
  const learningModeRef = useRef(learningMode)
  const plannerInjectionRef = useRef(plannerInjection)
  const memoryLifelineRef = useRef(memoryLifeline)
  const userNoteRef = useRef(userNote)

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
  useEffect(() => { learningModeRef.current = learningMode }, [learningMode])
  useEffect(() => { plannerInjectionRef.current = plannerInjection }, [plannerInjection])
  useEffect(() => { memoryLifelineRef.current = memoryLifeline }, [memoryLifeline])
  useEffect(() => { userNoteRef.current = userNote }, [userNote])

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

      // Use unified onboarding check (server-first logic)
      const onboarded = shouldSkipOnboarding(prefs, user?.id)

      if (prefs && onboarded) {
        // Validate Talkingo Level/LanguageLevel consistency and fix if needed.
        // The canonical level band is derived from the numeric Talkingo level;
        // if the stored language level drifted out of sync, correct it.
        const expectedLevel = talkingoLevelToLanguageLevel(prefs.talkingoLevel as any)
        if (prefs.talkingoLevel && prefs.level && prefs.level !== expectedLevel) {
          // Fix the inconsistency by updating level to match Talkingo Level
          prefs.level = expectedLevel
          // Save the corrected preferences
          await savePreferences(user?.id ?? null, prefs, !!user)
        }

        setPreferences(prefs)
        const newState: ConversationState = stateFromPrefs(prefs, user?.displayName)
        setConversationState(newState)
        stateRef.current = newState
        geminiClient.setLanguage(prefs.targetLanguage, prefs.nativeLanguage, capLevelForUser(user?.id, prefs.talkingoLevel))

        // ── Restore scenario-path progress from the synced per-language code ──
        // Merges any progress made on another device into this device's store
        // (ratchets up only), then writes the merged code back so it propagates.
        try {
          const { pathProgress, changed } = mergePathProgressOnLoad(prefs)
          if (changed) {
            prefs.pathProgress = pathProgress
            setPreferences({ ...prefs })
            void savePreferences(user?.id ?? null, prefs, !!user)
          }
        } catch { /* non-critical — local progress still intact */ }

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
          warmupState.talkingoLevel = capLevelForUser(user?.id, warmupState.talkingoLevel)
          warmupState.persona = resolveAllowedPersona(user?.id, warmupState.persona)
          geminiClient.generateOpener(warmupState, user?.displayName)
            .then((res) => { if (!cancelled) warmupOpenerRef.current = res })
            .catch(() => {}) // silent — warmup is best-effort
        }
      } else {
        setView('welcome')
      }
    })()
    return () => { cancelled = true }
  }, [user, authLoading])

  // Call duration timer — starts as soon as the call/session is active so
  // connecting time and silent calls aren't shown as 00:00.
  useEffect(() => {
    if (view === 'in-call') {
      const interval = setInterval(() => setCallDuration((d) => d + 1), 1000)
      return () => clearInterval(interval)
    }
  }, [view])

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
  }, [messages])

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
      // Process the interrupted session into structured memory so we don't lose
      // vocabulary tracking, error patterns, and session history data.
      try {
        const updatedMemory = processAndSaveSessionEnd(user?.id ?? null, {
          messages: recovered.messages,
          scenarioId: recovered.scenarioId || 'free-talk',
          title: recovered.title || 'Recovered session',
          duration: recovered.durationSeconds || 0,
          memoryHighlight: '', // No AI highlight available for interrupted sessions
          targetLanguage: recovered.targetLanguage as TargetLanguage,
        })
        structuredMemoryRef.current = updatedMemory
        setPlannerInjection(buildPlannerInjection(updatedMemory))

        // The user closed the app before reaching the natural end, so they never
        // saw a recap. Don't silently swallow that session: persist a History
        // report AND surface a gentle "welcome back" recap on return so their
        // progress is always acknowledged exactly once (recoverActiveSessions
        // flips the session to 'ended', so it won't resurface on the next open).
        const recoveredUserTurns = recovered.messages.filter((m) => m.isUser).length
        if (recoveredUserTurns > 0) {
          const recoveredCorrections: Correction[] = []
          for (const m of recovered.messages) {
            if (m.isUser && m.corrections?.length) recoveredCorrections.push(...m.corrections)
          }
          const latest = updatedMemory.sessions[updatedMemory.sessions.length - 1]
          try {
            saveSessionReport(user?.id ?? null, {
              date: Date.now(),
              title: recovered.title || 'Recovered session',
              scenarioId: recovered.scenarioId || 'free-talk',
              targetLanguage: (recovered.targetLanguage as TargetLanguage) || 'en',
              persona: (recovered.personaId as PersonaId) || 'eli',
              level: Number(recovered.level) || 5,
              durationSeconds: recovered.durationSeconds || 0,
              userTurns: recoveredUserTurns,
              corrections: recoveredCorrections,
              newVocab: latest?.newVocab ?? [],
            })
          } catch { /* History report is best-effort */ }

          const progress = getLatestSessionProgress(updatedMemory)
          setRecapData({
            corrections: recoveredCorrections,
            durationSeconds: recovered.durationSeconds || 0,
            isWelcomeBack: true,
            progress: progress
              ? {
                  wordsUsed: progress.wordsUsed,
                  wordsIntroduced: progress.wordsIntroduced,
                  sentenceTrend: progress.sentenceTrend,
                }
              : undefined,
          })
        }
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

  // ── Mic control (on-device speech-to-text → streamed text reply) ─────────
  // Voice input uses the browser's on-device speech recognition (Web Speech
  // API). Recognized text is sent through the SAME streaming text pipeline as
  // typing (handleUserInput), so voice messages are as fast as text and there's
  // a single, simple code path. No audio is uploaded to the server.
  //
  //  • manual (chat): tap mic → dictate (live text shown) → tap stop → send
  //  • handsfree:     mic auto-listens; each finished utterance auto-sends and
  //                   the mic re-arms after the reply (or its voice note) ends
  const dictationFinalRef = useRef('')    // finalized text accumulated this turn
  const dictationInterimRef = useRef('')  // latest interim text (mirror of state)

  const startMic = useCallback(async () => {
    if (isMutedRef.current) return
    if (userManuallyMutedRef.current) return // Respect user's manual mute

    // ── Free tier: check message limit before listening ───────────────────
    if (!isSubscribed(user?.id) && hasReachedDailyLimit(user?.id)) {
      setUpgradeReason('messages')
      return
    }

    dictationFinalRef.current = ''
    dictationInterimRef.current = ''
    setInterimTranscript('')
    setIsListening(true)
    pipelineStateRef.current = 'recording'

    // Bias recognition toward the language the learner is most likely to speak
    // at their level (the client picks primary/fallback locales).
    geminiClient.setLanguage(
      stateRef.current.targetLanguage,
      stateRef.current.nativeLanguage,
      stateRef.current.talkingoLevel
    )

    await geminiClient.startListening((text, isFinal) => {
      if (isFinal) {
        const utterance = text.trim()
        if (conversationModeRef.current === 'handsfree') {
          // Hands-free has no explicit "send" control, so each finished
          // utterance is sent automatically; the mic re-arms after the reply.
          dictationInterimRef.current = ''
          setInterimTranscript('')
          if (utterance) {
            geminiClient.stopListening()
            setIsListening(false)
            pipelineStateRef.current = 'idle'
            handleUserInputRef.current(utterance)
          }
        } else {
          // Manual: accumulate across pauses; the user sends by tapping stop.
          dictationFinalRef.current = `${dictationFinalRef.current} ${utterance}`.trim()
          dictationInterimRef.current = ''
          setInterimTranscript(dictationFinalRef.current)
        }
      } else {
        dictationInterimRef.current = text
        setInterimTranscript(`${dictationFinalRef.current} ${text}`.trim())
      }
    })
  }, [user])

  const stopMic = useCallback(() => {
    setIsListening(false)
    setInterimTranscript('')
    dictationFinalRef.current = ''
    dictationInterimRef.current = ''
    pipelineStateRef.current = 'idle'
    geminiClient.stopListening()
  }, [])

  /** Stop listening and send the dictated text through the streaming pipeline. */
  const stopMicAndSend = useCallback(() => {
    geminiClient.stopListening()
    setIsListening(false)
    pipelineStateRef.current = 'idle'
    const combined = `${dictationFinalRef.current} ${dictationInterimRef.current}`.trim()
    dictationFinalRef.current = ''
    dictationInterimRef.current = ''
    setInterimTranscript('')
    if (combined) handleUserInputRef.current(combined)
  }, [])

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
    // Only CHECK the limit here. The usage counter is incremented *after* a
    // successful reply (further below), mirroring the voice path. Incrementing
    // up-front burned a message whenever the request errored out — the server
    // only counts successes, so the client drifted ahead and over-charged.
    if (!isSubscribed(user?.id) && hasReachedDailyLimit(user?.id)) {
      setUpgradeReason('messages')
      return
    }

    isProcessingRef.current = true
    setIsProcessing(true)
    setIsListening(false)
    geminiClient.stopListening()

    // New turn → invalidate any still-pending staggered parts from the
    // previous reply so they can't pop in after this message.
    const deliveryToken = ++partDeliveryRef.current

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
      const easeUp = errorRate > 0.6
      let stateForCall = easeUp
        ? { ...stateRef.current, _adaptiveHint: 'high-error-rate' as const }
        : stateRef.current

      // ── Live teaching coach ───────────────────────────────────────────
      // Observe what the learner just said (marks produced target words + any
      // self-fixes), then maybe add ONE gentle "circle back" nudge for the AI's
      // next reply. We NEVER nudge while the learner is struggling (easeUp) —
      // comfort takes priority over pushing.
      const coach = sessionCoachRef.current
      if (coach) {
        observeUserTurn(coach, userText)
        if (!easeUp) {
          const nudge = computeNudge(coach)
          if (nudge) stateForCall = { ...stateForCall, _coachNudge: nudge }
        }
      }

      const result = await geminiClient.processUserMessageStreaming(
        userText,
        stateForCall,
        stateRef.current.userName,
        // Stream callback — update the AI message text progressively
        (partialJson) => {
          // Try to extract the "response" field from partial JSON
          const match = partialJson.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)/)
          if (match) {
            const partialText = unescapeJsonStringFragment(match[1])
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

      // The voice note (requested below) covers the WHOLE reply and is attached
      // to the LAST bubble we deliver. We don't pre-seed an audio 'loading'
      // state here — requestAudioForMessage sets it itself — which also removes
      // a stale read of `messages.length` from this callback's closure.
      const aiMessage: ConversationMessage = {
        id: streamingMsgId,
        text: result.aiResponse,
        isUser: false,
        timestamp: Date.now(),
        keyWords: result.keyWords,
      }

      // Bubble that the voice note attaches to. For a single reply it's the
      // streaming bubble; for a split reply it advances to the last part below
      // so the audio lines up with the end of the reply AND auto-play (which
      // only ever targets the last AI message) can actually trigger it.
      let audioTargetId = streamingMsgId

      // Multi-bubble delivery for multi-thought responses
      const hasMultipleParts = result.responseParts && result.responseParts.length >= 2
      if (hasMultipleParts) {
        // First bubble: replace the streaming placeholder with the first part
        const firstPart: ConversationMessage = {
          id: streamingMsgId,
          text: result.responseParts![0],
          isUser: false,
          timestamp: Date.now(),
          keyWords: result.keyWords,
        }
        setMessages((prev) => prev.map((m) => m.id === streamingMsgId ? firstPart : m))

        // Deliver subsequent parts with staggered delays (800-1200ms)
        const remainingParts = result.responseParts!.slice(1)
        for (let i = 0; i < remainingParts.length; i++) {
          const delay = 800 + Math.random() * 400 // 800-1200ms delay
          await new Promise((resolve) => setTimeout(resolve, delay))
          // Abort if a newer turn started while we were waiting — prevents
          // stale parts landing after the user's next message.
          if (partDeliveryRef.current !== deliveryToken) break
          const partId = `${streamingMsgId}-part-${i + 1}`
          const partMessage: ConversationMessage = {
            id: partId,
            text: remainingParts[i],
            isUser: false,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, partMessage])
          // This is now the last visible bubble — the voice note attaches here.
          audioTargetId = partId
        }
      } else {
        setMessages((prev) => prev.map((m) => m.id === streamingMsgId ? aiMessage : m))
      }

      if (result.corrections.length > 0) setSessionCorrections((prev) => [...prev, ...result.corrections])

      // Track correction count for this turn (for errorRate signal)
      recentCorrectionCountsRef.current = [
        ...recentCorrectionCountsRef.current.slice(-4),
        result.corrections.length,
      ]

      // Feed this turn's corrections to the coach so it can re-elicit those
      // forms on a later turn (the "second chance" loop).
      if (coach && result.corrections.length > 0) {
        registerCorrections(coach, result.corrections)
      }

      // Track the real target words the AI just introduced so the coach can
      // gently nudge the learner to actually use them on a later turn.
      if (coach) addCoachTargets(coach, result.keyWords)

      // ── Capture the AI mastery signal for this scenario ──────────────
      // When the AI judges the learner has handled this scenario, remember it.
      // Combined with the turn floor at end-of-call, it drives the 3-state gate.
      if (result.unitComplete) unitCompleteSeenRef.current = true

      // ── Capture memory update ────────────────────────────────────────
      turnCountRef.current++
      captureMemoryUpdate(result.memoryUpdate)

      setIsProcessing(false)
      isProcessingRef.current = false
      setServiceError(null)

      // Count the message now that the reply succeeded (free tier). The server
      // is authoritative and counts successes only; this keeps the client
      // counter in sync without charging for failed requests.
      if (!isSubscribed(user?.id)) {
        const updated = incrementMessageCount(user?.id)
        setRemainingMessages(FREE_TIER.LIFETIME_MESSAGES - updated.messageCount)
      }

      // Chat modes → fire-and-forget voice note. Other modes → blocking speak.
      if (conversationModeRef.current === 'manual' || conversationModeRef.current === 'handsfree') {
        if (voiceNotesEnabledRef.current) {
          const persona = getPersonaById(stateRef.current.persona || 'eli')
          requestAudioForMessage(audioTargetId, result.aiResponse, persona?.voiceName)
        } else if (conversationModeRef.current === 'handsfree' && !isMutedRef.current) {
          // Hands-free with no voice note to wait on — re-arm listening now.
          setTimeout(() => startMic(), 300)
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

      // Free-tier daily limit hit (server is authoritative) → show the upgrade
      // prompt instead of a generic error banner, and don't offer a retry.
      if (err instanceof GeminiServiceError && err.type === 'free_limit_reached') {
        setUpgradeReason('messages')
        return
      }

      const errorType: ServiceErrorType =
        err instanceof GeminiServiceError
          ? (err.type === 'free_limit_reached' || err.type === 'upgrade_required' ? 'rate_limited' : err.type)
          : !navigator.onLine ? 'network' : 'ai_unavailable'

      setServiceError(errorType)
      pendingRetryRef.current = () => handleUserInputRef.current(userText)
    }
  }, [speakAndResume, requestAudioForMessage, user, startMic])

  const handleUserInputRef = useRef(handleUserInput)
  useEffect(() => { handleUserInputRef.current = handleUserInput }, [handleUserInput])

  // ── Voice-turn teaching: analyze each finalized user utterance in a live call ──
  // The Live API only streams audio, so it can't return corrections. After each
  // user turn we run a cheap text analysis in the background → corrections +
  // memory + wrong-language/script fixes. Soft-fails so it never disrupts the call.
  const handleVoiceUserTurn = useCallback(async (text: string, messageId?: string) => {
    const clean = text?.trim()
    if (!clean || clean.length < 2) return
    // Dedup: each user utterance is analyzed at most once, whether it was
    // triggered by the `final` flag or the `turn_complete` fallback.
    if (messageId) {
      if (analyzedTurnIdsRef.current.has(messageId)) return
      analyzedTurnIdsRef.current.add(messageId)
      // Keep the set from growing unbounded over a very long call.
      if (analyzedTurnIdsRef.current.size > 200) {
        analyzedTurnIdsRef.current = new Set(
          Array.from(analyzedTurnIdsRef.current).slice(-100)
        )
      }
    }
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
      // Capture the AI mastery signal if the voice analyzer surfaced one.
      if ((result as { unitComplete?: boolean }).unitComplete) unitCompleteSeenRef.current = true
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

    // Start opener generation immediately so it overlaps WS connect + mic setup
    // (cuts the delay before the AI's first spoken words). Soft-fails to a
    // localized greeting in the user's target language.
    const openerPromise: Promise<string> = geminiClient
      .generateOpener(stateRef.current, stateRef.current.userName)
      .then((res) => res.aiResponse)
      .catch(() => getLanguageMeta(stateRef.current.targetLanguage).sampleHello)

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
        if (isUser) {
          // Always remember the latest user utterance so the teaching analysis
          // can still run on `turn_complete` even if `final` never arrives.
          lastUserTurnRef.current = { id, text: mergedText }
          if (event.final) {
            handleVoiceUserTurnRef.current(mergedText, id)
            nativeTurnRef.current = null // next user utterance starts a fresh bubble
          }
        }
      },
      onTurnComplete: () => {
        // Fallback teaching trigger: the Live API's `final` flag is unreliable,
        // so when the model finishes its turn we analyze the most recent user
        // utterance too. Deduped by id, so this never double-counts.
        const pending = lastUserTurnRef.current
        if (pending && pending.text.trim().length >= 2) {
          handleVoiceUserTurnRef.current(pending.text, pending.id)
        }
      },
      onInterrupted: () => {
        // The model was cut off. Reset the turn tracker so the next transcript
        // (the user's barge-in, or the model's fresh reply) starts a CLEAN
        // bubble — otherwise new text merged into the interrupted bubble, which
        // is then auto-removed, deleting the new message too.
        nativeTurnRef.current = null
        // Replace the last incomplete AI message with a brief interruption
        // marker that auto-fades, instead of silently deleting it. The marker
        // gets its OWN id so nothing can merge into it before it's removed.
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && !last.isUser) {
            const markerId = `interrupted-${Date.now()}`
            const interruptedMsg = {
              ...last,
              id: markerId,
              text: '…',
              isInterruption: true,
            }
            setTimeout(() => {
              setMessages((p) => p.filter((m) => m.id !== markerId))
            }, 1500)
            return [...prev.slice(0, -1), interruptedMsg]
          }
          return prev
        })
      },
      onThinking: (thinking) => {
        // User's turn ended, model hasn't started speaking — show the thinking
        // cue (HandsfreeBar reads isProcessing) so the gap doesn't look frozen.
        setIsProcessing(thinking)
      },
      onError: (msg) => {
        console.error('[Native] Live service error:', msg)
        setServiceError('ai_unavailable')
        setIsProcessing(false)
      },
      onUsageLimit: () => {
        // Daily live-voice cap reached in native (call-only) mode. Drop the user
        // straight into unlimited text chat rather than dead-ending the session.
        nativeServiceRef.current?.disconnect()
        setInputMethod('text')
      },
    })

    service
      .connect(conversationState)
      .then(async () => {
        await service.startMic()
        // Kick off opener generation in parallel with mic setup. It's memory-,
        // level- and language-aware (same builder as chat). Falls back to a
        // localized greeting in the target language — never hardcoded English.
        const openerText = await openerPromise
        service.sendText(openerText)
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
      lastUserTurnRef.current = null
      analyzedTurnIdsRef.current = new Set()
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
    // Free-tier normalization: a free account must never be seeded above the
    // free level cap or with a premium tutor (the placement test / manual
    // picker / goal defaults can all produce these). Subscribed users pass
    // through untouched (the caps are no-ops for them). We only rewrite the
    // starting scenario when the level actually changed, so we don't disturb a
    // normal completion.
    const requestedLevel = prefs.talkingoLevel ?? 5
    const cappedLevel = capLevelForUser(user?.id, requestedLevel)
    const normalizedPersona = resolveAllowedPersona(user?.id, prefs.persona)
    const completed: UserPreferences = {
      ...prefs,
      talkingoLevel: cappedLevel,
      level: talkingoLevelToLanguageLevel(cappedLevel as any),
      persona: normalizedPersona,
      onboardingComplete: true,
    }
    if (cappedLevel !== requestedLevel) {
      completed.currentUnitId = getStartingSeedForLevel(cappedLevel).id
    }
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

    // ── Free tier: voice/live is premium-only ─────────────────────────────
    // If a free user picked a voice mode, surface the upgrade prompt instead of
    // silently downgrading them to a text chat (which was confusing — they
    // asked for a call and got typing with no explanation). Use the ref so the
    // check always reflects the latest mode, not a stale closure value.
    if (!isSubscribed(user?.id) && !isModeAllowed(conversationModeRef.current)) {
      setUpgradeReason('mode')
      return
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

    // ── Free-tier level gate ──────────────────────────────────────────────
    // Block starting a curriculum scenario that sits above the free level cap.
    // Free Talk / custom scenarios run at the learner's own (capped) level, so
    // they're always allowed. No-op for subscribers.
    if (scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')) {
      const seed = getSeedById(scenarioId)
      if (seed && !isLevelAllowedForUser(user?.id, seed.level)) {
        setUpgradeReason('level')
        return
      }
    }

    const newState = stateFromPrefs(prefs, user?.displayName)
    // Safety net: never run the engine above the free level cap or with a
    // premium tutor, no matter how prefs were seeded. No-op for subscribers.
    newState.talkingoLevel = capLevelForUser(user?.id, newState.talkingoLevel)
    newState.persona = resolveAllowedPersona(user?.id, newState.persona)

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
    const noteText = userNoteRef.current
    const structured = structuredMemoryRef.current
    const freeTalkMemory = structured ? buildMemoryInjection(structured) : ''

    if (learningModeRef.current === 'practice' && plannerInjectionRef.current) {
      newState.practiceTargets = plannerInjectionRef.current
    } else if (freeTalkMemory) {
      newState.practiceTargets = freeTalkMemory
    } else if (memoryLifelineRef.current) {
      newState.memoryLifeline = memoryLifelineRef.current
    }
    // userNote is already folded into the injections above; only add separately
    // when neither injection fired.
    if (noteText && !newState.practiceTargets) newState.userNotes = noteText
    turnCountRef.current = 0

    // ── Seed the live teaching coach with this session's focus words ────────
    // Cross-session dormant vocab (words introduced but not yet produced) plus
    // this scenario's target vocab. The coach watches for these mid-session and
    // gently nudges the AI to create natural openings for the unused ones.
    try {
      const mem = structuredMemoryRef.current
      const dormant = mem ? computePlannerTargets(mem).dormantVocab.map((v) => v.word) : []
      const coachSeed =
        scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')
          ? getSeedById(scenarioId)
          : null
      sessionCoachRef.current = createSessionCoach([...dormant, ...(coachSeed?.targetVocab ?? [])])
    } catch {
      sessionCoachRef.current = createSessionCoach([])
    }

    setConversationState(newState)
    stateRef.current = newState
    geminiClient.setLanguage(newState.targetLanguage, newState.nativeLanguage, newState.talkingoLevel)
    geminiClient.resetHistory()

    setMessages([])
    setSessionCorrections([])
    setCallDuration(0)
    setIsProcessing(true)
    setView('in-call')

    // Track scenario for module completion tracking
    if (scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')) {
      currentScenarioRef.current = scenarioId
    } else {
      currentScenarioRef.current = null
    }
    // Fresh mastery signal for this session.
    unitCompleteSeenRef.current = false

    // ── Create auto-save session ──────────────────────────────────────────
    const sessionSeed = scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')
      ? getSeedById(scenarioId) : null
    const sessionTitle = customScenarioPrompt
      ? 'Custom Scenario'
      : sessionSeed?.title ?? 'Free Talk'
    // Remember the human-readable title for the end-of-session report (the
    // structured-memory title was derived from the default topic and was wrong).
    sessionTitleRef.current = sessionTitle
    const newSessionId = createChatSession(user?.id ?? null, {
      mode: conversationModeRef.current as SessionMode,
      personaId: (newState.persona ?? 'eli') as PersonaId,
      targetLanguage: newState.targetLanguage ?? 'en',
      title: sessionTitle,
      level: String(newState.talkingoLevel ?? 5),
      scenarioId,
    })
    setActiveSessionId(newSessionId)

    try {
      // Live voice modes generate AND speak their own opener:
      //  - 'native' → LiveCallService opener via system instruction
      //  - 'live'   → LiveCallView sends buildOpenerPrompt on connect
      // Generating a text opener here too would waste an API call and leave a
      // phantom first line in the saved transcript that the user never heard.
      if (conversationModeRef.current === 'native' || conversationModeRef.current === 'live') {
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
      } else {
        // When resuming a real scenario (the "Continue / pick up where you left
        // off" path), tell the opener to greet like we're returning to the topic
        // together. Transient flag — not stored on the persisted state.
        const isResume = mode === 'continue'
          && scenarioId !== 'free-talk'
          && !scenarioId.startsWith('custom-')
        const openerState = isResume ? { ...newState, _resumeScenario: true } : newState
        opener = await geminiClient.generateOpener(openerState, user?.displayName)
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
      if (err instanceof GeminiServiceError && err.type === 'free_limit_reached') {
        setUpgradeReason('messages')
        return
      }
      const errorType: ServiceErrorType =
        err instanceof GeminiServiceError
          ? (err.type === 'free_limit_reached' || err.type === 'upgrade_required' ? 'rate_limited' : err.type)
          : !navigator.onLine ? 'network' : 'ai_unavailable'
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
    }
    
    // If the target language is changing, swap the local path store: stash the
    // current language's progress under its code, then load the new language's
    // progress into the local store so each language keeps its own path.
    const langChanged = changes.targetLanguage && changes.targetLanguage !== preferences.targetLanguage
    if (langChanged) {
      try {
        updatedPrefs.pathProgress = switchLanguageProgress(preferences, changes.targetLanguage as string)
      } catch { /* non-critical — local store unchanged */ }
    }

    // Apply other changes
    Object.assign(updatedPrefs, changes)
    
    setPreferences(updatedPrefs)
    savePreferences(user?.id ?? null, updatedPrefs, !!user)

    // Update conversation state to reflect changes immediately
    const newState = stateFromPrefs(updatedPrefs, user?.displayName)
    setConversationState(newState)
    stateRef.current = newState

    // If target language OR level changed, update the gemini client so the
    // browser speech recognition uses the right primary/fallback languages.
    if (
      (changes.targetLanguage && changes.targetLanguage !== preferences.targetLanguage) ||
      (changes.talkingoLevel && changes.talkingoLevel !== preferences.talkingoLevel)
    ) {
      geminiClient.setLanguage(
        (changes.targetLanguage ?? preferences.targetLanguage) as any,
        (changes.nativeLanguage ?? preferences.nativeLanguage) as any,
        (changes.talkingoLevel ?? preferences.talkingoLevel) as any
      )
    }
  }, [preferences, user])

  // ── Re-assess level (triggers onboarding conversation) ───────────────────
  const handleReassess = useCallback(() => {
    setForceWelcome(true)
    // Note: The WelcomeModal will detect existing preferences and skip setup
  }, [])

  // ── Manual level-up from the Learn page path ──────────────────────────────
  // The learner advances by completing their current level's scenarios, then
  // tapping "Level Up". Promotion-only; reuses the standard level-change flow.
  const handleLevelUp = useCallback((newLevel: number) => {
    const clamped = Math.max(1, Math.min(12, Math.round(newLevel)))
    // Free users can progress through the path up to the free level cap; advancing
    // beyond it requires upgrading (matches the level gate used everywhere else).
    if (!isSubscribed(user?.id) && !isLevelAllowed(clamped)) {
      setUpgradeReason('level')
      return
    }
    handleLearningPrefsChange({ talkingoLevel: clamped })
  }, [handleLearningPrefsChange, user])

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

    // ── Smart scenario completion (3-state, Rule B) ───────────────────────
    // Record this attempt against the scenario. It only becomes "done" when the
    // learner actually spoke enough AND there's a mastery signal — otherwise it
    // stays "practicing" so the learner is nudged to talk more.
    let lessonOutcome: { status: LessonStatus; title: string } | null = null
    if (currentScenarioRef.current) {
      const userTurns = messages.filter((m) => m.isUser).length
      const correctionTypes: Record<string, number> = {}
      for (const c of sessionCorrections) {
        correctionTypes[c.type] = (correctionTypes[c.type] || 0) + 1
      }
      const { status } = recordLessonAttempt(currentScenarioRef.current, {
        userTurns,
        aiSignaledComplete: unitCompleteSeenRef.current,
        totalCorrections: sessionCorrections.length,
        correctionTypes,
      })
      // Only surface an outcome card for a real attempt (skip "never spoke").
      if (userTurns > 0) {
        lessonOutcome = { status, title: sessionTitleRef.current || 'this scenario' }
      }

      // ── Persist path progress for cross-device sync ───────────────────
      // Capture the active language's progress into preferences and sync it.
      if (preferences) {
        try {
          const pathProgress = captureActiveProgress(preferences)
          if (pathProgress !== preferences.pathProgress) {
            const updated = { ...preferences, pathProgress }
            setPreferences(updated)
            void savePreferences(user?.id ?? null, updated, !!user)
          }
        } catch { /* non-critical — local progress still intact */ }
      }
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
      const sessionTitle = sessionTitleRef.current || 'Free Talk'

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

      // ── Save a rich, detailed session report (local-only) for History ────
      // Captures the FULL correction list + context so the report screen can
      // show what actually happened — not just a count. Skip empty sessions
      // (AI greeted but the user never spoke) so History stays meaningful.
      const latestSession = updatedMemory.sessions[updatedMemory.sessions.length - 1]
      const userTurns = messages.filter((m) => m.isUser).length
      if (userTurns > 0) {
        saveSessionReport(user?.id ?? null, {
          date: Date.now(),
          title: sessionTitleRef.current || 'Free Talk',
          scenarioId,
          targetLanguage: conversationState.targetLanguage ?? 'en',
          persona: conversationState.persona ?? 'eli',
          level: conversationState.talkingoLevel ?? 5,
          durationSeconds: fullDuration,
          userTurns,
          corrections: sessionCorrections,
          newVocab: latestSession?.newVocab ?? [],
        })
        // Update lifetime stats (sessions / minutes / streak) for this language.
        recordSessionStat(user?.id ?? null, conversationState.targetLanguage ?? 'en', fullDuration)
      }

      // ── Build the session recap (corrections + felt progress) ───────────
      // Level-up is no longer auto-offered here. Progression is now manual via
      // the Learn page path: the learner advances when they complete a level.
      const progress = getLatestSessionProgress(updatedMemory)
      const coachSummary = summarizeCoach(sessionCoachRef.current)
      setRecapData({
        corrections: sessionCorrections,
        durationSeconds: fullDuration,
        lessonOutcome,
        progress: progress
          ? {
              wordsUsed: Math.max(progress.wordsUsed, coachSummary.wordsUsed),
              wordsIntroduced: progress.wordsIntroduced,
              sentenceTrend: progress.sentenceTrend,
              selfFixes: coachSummary.selfFixes,
            }
          : undefined,
      })
      sessionCoachRef.current = null

      // Sync structured memory to Appwrite (fire-and-forget)
      if (user?.id) {
        syncStructuredMemoryRemote(user.id).catch(() => {})
      }
    }

    // ── Final structured-memory sync handled above (syncStructuredMemoryRemote).
    // The legacy paragraph is NOT written to Appwrite anymore — it lives on as
    // the session highlight inside the synced structured memory, so there is a
    // single remote writer and no field collision. ──────────────────────────

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
    setCallDuration(0)
    geminiClient.resetHistory()
    setView('home')
    setStatsRefresh((n) => n + 1)
  }, [messages, callDuration, conversationState, sessionCorrections, user, stopMic, activeSessionId, preferences])

  // ── Recap dismissal ──────────────────────────────────────────────────────
  // Level-up is no longer offered from the recap — progression is manual via the
  // Learn page path (handleLevelUp), so the recap only needs a close handler.
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
      // Only treat a downward swipe as "end call" when it STARTS in the top
      // drag-handle area. Otherwise a normal downward scroll through the
      // subtitles would hang up the call by accident.
      if (
        touchStartY > 0 &&
        touchStartY < 140 &&
        e.changedTouches[0].clientY - touchStartY > 120
      ) {
        handleEndCallRequest()
      }
    }
    window.addEventListener('touchstart', onTouchStart)
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [conversationMode, view, handleEndCallRequest])

  // ── Render ───────────────────────────────────────────────────────────────

  // Live-call corrections keyed by message id (== the subtitle line id we pass
  // back from LiveCallView). Lets the call view show fixes under each user turn.
  const liveCorrectionsByLine = useMemo(() => {
    const map: Record<string, Correction[]> = {}
    for (const m of messages) {
      if (m.isUser && m.corrections && m.corrections.length > 0) {
        map[m.id] = m.corrections
      }
    }
    return map
  }, [messages])

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
      // Payment problem → hard wall focused on fixing the card. They wanted to
      // keep paying, so recover the payment rather than push a new checkout.
      if (subInfo.customerId && subInfo.status === 'past_due') {
        return (
          <SubscriptionExpired
            userEmail={user?.email}
            userId={user?.id}
            customerId={subInfo.customerId}
            reason="past_due"
          />
        )
      }
      // Cleanly lapsed (expired/canceled): NO hard wall. Drop them into the
      // free tier with their progress intact — they can resubscribe from their
      // profile, and feature gates surface the upgrade prompt naturally. This is
      // the smoother, higher-retention path than locking them out entirely.
    }

    // Derive live LanguageProgress from local stats + completed lessons so the
    // Learn header and Profile constellation reflect real activity.
    const progress: LanguageProgress | null = languageProgress

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
          onReassess={handleReassess}
          onLevelUp={handleLevelUp}
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
            talkingoLevel: preferences?.talkingoLevel,
          }}
          onLearningPrefsChange={handleLearningPrefsChange}
          currentPersona={conversationState.persona}
          onPersonaChange={handlePersonaChange}
          showScriptToggle={showScriptToggle}
          effectiveScript={effectiveScript}
          onScriptChange={changeScript}
          activeTab={homeTab}
          onTabChange={setHomeTab}
        />
        <MicErrorToast
          kind={micError?.kind ?? null}
          detail={micError?.detail}
          onDismiss={() => setMicError(null)}
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
            talkingoLevel: preferences?.talkingoLevel,
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
              const res = await authFetch('/api/billing/reactivate', { method: 'POST' })
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
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 animate-fade-in-up"
          style={{ bottom: composerHeight + 12 }}
        >
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
                className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 pr-1 pt-20"
                style={{ paddingBottom: composerHeight + 24 }}
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

                  // The trailing empty AI bubble is the live "thinking" slot —
                  // it shows dots inside the bubble until the first token lands.
                  const isThinkingBubble =
                    isProcessing
                    && !message.isUser
                    && message.text === ''
                    && index === messages.length - 1

                  return (
                    <div key={message.id} data-message-id={message.id}>
                    <TranscriptMessage
                      text={message.text}
                      isUser={message.isUser}
                      isInterruption={message.isInterruption}
                      isThinking={isThinkingBubble}
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
                              // Stop dictation while the AI voice note plays so
                              // the speaker audio isn't picked up and transcribed.
                              if (isListening) {
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
                              // Re-arm hands-free listening once the reply's voice
                              // note finishes — but only if the pipeline paused the
                              // mic, the user didn't manually mute, and this is the
                              // latest AI turn. (Manual mode waits for a tap.)
                              if (
                                pipelinePausedRef.current
                                && !userManuallyMutedRef.current
                                && conversationModeRef.current === 'handsfree'
                                && isLastAi
                              ) {
                                pipelinePausedRef.current = false
                                setTimeout(() => startMic(), 250)
                                pipelineStateRef.current = 'recording'
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
              </div>

              {/* Scroll-to-bottom button */}
              {showScrollButton && messages.length > 4 && (
                <button
                  onClick={scrollToBottom}
                  className="absolute left-1/2 -translate-x-1/2 z-20 w-10 h-10 rounded-full bg-card border border-border/60 shadow-lg backdrop-blur-md flex items-center justify-center hover:scale-110 hover:border-primary/40 active:scale-95 transition-all duration-200 animate-fade-in-up"
                  style={{ bottom: composerHeight + 12 }}
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
                // Explicit stop → tell the server to halt generation (safe here
                // because the user isn't mid-utterance, unlike VAD barge-in).
                nativeServiceRef.current?.interrupt(true)
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
            onHeightChange={setComposerHeight}
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
            onHeightChange={setComposerHeight}
          />
        )}
      </div>

      {/* ── Live Call overlay — renders on top when mode is 'live' ── */}
      {conversationMode === 'live' && view === 'in-call' && (
        <LiveCallView
          state={conversationState}
          callDuration={callDuration}
          onEndCall={handleEndCallRequest}
          onAutoEnd={() => handleEndCallConfirm(true)}
          correctionsByLine={liveCorrectionsByLine}
          onSwitchToText={() => setInputMethod('text')}
          onTranscriptLine={(role, text, lineId) => {
            // Use the subtitle line id as the message id so corrections computed
            // for this turn map back to the exact bubble in the call view.
            const id = lineId || `live-${Date.now()}-${Math.random()}`
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
        lessonOutcome={recapData?.lessonOutcome}
        isWelcomeBack={recapData?.isWelcomeBack}
        progress={recapData?.progress}
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
    persona: prefs.persona,
    userName: userName ?? prefs.userName,
    targetLanguage: prefs.targetLanguage,
    nativeLanguage: prefs.nativeLanguage,
    learnerGender: prefs.learnerGender,
    currentUnitId: startingUnit.id,
    preferredScript: prefs.preferredScript,
  }
}
