/**
 * Session Coach — the live, within-session teaching loop.
 *
 * WHY THIS EXISTS
 * The cross-session memory engine already revives weak words at the START of a
 * session. But within a single conversation it was "blind": it never noticed,
 * in the moment, whether the learner actually USED a word it was trying to
 * teach, or whether they reproduced a form they'd just been corrected on. That
 * gap — "heard it" vs "said it" — is the difference between a chat partner and a
 * teacher.
 *
 * WHAT IT DOES (deterministically, $0 — no extra AI calls)
 * After each learner turn it:
 *   1. Marks target words the learner actually produced.
 *   2. Notices when the learner re-used a corrected form correctly (a self-fix
 *      "win" worth celebrating in the recap).
 *   3. Occasionally — gently, with a cooldown and warm-up — emits ONE short
 *      instruction telling the AI to create a natural opening for an unused
 *      target word, or to model a corrected form again so the learner can echo
 *      it. It NEVER asks the AI to drill, quiz, or announce the teaching.
 *
 * UX CARE (deliberately conservative — a nudge should feel like a perceptive
 * friend, never a quiz):
 *   - Warm-up: no nudges in the first couple of turns (let the chat breathe).
 *   - Cooldown: a minimum gap between nudges so they never pile up.
 *   - One thing at a time: at most a single nudge per turn.
 *   - One shot per word: a given target word is nudged at most once.
 *   - The caller suppresses nudges entirely when the learner is struggling
 *     (high recent error rate) — we never push someone who's having a hard time.
 *
 * This module is pure and side-effect-free (it mutates the coach object it's
 * given) so it's trivially unit-testable.
 */

import type { Correction } from '@talkingo/shared/types'
import { textContainsWord } from './word-match'

export interface CoachTarget {
  /** Target word/phrase (lower-cased). */
  word: string
  /** Has the learner produced it this session yet? */
  produced: boolean
  /** Session turn it became eligible (0 = from session start). */
  addedTurn: number
  /** Turn we last nudged about this specific word (-1 = never). */
  lastNudgedTurn: number
}

export interface CoachRecast {
  /** The corrected form we'd like the learner to reproduce (lower-cased). */
  corrected: string
  /** Turn the correction happened. */
  addedTurn: number
}

export interface SessionCoach {
  /** Learner-turn counter (incremented on each observed user turn). */
  turn: number
  targets: CoachTarget[]
  recasts: CoachRecast[]
  /** Turn of the most recent nudge of any kind (for cooldown). */
  lastNudgeTurn: number
  /** Distinct target words the learner produced this session (for the recap). */
  producedWords: string[]
  /** Corrected forms the learner later reproduced on their own (self-fix wins). */
  recastWins: string[]
}

// ─── Tunables (gentle by default) ─────────────────────────────────────────────
const WARMUP_TURNS = 2 // no nudges before this many learner turns
const NUDGE_COOLDOWN = 3 // minimum learner turns between nudges
const WORD_UNUSED_TURNS = 3 // a target must sit unused this long before a nudge
const RECAST_WAIT_TURNS = 2 // wait before re-eliciting a just-corrected form
const MAX_TARGETS = 6
const MAX_RECASTS = 6
const MIN_RECAST_LEN = 2 // ignore trivially short corrected fragments

/**
 * Create a coach for a new session, seeded with this session's focus words
 * (dormant cross-session vocab + the scenario's target vocab). Duplicates and
 * blanks are dropped; the list is capped so a nudge stays focused.
 */
export function createSessionCoach(seedWords: string[]): SessionCoach {
  const seen = new Set<string>()
  const targets: CoachTarget[] = []
  for (const raw of seedWords) {
    const word = (raw || '').toLowerCase().trim()
    if (!word || seen.has(word)) continue
    seen.add(word)
    targets.push({ word, produced: false, addedTurn: 0, lastNudgedTurn: -1 })
    if (targets.length >= MAX_TARGETS) break
  }
  return {
    turn: 0,
    targets,
    recasts: [],
    lastNudgeTurn: -999, // never blocks the first eligible nudge
    producedWords: [],
    recastWins: [],
  }
}

/**
 * Add freshly-introduced target words mid-session (e.g. the real words the AI
 * reported using this turn). New, unseen words become eligible nudge targets;
 * words already produced or already tracked are ignored. Capped at MAX_TARGETS.
 */
export function addCoachTargets(coach: SessionCoach, words: string[] | undefined): void {
  if (!words?.length) return
  const known = new Set(coach.targets.map((t) => t.word))
  for (const raw of words) {
    const word = (raw || '').toLowerCase().trim()
    if (!word || known.has(word)) continue
    // If they've already used it this session, don't nudge them to use it.
    const alreadyProduced = coach.producedWords.includes(word)
    coach.targets.push({
      word,
      produced: alreadyProduced,
      addedTurn: coach.turn,
      lastNudgedTurn: alreadyProduced ? coach.turn : -1,
    })
    known.add(word)
    if (coach.targets.length > MAX_TARGETS) coach.targets.shift()
  }
}

/**
 * Observe the learner's message BEFORE the AI replies. Marks produced target
 * words and records any self-fix wins (a corrected form reproduced on a later
 * turn). Call exactly once per learner turn.
 */
export function observeUserTurn(coach: SessionCoach, userText: string): void {
  coach.turn++
  const text = userText || ''

  for (const t of coach.targets) {
    if (!t.produced && textContainsWord(text, t.word)) {
      t.produced = true
      if (!coach.producedWords.includes(t.word)) coach.producedWords.push(t.word)
    }
  }

  // A recast is "won" only if it was added on a PRIOR turn (so the learner had a
  // genuine fresh chance to reproduce it, not the same message that triggered it).
  for (let i = coach.recasts.length - 1; i >= 0; i--) {
    const r = coach.recasts[i]
    if (r.addedTurn < coach.turn && textContainsWord(text, r.corrected)) {
      if (!coach.recastWins.includes(r.corrected)) coach.recastWins.push(r.corrected)
      coach.recasts.splice(i, 1)
    }
  }
}

/**
 * Register the corrections produced for the turn that just happened, so the
 * coach can try to re-elicit those forms on a FUTURE turn. Call after the AI
 * reply for the current turn is known.
 */
export function registerCorrections(coach: SessionCoach, corrections: Correction[]): void {
  for (const c of corrections) {
    const corrected = (c?.corrected || '').toLowerCase().trim()
    if (corrected.length < MIN_RECAST_LEN) continue
    if (coach.recasts.some((r) => r.corrected === corrected)) continue
    if (coach.recastWins.includes(corrected)) continue
    coach.recasts.push({ corrected, addedTurn: coach.turn })
    if (coach.recasts.length > MAX_RECASTS) coach.recasts.shift()
  }
}

/**
 * Decide whether to inject a gentle teaching nudge into the AI's NEXT reply.
 * Returns a short instruction string, or null when no nudge is warranted.
 * Respects warm-up, cooldown, and one-shot-per-word rules. Mutates the coach to
 * record that a nudge was issued.
 *
 * @param opts.gentle  Slightly longer cooldown (used for casual/free contexts).
 */
export function computeNudge(coach: SessionCoach, opts?: { gentle?: boolean }): string | null {
  const cooldown = opts?.gentle ? NUDGE_COOLDOWN + 1 : NUDGE_COOLDOWN
  if (coach.turn < WARMUP_TURNS) return null
  if (coach.turn - coach.lastNudgeTurn < cooldown) return null

  // Priority 1 — re-elicit a corrected form the learner hasn't reproduced yet.
  const recast = coach.recasts
    .filter((r) => coach.turn - r.addedTurn >= RECAST_WAIT_TURNS)
    .sort((a, b) => a.addedTurn - b.addedTurn)[0]
  if (recast) {
    coach.lastNudgeTurn = coach.turn
    // Drop it so we don't keep harping on the same form; if they still miss it,
    // it'll resurface across sessions via the error-pattern planner.
    coach.recasts = coach.recasts.filter((r) => r !== recast)
    return `In your next reply, without correcting or quizzing, naturally use the phrase "${recast.corrected}" in your own sentence so the learner hears it modeled again and can echo it. Keep it conversational.`
  }

  // Priority 2 — open a natural moment for an introduced-but-unused word.
  const target = coach.targets
    .filter((t) => !t.produced && t.lastNudgedTurn < 0 && coach.turn - t.addedTurn >= WORD_UNUSED_TURNS)
    .sort((a, b) => a.addedTurn - b.addedTurn)[0]
  if (target) {
    coach.lastNudgeTurn = coach.turn
    target.lastNudgedTurn = coach.turn
    return `The learner has been learning the word "${target.word}" but hasn't used it yet. In your next reply, steer the conversation so that word becomes the natural thing to say — ask a question or describe a situation where "${target.word}" fits. Never announce this and never quiz them.`
  }

  return null
}

/** A compact, display-friendly summary of what the learner did this session. */
export interface CoachSessionSummary {
  /** Distinct target words the learner produced. */
  wordsUsed: number
  /** Corrected forms the learner reproduced on their own. */
  selfFixes: number
}

export function summarizeCoach(coach: SessionCoach | null): CoachSessionSummary {
  if (!coach) return { wordsUsed: 0, selfFixes: 0 }
  return { wordsUsed: coach.producedWords.length, selfFixes: coach.recastWins.length }
}
