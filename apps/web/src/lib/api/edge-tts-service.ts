/**
 * Edge TTS Service — Free, high-quality neural TTS via Microsoft Edge's Read Aloud API.
 *
 * Strategy:
 *   1. Primary: Edge TTS (free, neural voices, 400+ voices, 100+ languages)
 *   2. Fallback: Gemini TTS (paid, if Edge is down or rate-limited)
 *
 * The service runs server-side only (Node.js). It connects to Microsoft's
 * WebSocket endpoint, synthesizes audio, and returns base64-encoded PCM.
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

// ─── Voice mapping per language ───────────────────────────────────────────────
// Maps BCP-47 language codes to Edge TTS voice names.
// Each language has a primary (natural-sounding) and fallback voice.
// These are Microsoft Azure Neural voices — high quality, expressive.

interface VoiceConfig {
  primary: string
  fallback: string
}

const VOICE_MAP: Record<string, VoiceConfig> = {
  // European languages
  'en-US': { primary: 'en-US-AvaMultilingualNeural', fallback: 'en-US-AndrewMultilingualNeural' },
  'en-GB': { primary: 'en-GB-SoniaNeural', fallback: 'en-GB-RyanNeural' },
  'fr-FR': { primary: 'fr-FR-DeniseNeural', fallback: 'fr-FR-HenriNeural' },
  'es-ES': { primary: 'es-ES-ElviraNeural', fallback: 'es-ES-AlvaroNeural' },
  'de-DE': { primary: 'de-DE-KatjaNeural', fallback: 'de-DE-ConradNeural' },
  'it-IT': { primary: 'it-IT-ElsaNeural', fallback: 'it-IT-DiegoNeural' },
  'pt-BR': { primary: 'pt-BR-FranciscaNeural', fallback: 'pt-BR-AntonioNeural' },
  'pt-PT': { primary: 'pt-PT-RaquelNeural', fallback: 'pt-PT-DuarteNeural' },
  'nl-NL': { primary: 'nl-NL-ColetteNeural', fallback: 'nl-NL-MaartenNeural' },
  'pl-PL': { primary: 'pl-PL-AgnieszkaNeural', fallback: 'pl-PL-MarekNeural' },
  'ru-RU': { primary: 'ru-RU-SvetlanaNeural', fallback: 'ru-RU-DmitryNeural' },
  'uk-UA': { primary: 'uk-UA-PolinaNeural', fallback: 'uk-UA-OstapNeural' },
  'sv-SE': { primary: 'sv-SE-SofieNeural', fallback: 'sv-SE-MattiasNeural' },
  'da-DK': { primary: 'da-DK-ChristelNeural', fallback: 'da-DK-JeppeNeural' },
  'nb-NO': { primary: 'nb-NO-PernilleNeural', fallback: 'nb-NO-FinnNeural' },
  'fi-FI': { primary: 'fi-FI-NooraNeural', fallback: 'fi-FI-HarriNeural' },
  'el-GR': { primary: 'el-GR-AthinaNeural', fallback: 'el-GR-NestorasNeural' },
  'cs-CZ': { primary: 'cs-CZ-VlastaNeural', fallback: 'cs-CZ-AntoninNeural' },
  'ro-RO': { primary: 'ro-RO-AlinaNeural', fallback: 'ro-RO-EmilNeural' },
  'hu-HU': { primary: 'hu-HU-NoemiNeural', fallback: 'hu-HU-TamasNeural' },
  // Asian languages
  'ja-JP': { primary: 'ja-JP-NanamiNeural', fallback: 'ja-JP-KeitaNeural' },
  'ko-KR': { primary: 'ko-KR-SunHiNeural', fallback: 'ko-KR-InJoonNeural' },
  'zh-CN': { primary: 'zh-CN-XiaoxiaoNeural', fallback: 'zh-CN-YunxiNeural' },
  'zh-TW': { primary: 'zh-TW-HsiaoChenNeural', fallback: 'zh-TW-YunJheNeural' },
  'th-TH': { primary: 'th-TH-PremwadeeNeural', fallback: 'th-TH-NiwatNeural' },
  'vi-VN': { primary: 'vi-VN-HoaiMyNeural', fallback: 'vi-VN-NamMinhNeural' },
  'id-ID': { primary: 'id-ID-GadisNeural', fallback: 'id-ID-ArdiNeural' },
  'ms-MY': { primary: 'ms-MY-YasminNeural', fallback: 'ms-MY-OsmanNeural' },
  'hi-IN': { primary: 'hi-IN-SwaraNeural', fallback: 'hi-IN-MadhurNeural' },
  // Middle Eastern / African
  'ar-SA': { primary: 'ar-SA-ZariyahNeural', fallback: 'ar-SA-HamedNeural' },
  'ar-EG': { primary: 'ar-EG-SalmaNeural', fallback: 'ar-EG-ShakirNeural' },
  'tr-TR': { primary: 'tr-TR-EmelNeural', fallback: 'tr-TR-AhmetNeural' },
  'he-IL': { primary: 'he-IL-HilaNeural', fallback: 'he-IL-AvriNeural' },
  'fa-IR': { primary: 'fa-IR-DilaraNeural', fallback: 'fa-IR-FaridNeural' },
}

// Persona-to-gender mapping for voice selection
const PERSONA_GENDER: Record<string, 'female' | 'male'> = {
  eli: 'female',
  alex: 'male',
  'dr-luma': 'female',
  sofia: 'female',
  riko: 'male',
  marco: 'male',
}

/**
 * Get the best Edge TTS voice for a given language and persona.
 */
function getEdgeVoice(languageCode: string, personaId?: string): string {
  // Normalize language code (e.g., 'fr' → 'fr-FR', 'en' → 'en-US')
  const normalized = normalizeLanguageCode(languageCode)
  const config = VOICE_MAP[normalized]

  if (!config) {
    // Fallback to English if language not mapped
    return VOICE_MAP['en-US'].primary
  }

  // Pick voice based on persona gender
  const gender = personaId ? PERSONA_GENDER[personaId] : undefined
  if (gender === 'male') return config.fallback // fallback voices are male
  return config.primary // primary voices are female
}

function normalizeLanguageCode(code: string): string {
  if (!code) return 'en-US'
  // Already full BCP-47
  if (code.includes('-') && code.length >= 5) return code
  // Short code → full
  const SHORT_MAP: Record<string, string> = {
    en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT',
    pt: 'pt-BR', nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', uk: 'uk-UA',
    sv: 'sv-SE', da: 'da-DK', nb: 'nb-NO', fi: 'fi-FI', el: 'el-GR',
    cs: 'cs-CZ', ro: 'ro-RO', hu: 'hu-HU', ja: 'ja-JP', ko: 'ko-KR',
    zh: 'zh-CN', th: 'th-TH', vi: 'vi-VN', id: 'id-ID', ms: 'ms-MY',
    hi: 'hi-IN', ar: 'ar-SA', tr: 'tr-TR', he: 'he-IL', fa: 'fa-IR',
  }
  return SHORT_MAP[code.split('-')[0]] || 'en-US'
}

/**
 * Synthesize speech using Edge TTS.
 * Returns base64-encoded audio data (MP3 format) or null on failure.
 */
export async function synthesizeWithEdgeTTS(
  text: string,
  options?: { languageCode?: string; personaId?: string; voiceName?: string }
): Promise<{ audioBase64: string; format: 'mp3' } | null> {
  try {
    let voice: string

    if (options?.voiceName && options.voiceName.includes('-') && options.voiceName.includes('Neural')) {
      // It's already a full Edge TTS voice ID (e.g., 'fr-FR-HenriNeural')
      voice = options.voiceName
    } else if (options?.voiceName) {
      // It's a Gemini voice name — map to an Edge equivalent
      voice = mapGeminiVoiceToEdge(options.voiceName, options.languageCode)
    } else {
      // No voice specified — pick based on language and persona
      voice = getEdgeVoice(options?.languageCode || 'en-US', options?.personaId)
    }

    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const { audioStream } = tts.toStream(text)

    // Collect all audio chunks
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      audioStream.on('end', () => resolve())
      audioStream.on('error', (err: Error) => reject(err))
      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Edge TTS timeout')), 10000)
    })

    if (chunks.length === 0) return null

    const audioBuffer = Buffer.concat(chunks)
    const audioBase64 = audioBuffer.toString('base64')

    return { audioBase64, format: 'mp3' }
  } catch (err) {
    console.warn('[edge-tts] Synthesis failed:', (err as Error).message)
    return null
  }
}

/**
 * Map Gemini persona voice names to Edge TTS equivalents.
 * Gemini uses names like 'Aoede', 'Puck', 'Charon' — we map to similar-sounding Edge voices.
 */
function mapGeminiVoiceToEdge(geminiVoice: string, languageCode?: string): string {
  const lang = normalizeLanguageCode(languageCode || 'en-US')
  const config = VOICE_MAP[lang]
  if (!config) return VOICE_MAP['en-US'].primary

  // Gemini voice → gender mapping
  const GEMINI_FEMALE = ['Aoede', 'Kore', 'Leda', 'Zephyr']
  const isFemale = GEMINI_FEMALE.includes(geminiVoice)

  return isFemale ? config.primary : config.fallback
}
