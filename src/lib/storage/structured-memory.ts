/**
 * Structured Learner Memory — replaces free-form paragraph with smart data.
 *
 * DESIGN PRINCIPLES:
 * - $0 extra AI calls — all structured data is computed deterministically
 * - Gemini's memoryUpdate still captured as personality/social "highlight"
 * - Capped arrays with FIFO eviction keep storage ~5-8KB per user
 * - Same sync pattern as old memoryLifeline (localStorage + Appwrite)
 * - Backward-compatible: old paragraph migrated into first session summary
 *
 * THREE DATA LAYERS:
 * 1. Vocabulary Tracker — words introduced, words produced, dormant words
 * 2. Error Patterns — recurring mistakes with frequency + recency
 * 3. Session Summaries — rolling window of recent sessions
 */

import type { ConversationMessage, Correction, TargetLanguage } from '@talkingo/shared/types'
import type { ConversationSeed } from '@talkingo/shared/curriculum/types'
import { getSeedById, SEEDS } from '@talkingo/shared/curriculum'
import { databases } from '../api/appwrite'
import { Permission, Role } from 'appwrite'
import { APPWRITE_DB_ID, COLLECTION_IDS } from '../appwrite-schema'
import { textContainsWord } from '../learning/word-match'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VocabEntry {
  /** The word/phrase in target language */
  word: string
  /** Brief translation or context hint */
  hint: string
  /** Timestamp when first introduced (via curriculum seed or AI) */
  introducedAt: number
  /** Number of times user produced it correctly in their own messages */
  producedCount: number
  /** Last time user produced it (null = never used back) */
  lastProduced: number | null
  /** Which session introduced it (scenario ID) */
  source: string
}

export interface ErrorPattern {
  /** Error category */
  type: Correction['type']
  /** Human-readable pattern label (e.g. "ser/estar confusion") */
  pattern: string
  /** How many times this error has occurred across sessions */
  frequency: number
  /** Timestamp of last occurrence */
  lastSeen: number
  /** Up to 3 recent examples: "original → corrected" */
  examples: string[]
  /** Root cause if identified consistently */
  rootCause?: Correction['rootCause']
}

export interface SessionSummary {
  /** Timestamp when session ended */
  date: number
  /** Scenario/unit ID */
  scenarioId: string
  /** Session title for display */
  title: string
  /** Duration in seconds */
  duration: number
  /** Number of user messages in the session */
  userTurns: number
  /** New vocabulary introduced this session */
  newVocab: string[]
  /** Error patterns hit this session */
  errorsHit: string[]
  /** AI-generated highlight (from memoryUpdate) — social/personality insight */
  highlight: string
  /** Corrections count */
  corrections: number
  /** Avg words per learner turn this session — the sentence-length signal used
   *  to show a "your sentences are getting longer" trend. Optional for back-compat. */
  avgUserWords?: number
  /** Count of tracked vocab words the learner PRODUCED this session (used vs.
   *  merely introduced). Optional for back-compat with sessions saved earlier. */
  vocabProduced?: number
}

export interface StructuredMemory {
  /** Version for future migrations */
  version: 2
  /** Vocabulary tracker — max 120 entries */
  vocab: VocabEntry[]
  /** Recurring error patterns — max 40 */
  errors: ErrorPattern[]
  /** Recent session summaries — max 12 (rolling window) */
  sessions: SessionSummary[]
  /** User-written note (preserved from old system) */
  userNote: string
  /** Legacy freeform paragraph (kept for first migration, then phased out) */
  legacyLifeline?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_VOCAB = 120
const MAX_ERRORS = 40
const MAX_SESSIONS = 12
const MAX_ERROR_EXAMPLES = 3
const MAX_NOTE_CHARS = 500

const STORAGE_KEY = (uid: string | null) => `talkingo_structured_memory_${uid || 'anon'}`

// ─── Empty state ─────────────────────────────────────────────────────────────

export function createEmptyMemory(): StructuredMemory {
  return {
    version: 2,
    vocab: [],
    errors: [],
    sessions: [],
    userNote: '',
  }
}

// ─── Legacy concept-tag cleanup ──────────────────────────────────────────────
// Earlier builds seeded the vocab tracker from `seed.targetVocab`, which are
// English concept tags ("greetings", "travel-plans") — not real words. Those
// entries are pure noise (never "produced", so perpetually "dormant"). We purge
// them on load using the known set of all seed tags, so the planner and coach
// only ever surface real words. Deterministic and idempotent.

let _conceptTags: Set<string> | null = null
function conceptTagSet(): Set<string> {
  if (_conceptTags) return _conceptTags
  const s = new Set<string>()
  try {
    for (const seed of SEEDS) {
      for (const tag of seed.targetVocab ?? []) {
        const t = tag.toLowerCase().trim()
        if (t) s.add(t)
      }
    }
  } catch {
    /* curriculum unavailable — nothing to prune */
  }
  _conceptTags = s
  return s
}

function pruneConceptTags(memory: StructuredMemory): StructuredMemory {
  const tags = conceptTagSet()
  if (tags.size === 0 || memory.vocab.length === 0) return memory
  memory.vocab = memory.vocab.filter((v) => !tags.has(v.word))
  return memory
}

// ─── Load / Save (localStorage) ─────────────────────────────────────────────

export function loadStructuredMemory(userId: string | null): StructuredMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId))
    if (!raw) return migrateFromLegacy(userId)
    const parsed = JSON.parse(raw)
    if (parsed?.version === 2) return pruneConceptTags(parsed as StructuredMemory)
    // Unknown version — start fresh but keep what we can
    return migrateFromLegacy(userId)
  } catch {
    return createEmptyMemory()
  }
}

export function saveStructuredMemory(userId: string | null, memory: StructuredMemory): void {
  try {
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(memory))
  } catch {
    // Quota exceeded — try compacting
    try {
      const compacted = compactMemory(memory)
      localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(compacted))
    } catch {
      // Truly out of space — silently ignore
    }
  }
}

// ─── Migration from legacy paragraph ────────────────────────────────────────

function migrateFromLegacy(userId: string | null): StructuredMemory {
  const memory = createEmptyMemory()
  try {
    // Pull old lifeline
    const oldLifeline = localStorage.getItem(`talkingo_lifeline_${userId || 'anon'}`) || ''
    if (oldLifeline) {
      memory.legacyLifeline = oldLifeline
      // Create a synthetic first session summary from the old paragraph.
      // Dated to the epoch (not now) so the recency-based cross-device merge can
      // never mistake this migration stub for the freshest data and clobber a
      // device that has real sessions.
      memory.sessions.push({
        date: 1,
        scenarioId: 'migration',
        title: 'Previous conversations',
        duration: 0,
        userTurns: 0,
        newVocab: [],
        errorsHit: [],
        highlight: oldLifeline.slice(0, 200),
        corrections: 0,
      })
    }
    // Pull old user note
    const oldNote = localStorage.getItem(`talkingo_usernote_${userId || 'anon'}`) || ''
    if (oldNote) memory.userNote = oldNote
  } catch {
    // Non-critical
  }
  return memory
}

// ─── Compact (eviction) ─────────────────────────────────────────────────────

function compactMemory(memory: StructuredMemory): StructuredMemory {
  return {
    ...memory,
    vocab: memory.vocab.slice(-MAX_VOCAB),
    errors: memory.errors
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, MAX_ERRORS),
    sessions: memory.sessions.slice(-MAX_SESSIONS),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION-END REDUCER
// Called when a session ends. Processes messages into structured memory.
// This is DETERMINISTIC — no AI calls needed.
// ═══════════════════════════════════════════════════════════════════════════════

export interface SessionEndInput {
  messages: ConversationMessage[]
  scenarioId: string
  title: string
  duration: number
  memoryHighlight?: string  // from Gemini's last memoryUpdate
  targetLanguage?: TargetLanguage
}

export function processSessionEnd(
  currentMemory: StructuredMemory,
  input: SessionEndInput
): StructuredMemory {
  const { messages, scenarioId, title, duration, memoryHighlight } = input

  // Clone to avoid mutations
  const memory: StructuredMemory = JSON.parse(JSON.stringify(currentMemory))

  // ── 1. Extract corrections and update error patterns ──────────────────
  const sessionErrors: string[] = []
  for (const msg of messages) {
    if (!msg.isUser || !msg.corrections?.length) continue
    for (const correction of msg.corrections) {
      const patternKey = identifyErrorPattern(correction)
      sessionErrors.push(patternKey)
      upsertErrorPattern(memory, correction, patternKey)
    }
  }

  // ── 2. Extract vocabulary ─────────────────────────────────────────────
  const seed = scenarioId && scenarioId !== 'free-talk' && !scenarioId.startsWith('custom-')
    ? getSeedById(scenarioId) ?? null
    : null
  const { newlyIntroduced: newVocab, producedThisSession } = processVocabulary(
    memory, messages, seed ?? null, scenarioId
  )

  // ── 3. Create session summary ──────────────────────────────────────────
  const userMessages = messages.filter(m => m.isUser && m.text)
  const userTurns = userMessages.length
  const totalCorrections = messages.reduce(
    (sum, m) => sum + (m.corrections?.length || 0), 0
  )
  // Sentence-length signal: average words per learner turn (rounded to 1dp).
  const totalUserWords = userMessages.reduce(
    (sum, m) => sum + m.text.trim().split(/\s+/).filter(Boolean).length, 0
  )
  const avgUserWords = userTurns > 0
    ? Math.round((totalUserWords / userTurns) * 10) / 10
    : 0

  memory.sessions.push({
    date: Date.now(),
    scenarioId,
    title,
    duration,
    userTurns,
    newVocab,
    errorsHit: [...new Set(sessionErrors)],
    highlight: memoryHighlight || '',
    corrections: totalCorrections,
    avgUserWords,
    vocabProduced: producedThisSession,
  })

  // ── 4. Evict old entries ───────────────────────────────────────────────
  if (memory.sessions.length > MAX_SESSIONS) {
    memory.sessions = memory.sessions.slice(-MAX_SESSIONS)
  }
  if (memory.vocab.length > MAX_VOCAB) {
    // Keep most recently introduced + most produced
    memory.vocab.sort((a, b) => {
      // Score: recent introduction + high production = keep
      const scoreA = (a.producedCount * 2) + (a.introducedAt / 1e12)
      const scoreB = (b.producedCount * 2) + (b.introducedAt / 1e12)
      return scoreB - scoreA
    })
    memory.vocab = memory.vocab.slice(0, MAX_VOCAB)
  }
  if (memory.errors.length > MAX_ERRORS) {
    memory.errors.sort((a, b) => b.frequency - a.frequency)
    memory.errors = memory.errors.slice(0, MAX_ERRORS)
  }

  return memory
}

// ─── Error Pattern Processing ────────────────────────────────────────────────

/**
 * Create a stable key for an error so we can merge duplicates.
 * Groups by type + simplified pattern from the correction note.
 */
function identifyErrorPattern(correction: Correction): string {
  // Use the note if available, otherwise generate from original/corrected pair
  if (correction.note) {
    // Normalize: lowercase, trim, take first ~50 chars
    return `${correction.type}:${correction.note.toLowerCase().trim().slice(0, 50)}`
  }
  // Fallback: use the actual mistake as pattern label
  return `${correction.type}:${correction.original.toLowerCase()} → ${correction.corrected.toLowerCase()}`
}

function upsertErrorPattern(memory: StructuredMemory, correction: Correction, patternKey: string): void {
  const existing = memory.errors.find(e =>
    e.type === correction.type && e.pattern === patternKey
  )

  const example = `"${correction.original}" → "${correction.corrected}"`

  if (existing) {
    existing.frequency++
    existing.lastSeen = Date.now()
    // Keep last N examples, avoid duplicates
    if (!existing.examples.includes(example)) {
      existing.examples.push(example)
      if (existing.examples.length > MAX_ERROR_EXAMPLES) {
        existing.examples.shift()
      }
    }
    // Update root cause if consistent
    if (correction.rootCause) existing.rootCause = correction.rootCause
  } else {
    memory.errors.push({
      type: correction.type,
      pattern: patternKey,
      frequency: 1,
      lastSeen: Date.now(),
      examples: [example],
      rootCause: correction.rootCause,
    })
  }
}

// ─── Vocabulary Processing ───────────────────────────────────────────────────

function processVocabulary(
  memory: StructuredMemory,
  messages: ConversationMessage[],
  seed: ConversationSeed | null,
  scenarioId: string
): { newlyIntroduced: string[]; producedThisSession: number } {
  const newlyIntroduced: string[] = []

  // Step 1: Introduce the REAL target-language words the AI used this session
  // (reported per-turn via message.keyWords). This replaces the old source —
  // `seed.targetVocab` were English concept tags (e.g. "greetings"), not words
  // the learner could ever "produce", so production tracking matched nothing.
  const hint = seed?.category || ''
  const introduced = new Set<string>()
  for (const msg of messages) {
    if (msg.isUser || !msg.keyWords?.length) continue
    for (const raw of msg.keyWords) {
      const normalized = raw.toLowerCase().trim()
      if (!normalized || introduced.has(normalized)) continue
      introduced.add(normalized)
      const existing = memory.vocab.find(v => v.word === normalized)
      if (!existing) {
        memory.vocab.push({
          word: normalized,
          hint,
          introducedAt: Date.now(),
          producedCount: 0,
          lastProduced: null,
          source: scenarioId,
        })
        newlyIntroduced.push(normalized)
      }
    }
  }

  // Step 2: Scan user messages for vocabulary production. Now that tracked words
  // are REAL target-language words, these matches are meaningful.
  const userTexts = messages
    .filter(m => m.isUser && m.text)
    .map(m => m.text)

  let producedThisSession = 0
  for (const entry of memory.vocab) {
    for (const text of userTexts) {
      if (textContainsWord(text, entry.word)) {
        entry.producedCount++
        entry.lastProduced = Date.now()
        producedThisSession++
        break // Count once per session per word
      }
    }
  }

  return { newlyIntroduced, producedThisSession }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRACTICE PLANNER
// Reads structured memory and generates targeted prompt injection.
// Called before each session to prime the AI with specific goals.
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlannerTargets {
  /** Dormant vocab to reactivate (introduced but never/rarely produced) */
  dormantVocab: VocabEntry[]
  /** Recurring errors to watch for */
  recurringErrors: ErrorPattern[]
  /** Overall session focus suggestion */
  focusHint: string
}

/**
 * Analyze memory and determine what this session should target.
 * Pure function — no side effects.
 */
export function computePlannerTargets(memory: StructuredMemory): PlannerTargets {
  const now = Date.now()
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000

  // ── Dormant vocabulary ─────────────────────────────────────────────────
  // Words introduced 2+ days ago that the user has never produced (or only once)
  const dormantVocab = memory.vocab
    .filter(v => {
      const age = now - v.introducedAt
      if (age < TWO_DAYS) return false // Too recent, give them time
      if (v.producedCount >= 3) return false // Well-acquired
      // If produced once but over a week ago, consider dormant again
      if (v.producedCount === 1 && v.lastProduced && (now - v.lastProduced) < ONE_WEEK) return false
      return true
    })
    .sort((a, b) => {
      // Prioritize: never produced > produced once long ago > recently introduced
      if (a.producedCount === 0 && b.producedCount > 0) return -1
      if (b.producedCount === 0 && a.producedCount > 0) return 1
      return a.introducedAt - b.introducedAt // Older introductions first
    })
    .slice(0, 5) // Max 5 targets per session

  // ── Recurring errors ───────────────────────────────────────────────────
  // Errors that appeared 3+ times, prioritized by frequency and recency
  const recurringErrors = memory.errors
    .filter(e => e.frequency >= 3)
    .sort((a, b) => {
      // Score: frequency × recency weight
      const recencyA = 1 / (1 + (now - a.lastSeen) / ONE_WEEK)
      const recencyB = 1 / (1 + (now - b.lastSeen) / ONE_WEEK)
      return (b.frequency * recencyB) - (a.frequency * recencyA)
    })
    .slice(0, 3) // Max 3 error targets

  // ── Focus hint ─────────────────────────────────────────────────────────
  let focusHint = ''
  if (dormantVocab.length >= 3 && recurringErrors.length === 0) {
    focusHint = 'This learner has vocabulary that needs activation — create situations requiring those words.'
  } else if (recurringErrors.length >= 2 && dormantVocab.length === 0) {
    focusHint = 'This learner has persistent grammar patterns — set up contexts that naturally require correct usage.'
  } else if (dormantVocab.length > 0 && recurringErrors.length > 0) {
    focusHint = 'Balance vocabulary activation with gentle error correction opportunities.'
  }

  return { dormantVocab, recurringErrors, focusHint }
}

/**
 * Build the prompt injection string from planner targets.
 * This replaces the old freeform memory block in the system prompt.
 * Returns empty string if no meaningful targets exist.
 */
export function buildPlannerInjection(memory: StructuredMemory): string {
  const targets = computePlannerTargets(memory)
  const parts: string[] = []

  // ── Session targets (invisible to user, just for the AI) ──────────────
  if (targets.dormantVocab.length > 0 || targets.recurringErrors.length > 0) {
    parts.push('SESSION TARGETS (weave naturally — never announce or drill):')

    if (targets.dormantVocab.length > 0) {
      const vocabList = targets.dormantVocab
        .map(v => {
          const age = Math.floor((Date.now() - v.introducedAt) / (24 * 60 * 60 * 1000))
          const status = v.producedCount === 0 ? 'never produced' : `produced ${v.producedCount}x, last ${Math.floor((Date.now() - (v.lastProduced || 0)) / (24 * 60 * 60 * 1000))}d ago`
          return `'${v.word}' (introduced ${age}d ago, ${status})`
        })
        .join(', ')
      parts.push(`Reactivate vocabulary: ${vocabList}. Create natural moments where these words are needed or modeled.`)
    }

    if (targets.recurringErrors.length > 0) {
      const errorList = targets.recurringErrors
        .map(e => {
          const label = e.pattern.includes(':') ? e.pattern.split(':')[1] : e.pattern
          return `${label} (${e.frequency}x)`
        })
        .join(', ')
      parts.push(`Watch for recurring errors: ${errorList}. Set up contexts that naturally require the correct form.`)
    }

    if (targets.focusHint) {
      parts.push(targets.focusHint)
    }
  }

  // ── Learner personality / social context from session highlights ────────
  const recentHighlights = memory.sessions
    .filter(s => s.highlight && s.highlight.length > 10)
    .slice(-3)
    .map(s => s.highlight)

  if (recentHighlights.length > 0) {
    parts.push(`\nWHAT YOU KNOW ABOUT THIS LEARNER:\n${recentHighlights.join(' ')}`)
  }

  // ── User's personal note ───────────────────────────────────────────────
  if (memory.userNote) {
    parts.push(`\nUSER'S NOTES FOR YOU:\n${memory.userNote}`)
  }

  return parts.join('\n')
}

// ─── Free Talk memory injection + level-up readiness ─────────────────────────

/**
 * Build a LIGHT memory injection for Free Talk mode.
 *
 * Same "what you know about this learner" continuity as the planner, but WITHOUT
 * the session targets / error-drilling block — so casual conversations stay
 * natural while the AI still remembers who it's talking to. This is what makes
 * memory work everywhere, not just in Practice mode.
 */
export function buildMemoryInjection(memory: StructuredMemory): string {
  const parts: string[] = []

  const recentHighlights = memory.sessions
    .filter(s => s.highlight && s.highlight.length > 10)
    .slice(-3)
    .map(s => s.highlight)

  if (recentHighlights.length > 0) {
    parts.push(`WHAT YOU KNOW ABOUT THIS LEARNER:\n${recentHighlights.join(' ')}`)
  }

  // A gentle nudge toward dormant vocab without framing it as a drill.
  const targets = computePlannerTargets(memory)
  if (targets.dormantVocab.length > 0) {
    const words = targets.dormantVocab.slice(0, 4).map(v => `'${v.word}'`).join(', ')
    parts.push(`If it comes up naturally, gently reuse words they've been learning: ${words}. Never force it.`)
  }

  if (memory.userNote) {
    parts.push(`\nUSER'S NOTES FOR YOU:\n${memory.userNote}`)
  }

  return parts.join('\n')
}

export interface LevelUpSignal {
  ready: boolean
  /** Average corrections per user turn across the recent window (lower = better) */
  recentCorrectionRate: number
  /** Total user turns considered */
  recentTurns: number
}

/**
 * Decide whether to OFFER the user the next level.
 *
 * Promotion-only and deliberately conservative — we never want to spike
 * difficulty on someone who's struggling. Uses only data already tracked
 * (session corrections + user turns), so it costs nothing.
 *
 * Heuristic: across the last few sessions, if the learner is producing enough
 * speech AND their correction rate is low, they've outgrown this level.
 */
export function getLevelUpSignal(memory: StructuredMemory, currentLevel: number): LevelUpSignal {
  const NONE: LevelUpSignal = { ready: false, recentCorrectionRate: 1, recentTurns: 0 }
  if (currentLevel >= 12) return NONE

  // Look at the last 3 sessions with real interaction.
  const recent = memory.sessions
    .filter(s => s.userTurns > 0)
    .slice(-3)

  if (recent.length < 2) return NONE // Not enough history yet.

  const totalTurns = recent.reduce((sum, s) => sum + s.userTurns, 0)
  const totalCorrections = recent.reduce((sum, s) => sum + s.corrections, 0)

  // Need meaningful engagement before offering a jump.
  if (totalTurns < 12) return { ...NONE, recentTurns: totalTurns }

  const correctionRate = totalCorrections / totalTurns

  // Low error rate over a sustained, engaged stretch → ready to level up.
  const ready = correctionRate <= 0.35

  return { ready, recentCorrectionRate: correctionRate, recentTurns: totalTurns }
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPWRITE SYNC// Structured memory stored as JSON string in memoryLifeline field.
// ═══════════════════════════════════════════════════════════════════════════════

const DATABASE_ID = APPWRITE_DB_ID
const PREFERENCES_COLLECTION = COLLECTION_IDS.USER_PREFERENCES

/**
 * Sync structured memory to Appwrite.
 * Stores as JSON string in the memoryLifeline field (backward compat).
 */
export async function syncStructuredMemoryToAppwrite(
  userId: string,
  memory: StructuredMemory
): Promise<void> {
  if (!userId) return
  const serialized = JSON.stringify(memory)
  try {
    await databases.updateDocument(DATABASE_ID, PREFERENCES_COLLECTION, userId, {
      memoryLifeline: serialized,
      userNote: memory.userNote,
      updatedAt: Date.now(),
    })
  } catch (error: any) {
    const status = error?.code ?? error?.status ?? 0
    if (status === 404) {
      try {
        await databases.createDocument(
          DATABASE_ID,
          PREFERENCES_COLLECTION,
          userId,
          {
            userId,
            memoryLifeline: serialized,
            userNote: memory.userNote,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          [
            Permission.read(Role.user(userId)),
            Permission.update(Role.user(userId)),
            Permission.delete(Role.user(userId)),
          ]
        )
      } catch {
        // Non-critical
      }
    }
  }
}

/**
 * Load structured memory from Appwrite.
 * Handles backward compat: if memoryLifeline is a plain string (old format),
 * wraps it in a migration.
 */
export async function loadStructuredMemoryFromAppwrite(
  userId: string
): Promise<StructuredMemory> {
  if (!userId) return createEmptyMemory()
  try {
    const doc = await databases.getDocument(DATABASE_ID, PREFERENCES_COLLECTION, userId)
    const data = doc as any
    const raw = (data.memoryLifeline as string) || ''
    const userNote = (data.userNote as string) || ''

    // Try parsing as structured JSON
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed?.version === 2) {
          parsed.userNote = userNote || parsed.userNote
          return pruneConceptTags(parsed as StructuredMemory)
        }
      } catch {
        // Fall through to legacy handling
      }
    }

    // Legacy: plain text paragraph
    const memory = createEmptyMemory()
    if (raw) {
      memory.legacyLifeline = raw
      // Dated to the epoch (not now) — see migrateFromLegacy: keeps this stub
      // from ever winning the recency merge against a device with real sessions.
      memory.sessions.push({
        date: 1,
        scenarioId: 'migration',
        title: 'Previous conversations',
        duration: 0,
        userTurns: 0,
        newVocab: [],
        errorsHit: [],
        highlight: raw.slice(0, 200),
        corrections: 0,
      })
    }
    memory.userNote = userNote
    return memory
  } catch {
    return createEmptyMemory()
  }
}

// ─── User Note ───────────────────────────────────────────────────────────────

export function updateUserNote(memory: StructuredMemory, note: string): StructuredMemory {
  return { ...memory, userNote: note.trim().slice(0, MAX_NOTE_CHARS) }
}

// ─── Stats for UI ────────────────────────────────────────────────────────────

export interface MemoryStats {
  totalVocab: number
  activeVocab: number
  dormantVocab: number
  totalErrors: number
  topErrors: Array<{ pattern: string; frequency: number }>
  sessionsTracked: number
  streakIndicator: string
}

/**
 * Compact progress for the MOST RECENT session, comparing sentence length to
 * the prior session for an honest "your sentences are getting longer" trend.
 * Pure; safe on older sessions that predate the new fields (treats them as
 * absent → no trend). Returns null when there are no sessions yet.
 */
export interface SessionProgress {
  /** Tracked vocab words the learner produced this session. */
  wordsUsed: number
  /** New vocab introduced this session. */
  wordsIntroduced: number
  /** Sentence-length trend vs the previous session (null when not comparable). */
  sentenceTrend: 'up' | 'flat' | 'down' | null
  durationSeconds: number
  corrections: number
}

export function getLatestSessionProgress(memory: StructuredMemory): SessionProgress | null {
  const n = memory.sessions.length
  if (n === 0) return null
  const cur = memory.sessions[n - 1]
  const prev = n >= 2 ? memory.sessions[n - 2] : null

  let sentenceTrend: SessionProgress['sentenceTrend'] = null
  if (
    prev &&
    typeof cur.avgUserWords === 'number' &&
    typeof prev.avgUserWords === 'number' &&
    prev.avgUserWords > 0
  ) {
    const rel = (cur.avgUserWords - prev.avgUserWords) / prev.avgUserWords
    sentenceTrend = rel > 0.1 ? 'up' : rel < -0.1 ? 'down' : 'flat'
  }

  return {
    wordsUsed: cur.vocabProduced ?? 0,
    wordsIntroduced: cur.newVocab.length,
    sentenceTrend,
    durationSeconds: cur.duration,
    corrections: cur.corrections,
  }
}

export function getMemoryStats(memory: StructuredMemory): MemoryStats {
  const now = Date.now()
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000

  const activeVocab = memory.vocab.filter(v => v.producedCount >= 3).length
  const dormantVocab = memory.vocab.filter(v =>
    v.producedCount === 0 && (now - v.introducedAt) > 2 * 24 * 60 * 60 * 1000
  ).length

  const topErrors = memory.errors
    .filter(e => e.frequency >= 2)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5)
    .map(e => ({
      pattern: e.pattern.includes(':') ? e.pattern.split(':')[1] : e.pattern,
      frequency: e.frequency,
    }))

  // Simple streak: consecutive days with sessions in last week
  const sessionDays = new Set(
    memory.sessions
      .filter(s => (now - s.date) < ONE_WEEK)
      .map(s => new Date(s.date).toDateString())
  )
  const streakIndicator = sessionDays.size >= 5 ? '🔥' :
    sessionDays.size >= 3 ? '⚡' :
    sessionDays.size >= 1 ? '✓' : ''

  return {
    totalVocab: memory.vocab.length,
    activeVocab,
    dormantVocab,
    totalErrors: memory.errors.length,
    topErrors,
    sessionsTracked: memory.sessions.length,
    streakIndicator,
  }
}
