/**
 * Robust Chat Sessions — bulletproof conversation history persistence.
 *
 * DESIGN PRINCIPLES:
 * 1. IMMEDIATE writes — no debounce, no timer, no race conditions.
 *    localStorage.setItem is synchronous and takes <2ms for text data.
 * 2. ONE data location — sessions list is the single source of truth.
 *    No separate "active marker" that can drift out of sync.
 * 3. ALWAYS saves — no toggle, no setting that can silently disable persistence.
 * 4. QUOTA-AWARE — proactively manages storage space:
 *    - Keeps audio for last 5 sessions, strips from older ones
 *    - On quota error, strips all audio and retries
 *    - Never silently swallows a write failure without attempting recovery
 * 5. Session created in list immediately — no deferred/orphaned states.
 *
 * STORAGE: localStorage only (device-bound). Managed to stay within ~4MB.
 * - 30 sessions max (FIFO eviction)
 * - Audio blobs kept for last 5 sessions (manual/handsfree modes)
 * - Native/Live modes: transcription text only, never stores audio
 */

import type { ConversationMessage, PersonaId } from '@talkingo/shared/types'
import { markLessonComplete } from '@/lib/storage/lesson-progress'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SessionMode = 'manual' | 'handsfree' | 'native' | 'live'
export type SessionStatus = 'active' | 'ended'

export interface ChatSession {
  /** Unique session ID (timestamp-based) */
  id: string
  /** When the session started */
  startedAt: number
  /** When the session was last updated (last message or end) */
  updatedAt: number
  /** Session duration in seconds (updated live) */
  durationSeconds: number
  /** Current status */
  status: SessionStatus
  /** Conversation mode used */
  mode: SessionMode
  /** Persona used in this session */
  personaId: PersonaId
  /** Target language */
  targetLanguage: string
  /** Session title (scenario name, lesson title, or "Free Talk") */
  title: string
  /** Talkingo level (1-12) at time of session */
  level: string
  /** Topic/scenario ID */
  scenarioId: string
  /** All messages in the session */
  messages: ConversationMessage[]
  /** Total corrections across all messages */
  totalCorrections: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_SESSIONS = 30
/** Number of most-recent sessions that retain audio blobs */
const AUDIO_RETAIN_COUNT = 5
const STORAGE_KEY_PREFIX = 'talkingo_sessions_'

// ─── Storage key ─────────────────────────────────────────────────────────────

function storageKey(userId: string | null): string {
  return `${STORAGE_KEY_PREFIX}${userId || 'anon'}`
}

// ─── Audio management ────────────────────────────────────────────────────────

/**
 * Strip audio blob data from messages but keep metadata (duration, format, voiceName).
 * This lets the UI show "🎤 Voice message (4s)" without the heavy base64 data.
 */
function stripAudioBlobs(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((m) => {
    if (m.audio?.data) {
      return {
        ...m,
        audio: {
          ...m.audio,
          data: undefined, // Remove the heavy base64 blob
          status: 'idle' as const, // Mark as not playable
        },
      }
    }
    return m
  })
}

/**
 * For native/live modes, strip audio entirely (only transcription matters).
 */
function stripAudioForRealtimeModes(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((m) => {
    if (m.audio) {
      const { audio: _audio, ...rest } = m
      return rest
    }
    return m
  })
}

/**
 * Prepare messages for storage based on mode.
 * - native/live: strip audio completely (transcription only)
 * - manual/handsfree: keep full audio (quota managed separately)
 */
function prepareMessages(messages: ConversationMessage[], mode: SessionMode): ConversationMessage[] {
  if (mode === 'native' || mode === 'live') {
    return stripAudioForRealtimeModes(messages)
  }
  return messages
}

/**
 * Enforce audio retention policy on the sessions list.
 * Only the most recent AUDIO_RETAIN_COUNT sessions keep their audio blobs.
 * Older sessions have audio stripped (metadata preserved).
 */
function enforceAudioPolicy(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session, index) => {
    // Sessions are stored most-recent-first, so index 0 = newest
    if (index < AUDIO_RETAIN_COUNT) return session
    // Strip audio blobs from older sessions
    const hasAudio = session.messages.some((m) => m.audio?.data)
    if (!hasAudio) return session
    return {
      ...session,
      messages: stripAudioBlobs(session.messages),
    }
  })
}

// ─── Quota-safe write ────────────────────────────────────────────────────────

/**
 * Write sessions to localStorage with quota recovery.
 * Strategy:
 * 1. Try to write as-is
 * 2. If quota error, strip audio from all but current session and retry
 * 3. If still fails, strip ALL audio and retry
 * 4. If still fails, evict oldest sessions until it fits
 * 5. Only after all recovery fails, log a warning (never silently lose data)
 */
function safeWrite(userId: string | null, sessions: ChatSession[]): boolean {
  const key = storageKey(userId)

  // Attempt 1: write as-is
  try {
    localStorage.setItem(key, JSON.stringify(sessions))
    return true
  } catch {
    // Quota exceeded — try recovery
  }

  // Attempt 2: strip audio from all except the first (most recent) session
  try {
    const stripped = sessions.map((s, i) => {
      if (i === 0) return s
      const hasAudio = s.messages.some((m) => m.audio?.data)
      if (!hasAudio) return s
      return { ...s, messages: stripAudioBlobs(s.messages) }
    })
    localStorage.setItem(key, JSON.stringify(stripped))
    console.warn('[ChatSessions] Quota tight — stripped audio from older sessions')
    return true
  } catch {
    // Still too big
  }

  // Attempt 3: strip ALL audio
  try {
    const fullyStripped = sessions.map((s) => ({
      ...s,
      messages: stripAudioBlobs(s.messages),
    }))
    localStorage.setItem(key, JSON.stringify(fullyStripped))
    console.warn('[ChatSessions] Quota tight — stripped ALL audio')
    return true
  } catch {
    // Still too big
  }

  // Attempt 4: progressively evict oldest sessions
  let reduced = sessions.map((s) => ({
    ...s,
    messages: stripAudioBlobs(s.messages),
  }))
  while (reduced.length > 1) {
    reduced = reduced.slice(0, -1) // Remove oldest
    try {
      localStorage.setItem(key, JSON.stringify(reduced))
      console.warn(`[ChatSessions] Quota critical — evicted sessions, ${reduced.length} remaining`)
      return true
    } catch {
      // Keep evicting
    }
  }

  // Final attempt: write just the current session
  try {
    localStorage.setItem(key, JSON.stringify(reduced))
    console.error('[ChatSessions] Quota emergency — only current session saved')
    return true
  } catch {
    console.error('[ChatSessions] FATAL: Cannot write to localStorage at all')
    return false
  }
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Create a new session. Immediately added to the sessions list.
 * Returns the session ID.
 */
export function createSession(
  userId: string | null,
  opts: {
    mode: SessionMode
    personaId: PersonaId
    targetLanguage: string
    title: string
    level: string
    scenarioId: string
  }
): string {
  const id = Date.now().toString()

  const session: ChatSession = {
    id,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    durationSeconds: 0,
    status: 'active',
    mode: opts.mode,
    personaId: opts.personaId,
    targetLanguage: opts.targetLanguage,
    title: opts.title,
    level: opts.level,
    scenarioId: opts.scenarioId,
    messages: [],
    totalCorrections: 0,
  }

  // Immediately add to the sessions list — no deferred state
  const sessions = loadAllSessions(userId)
  const updated = [session, ...sessions].slice(0, MAX_SESSIONS)
  safeWrite(userId, updated)

  return id
}

/**
 * Save messages to a session. Called on EVERY message change — no debounce.
 * This is a synchronous write (~1-2ms for text data).
 */
export function updateSession(
  userId: string | null,
  sessionId: string,
  messages: ConversationMessage[],
  mode: SessionMode,
  durationSeconds: number
): void {
  const sessions = loadAllSessions(userId)
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx === -1) return // Session doesn't exist — shouldn't happen

  const prepared = prepareMessages(messages, mode)
  const totalCorrections = prepared.reduce(
    (sum, m) => sum + (m.corrections?.length || 0),
    0
  )

  sessions[idx] = {
    ...sessions[idx],
    messages: prepared,
    updatedAt: Date.now(),
    durationSeconds,
    totalCorrections,
  }

  // Enforce audio policy before writing
  const managed = enforceAudioPolicy(sessions)
  safeWrite(userId, managed)
}

/**
 * Mark a session as ended.
 * Also computes quality metrics for lesson completion tracking.
 */
export function endSession(
  userId: string | null,
  sessionId: string,
  finalDuration: number
): void {
  const sessions = loadAllSessions(userId)
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx === -1) return

  const session = sessions[idx]

  sessions[idx] = {
    ...session,
    status: 'ended',
    durationSeconds: finalDuration,
    updatedAt: Date.now(),
  }

  safeWrite(userId, sessions)

  // Compute quality metrics and mark lesson complete
  if (session.scenarioId && session.scenarioId !== 'free-talk') {
    const quality = computeQualityMetrics(session.messages)
    markLessonComplete(session.scenarioId, quality)
  }
}

/**
 * Load all sessions for a user (most recent first).
 */
export function loadAllSessions(userId: string | null): ChatSession[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Clear all sessions for a user.
 */
export function clearAllSessions(userId: string | null): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // ignore
  }
}

/**
 * Recover any active (non-ended) sessions on mount.
 * Marks them as ended so they appear properly in history.
 * Returns the most recent recovered session (for structured memory processing).
 */
export function recoverActiveSessions(userId: string | null): ChatSession | null {
  const sessions = loadAllSessions(userId)
  let recovered: ChatSession | null = null

  let changed = false
  for (let i = 0; i < sessions.length; i++) {
    if (sessions[i].status === 'active' && sessions[i].messages.length > 0) {
      sessions[i] = { ...sessions[i], status: 'ended', updatedAt: Date.now() }
      if (!recovered) recovered = sessions[i]
      changed = true
    }
  }

  // Also remove any empty active sessions (sessions created but no messages sent)
  const cleaned = sessions.filter((s) => !(s.status === 'active' && s.messages.length === 0))
  if (cleaned.length !== sessions.length) changed = true

  if (changed) {
    safeWrite(userId, cleaned)
  }

  // Also clean up legacy active session markers (migration from old code)
  try {
    const legacyKey = `talkingo_active_session_${userId || 'anon'}`
    localStorage.removeItem(legacyKey)
  } catch {}

  return recovered
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function computeQualityMetrics(messages: ConversationMessage[]): {
  totalCorrections: number
  correctionTypes: Record<string, number>
} {
  let totalCorrections = 0
  const correctionTypes: Record<string, number> = {}

  for (const msg of messages) {
    if (msg.corrections && msg.corrections.length > 0) {
      totalCorrections += msg.corrections.length
      for (const c of msg.corrections) {
        correctionTypes[c.type] = (correctionTypes[c.type] || 0) + 1
      }
    }
  }

  return { totalCorrections, correctionTypes }
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
