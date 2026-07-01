/**
 * Shared, deterministic "did the learner produce this word?" matcher.
 *
 * Extracted so the session-end memory reducer (`structured-memory`) and the
 * live teaching coach (`session-coach`) use ONE tested implementation instead of
 * two slightly-different copies. Pure, $0 (no AI), and inflection-tolerant.
 *
 * It's intentionally forgiving: language learners conjugate and inflect, so we
 * accept a stem match (first ~70% of the word) in addition to a direct
 * substring hit. Short words (<3 chars) require an exact substring to avoid
 * false positives.
 */

/**
 * True when `rawText` appears to contain `rawWord` (or an inflected form of it).
 * Both inputs are lower-cased internally, so callers don't have to normalize.
 */
export function textContainsWord(rawText: string, rawWord: string): boolean {
  const text = (rawText || '').toLowerCase()
  const word = (rawWord || '').toLowerCase().trim()
  if (!word) return false

  // Direct inclusion (handles multi-word phrases and many conjugated forms).
  if (text.includes(word)) return true

  // Stem match for single words — tolerate conjugation/inflection variance.
  if (word.length >= 3) {
    const stem = word.slice(0, Math.max(3, Math.floor(word.length * 0.7)))
    const tokens = text.split(/[\s,.!?¿¡;:"'()[\]{}]+/)
    return tokens.some((t) => t.startsWith(stem))
  }

  return false
}
