import type { Correction, ConversationState, GeminiConversationResponse } from '../types'

/**
 * Fallback simulation when Gemini API is unavailable.
 * Used in development without an API key.
 */
export function simulateAIResponse(
  userText: string,
  _state: ConversationState
): GeminiConversationResponse {
  const lower = userText.toLowerCase()
  const corrections: Correction[] = []

  if (lower.includes('buyed'))
    corrections.push({ original: 'buyed', corrected: 'bought', type: 'grammar' })
  if (lower.includes('am go'))
    corrections.push({ original: 'am go', corrected: 'am going', type: 'grammar' })
  if (lower.includes('very good'))
    corrections.push({ original: 'very good', corrected: 'excellent', type: 'vocabulary' })

  let aiResponse = "That's interesting! Tell me more about that."
  let emotion = 'warm'

  if (lower.includes('store') || lower.includes('shopping')) {
    aiResponse = "Oh nice! What did you end up getting?"
    emotion = 'curious'
  } else if (lower.includes('food') || lower.includes('eat')) {
    aiResponse = "Food is such a great topic! What's your favorite thing to cook?"
    emotion = 'enthusiastic'
  } else if (lower.includes('travel') || lower.includes('trip')) {
    aiResponse = "That sounds amazing! What was the highlight of your trip?"
    emotion = 'curious'
  } else if (lower.includes('weather')) {
    aiResponse = "The weather really does make a difference! Do you prefer sunny or rainy days?"
    emotion = 'playful'
  }

  return { aiResponse, corrections, emotion }
}
