'use client'

/**
 * VoicePicker — compact, premium voice selector for Settings.
 *
 * Two sections:
 *   🎙️ Live Call Voice — Gemini voices (30, multilingual, expressive)
 *   💬 Chat Voice — Edge TTS voices (filtered by target language)
 *
 * Features:
 *   - Preview button plays a short sample
 *   - Selected voice persists in user preferences
 *   - Compact pill-based selection UI
 */

import { useState, useRef, useCallback } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Phone, MessageCircle, Play, Square, Sparkles } from 'lucide-react'
import { decodeBase64Pcm, getAudioContext } from '@/lib/utils/audio-decode'

// ─── Gemini Live Voices (30 total, language-agnostic) ─────────────────────────

export interface GeminiVoice {
  name: string
  style: string
}

export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Aoede', style: 'Breezy' },
  { name: 'Puck', style: 'Upbeat' },
  { name: 'Sulafat', style: 'Warm' },
  { name: 'Kore', style: 'Firm' },
  { name: 'Charon', style: 'Informative' },
  { name: 'Fenrir', style: 'Excitable' },
  { name: 'Leda', style: 'Youthful' },
  { name: 'Zephyr', style: 'Bright' },
  { name: 'Orus', style: 'Firm' },
  { name: 'Callirrhoe', style: 'Easy-going' },
  { name: 'Autonoe', style: 'Bright' },
  { name: 'Enceladus', style: 'Breathy' },
  { name: 'Iapetus', style: 'Clear' },
  { name: 'Umbriel', style: 'Easy-going' },
  { name: 'Algieba', style: 'Smooth' },
  { name: 'Despina', style: 'Smooth' },
  { name: 'Erinome', style: 'Clear' },
  { name: 'Algenib', style: 'Gravelly' },
  { name: 'Rasalgethi', style: 'Informative' },
  { name: 'Laomedeia', style: 'Upbeat' },
  { name: 'Achernar', style: 'Soft' },
  { name: 'Alnilam', style: 'Firm' },
  { name: 'Schedar', style: 'Even' },
  { name: 'Gacrux', style: 'Mature' },
  { name: 'Pulcherrima', style: 'Forward' },
  { name: 'Achird', style: 'Friendly' },
  { name: 'Zubenelgenubi', style: 'Casual' },
  { name: 'Vindemiatrix', style: 'Gentle' },
  { name: 'Sadachbia', style: 'Lively' },
  { name: 'Sadaltager', style: 'Knowledgeable' },
]

// ─── Edge TTS Voices (per language, curated selection) ────────────────────────

export interface EdgeVoice {
  id: string       // Full voice ID (e.g., 'fr-FR-DeniseNeural')
  name: string     // Display name (e.g., 'Denise')
  gender: 'female' | 'male'
}

// Curated voices per language — showing the best 4-8 per language
export const EDGE_VOICES: Record<string, EdgeVoice[]> = {
  en: [
    { id: 'en-US-AvaMultilingualNeural', name: 'Ava', gender: 'female' },
    { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew', gender: 'male' },
    { id: 'en-GB-SoniaNeural', name: 'Sonia', gender: 'female' },
    { id: 'en-GB-RyanNeural', name: 'Ryan', gender: 'male' },
    { id: 'en-US-JennyNeural', name: 'Jenny', gender: 'female' },
    { id: 'en-US-GuyNeural', name: 'Guy', gender: 'male' },
  ],
  fr: [
    { id: 'fr-FR-DeniseNeural', name: 'Denise', gender: 'female' },
    { id: 'fr-FR-HenriNeural', name: 'Henri', gender: 'male' },
    { id: 'fr-FR-VivienneMultilingualNeural', name: 'Vivienne', gender: 'female' },
    { id: 'fr-FR-RemyMultilingualNeural', name: 'Rémy', gender: 'male' },
    { id: 'fr-FR-EloiseNeural', name: 'Éloïse', gender: 'female' },
  ],
  es: [
    { id: 'es-ES-ElviraNeural', name: 'Elvira', gender: 'female' },
    { id: 'es-ES-AlvaroNeural', name: 'Álvaro', gender: 'male' },
    { id: 'es-MX-DaliaNeural', name: 'Dalia', gender: 'female' },
    { id: 'es-MX-JorgeNeural', name: 'Jorge', gender: 'male' },
  ],
  de: [
    { id: 'de-DE-KatjaNeural', name: 'Katja', gender: 'female' },
    { id: 'de-DE-ConradNeural', name: 'Conrad', gender: 'male' },
    { id: 'de-DE-SeraphinaMultilingualNeural', name: 'Seraphina', gender: 'female' },
    { id: 'de-DE-FlorianMultilingualNeural', name: 'Florian', gender: 'male' },
  ],
  it: [
    { id: 'it-IT-ElsaNeural', name: 'Elsa', gender: 'female' },
    { id: 'it-IT-DiegoNeural', name: 'Diego', gender: 'male' },
    { id: 'it-IT-IsabellaNeural', name: 'Isabella', gender: 'female' },
  ],
  pt: [
    { id: 'pt-BR-FranciscaNeural', name: 'Francisca', gender: 'female' },
    { id: 'pt-BR-AntonioNeural', name: 'Antônio', gender: 'male' },
    { id: 'pt-PT-RaquelNeural', name: 'Raquel', gender: 'female' },
    { id: 'pt-PT-DuarteNeural', name: 'Duarte', gender: 'male' },
  ],
  ja: [
    { id: 'ja-JP-NanamiNeural', name: 'Nanami', gender: 'female' },
    { id: 'ja-JP-KeitaNeural', name: 'Keita', gender: 'male' },
    { id: 'ja-JP-AoiNeural', name: 'Aoi', gender: 'female' },
  ],
  ko: [
    { id: 'ko-KR-SunHiNeural', name: 'SunHi', gender: 'female' },
    { id: 'ko-KR-InJoonNeural', name: 'InJoon', gender: 'male' },
    { id: 'ko-KR-YuJinNeural', name: 'YuJin', gender: 'female' },
  ],
  zh: [
    { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', gender: 'female' },
    { id: 'zh-CN-YunxiNeural', name: 'Yunxi', gender: 'male' },
    { id: 'zh-CN-XiaoyiNeural', name: 'Xiaoyi', gender: 'female' },
  ],
  ar: [
    { id: 'ar-SA-ZariyahNeural', name: 'Zariyah', gender: 'female' },
    { id: 'ar-SA-HamedNeural', name: 'Hamed', gender: 'male' },
    { id: 'ar-EG-SalmaNeural', name: 'Salma', gender: 'female' },
    { id: 'ar-EG-ShakirNeural', name: 'Shakir', gender: 'male' },
  ],
  tr: [
    { id: 'tr-TR-EmelNeural', name: 'Emel', gender: 'female' },
    { id: 'tr-TR-AhmetNeural', name: 'Ahmet', gender: 'male' },
  ],
  ru: [
    { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana', gender: 'female' },
    { id: 'ru-RU-DmitryNeural', name: 'Dmitry', gender: 'male' },
  ],
  hi: [
    { id: 'hi-IN-SwaraNeural', name: 'Swara', gender: 'female' },
    { id: 'hi-IN-MadhurNeural', name: 'Madhur', gender: 'male' },
  ],
  nl: [
    { id: 'nl-NL-ColetteNeural', name: 'Colette', gender: 'female' },
    { id: 'nl-NL-MaartenNeural', name: 'Maarten', gender: 'male' },
  ],
  pl: [
    { id: 'pl-PL-AgnieszkaNeural', name: 'Agnieszka', gender: 'female' },
    { id: 'pl-PL-MarekNeural', name: 'Marek', gender: 'male' },
  ],
  th: [
    { id: 'th-TH-PremwadeeNeural', name: 'Premwadee', gender: 'female' },
    { id: 'th-TH-NiwatNeural', name: 'Niwat', gender: 'male' },
  ],
  vi: [
    { id: 'vi-VN-HoaiMyNeural', name: 'HoaiMy', gender: 'female' },
    { id: 'vi-VN-NamMinhNeural', name: 'NamMinh', gender: 'male' },
  ],
  id: [
    { id: 'id-ID-GadisNeural', name: 'Gadis', gender: 'female' },
    { id: 'id-ID-ArdiNeural', name: 'Ardi', gender: 'male' },
  ],
  uk: [
    { id: 'uk-UA-PolinaNeural', name: 'Polina', gender: 'female' },
    { id: 'uk-UA-OstapNeural', name: 'Ostap', gender: 'male' },
  ],
}

// ─── Preview phrases per language (natural, short, showcases the voice) ───────

const PREVIEW_PHRASES: Record<string, string> = {
  en: "Hi there! How's your day going so far?",
  fr: "Bonjour ! Comment se passe votre journée ?",
  es: "¡Hola! ¿Cómo va tu día hasta ahora?",
  de: "Hallo! Wie läuft dein Tag bisher?",
  it: "Ciao! Come sta andando la tua giornata?",
  pt: "Olá! Como está sendo o seu dia?",
  ja: "こんにちは！今日はどんな一日ですか？",
  ko: "안녕하세요! 오늘 하루 어떠세요?",
  zh: "你好！今天过得怎么样？",
  ar: "مرحباً! كيف يسير يومك حتى الآن؟",
  tr: "Merhaba! Bugün nasıl gidiyor?",
  ru: "Привет! Как проходит ваш день?",
  hi: "नमस्ते! आपका दिन कैसा चल रहा है?",
  nl: "Hallo! Hoe gaat je dag tot nu toe?",
  pl: "Cześć! Jak mija Ci dzień?",
  th: "สวัสดีค่ะ! วันนี้เป็นอย่างไรบ้างคะ?",
  vi: "Xin chào! Hôm nay của bạn thế nào?",
  id: "Halo! Bagaimana harimu sejauh ini?",
  uk: "Привіт! Як проходить ваш день?",
  sv: "Hej! Hur går din dag hittills?",
  da: "Hej! Hvordan går din dag indtil videre?",
  fi: "Hei! Miten päiväsi sujuu?",
  el: "Γεια σου! Πώς πάει η μέρα σου;",
  cs: "Ahoj! Jak se ti dnes daří?",
  ro: "Bună! Cum îți merge ziua?",
  hu: "Szia! Hogy telik a napod eddig?",
}

// ─── Component ────────────────────────────────────────────────────────────────

interface VoicePickerProps {
  targetLanguage: string
  selectedLiveVoice: string
  selectedChatVoice: string
  onLiveVoiceChange: (voice: string) => void
  onChatVoiceChange: (voice: string) => void
}

export function VoicePicker({
  targetLanguage,
  selectedLiveVoice,
  selectedChatVoice,
  onLiveVoiceChange,
  onChatVoiceChange,
}: VoicePickerProps) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)

  const chatVoices = EDGE_VOICES[targetLanguage] || EDGE_VOICES['en'] || []

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* ok */ }
      sourceRef.current = null
    }
    setPreviewingVoice(null)
  }, [])

  const handlePreview = useCallback(async (voiceId: string, type: 'live' | 'chat') => {
    // Stop any current preview
    stopPreview()

    if (previewingVoice === voiceId) {
      return
    }

    setPreviewingVoice(voiceId)

    // Use a sample phrase in the target language for natural preview
    const sampleText = PREVIEW_PHRASES[targetLanguage] || PREVIEW_PHRASES['en']

    try {
      const res = await fetch('/api/gemini/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceName: voiceId,
          languageCode: targetLanguage,
          provider: type === 'live' ? 'gemini' : 'edge',
        }),
      })

      if (!res.ok) throw new Error('Preview failed')
      const { audioData, format } = await res.json()
      if (!audioData) throw new Error('No audio')

      if (format === 'mp3') {
        // MP3 — play with Audio element (native browser support)
        const blob = new Blob(
          [Uint8Array.from(atob(audioData), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        )
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          setPreviewingVoice(null)
          URL.revokeObjectURL(url)
        }
        audio.play()
      } else {
        // PCM — decode with AudioContext (needs WAV header wrapping)
        const buffer = await decodeBase64Pcm(audioData, 24000, 'pcm')
        const ctx = getAudioContext()
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.connect(ctx.destination)
        sourceRef.current = src
        src.onended = () => {
          sourceRef.current = null
          setPreviewingVoice(null)
        }
        src.start(0)
      }
    } catch (err) {
      console.warn('[VoicePicker] Preview failed:', err)
      setPreviewingVoice(null)
    }
  }, [previewingVoice, targetLanguage, stopPreview])

  return (
    <div className="space-y-4">
      {/* ── Live Call Voice ── */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Phone className="w-3 h-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">Live Call Voice</span>
          <span className="text-[10px] text-muted-foreground/60 ml-auto flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" /> Premium
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {GEMINI_VOICES.slice(0, 12).map((voice) => (
            <VoicePill
              key={voice.name}
              name={voice.name}
              subtitle={voice.style}
              selected={selectedLiveVoice === voice.name}
              previewing={previewingVoice === voice.name}
              onSelect={() => onLiveVoiceChange(voice.name)}
              onPreview={() => handlePreview(voice.name, 'live')}
            />
          ))}
        </div>

        {/* Show more toggle */}
        <ShowMoreVoices
          voices={GEMINI_VOICES.slice(12)}
          selectedVoice={selectedLiveVoice}
          previewingVoice={previewingVoice}
          onSelect={onLiveVoiceChange}
          onPreview={(name) => handlePreview(name, 'live')}
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-border/30" />

      {/* ── Chat Voice ── */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-secondary/20 to-secondary/10 flex items-center justify-center">
            <MessageCircle className="w-3 h-3 text-secondary" />
          </div>
          <span className="text-xs font-semibold text-foreground">Chat Voice</span>
          <span className="text-[10px] text-muted-foreground/60 ml-auto">Natural</span>
        </div>

        {chatVoices.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chatVoices.map((voice) => (
              <VoicePill
                key={voice.id}
                name={voice.name}
                subtitle={voice.gender === 'female' ? '♀' : '♂'}
                selected={selectedChatVoice === voice.id}
                previewing={previewingVoice === voice.id}
                onSelect={() => onChatVoiceChange(voice.id)}
                onPreview={() => handlePreview(voice.id, 'chat')}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic px-1">
            No voices available for this language yet
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VoicePill({
  name, subtitle, selected, previewing, onSelect, onPreview,
}: {
  name: string
  subtitle: string
  selected: boolean
  previewing: boolean
  onSelect: () => void
  onPreview: () => void
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-xl border transition-all duration-200 cursor-pointer',
        selected
          ? 'bg-gradient-to-r from-primary/12 to-secondary/8 border-primary/40 shadow-sm'
          : 'bg-card/50 border-border/30 hover:border-border/60 hover:bg-card/70'
      )}
      onClick={onSelect}
    >
      <span className={cn(
        'text-[11px] font-semibold transition-colors',
        selected ? 'text-primary' : 'text-foreground/80'
      )}>
        {name}
      </span>
      <span className="text-[9px] text-muted-foreground/50">{subtitle}</span>

      {/* Preview button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPreview() }}
        className={cn(
          'w-5 h-5 rounded-md flex items-center justify-center transition-all ml-0.5',
          'opacity-0 group-hover:opacity-100',
          previewing
            ? 'bg-primary/20 text-primary opacity-100'
            : 'hover:bg-muted/60 text-muted-foreground/60'
        )}
        aria-label={`Preview ${name}`}
      >
        {previewing
          ? <Square className="w-2.5 h-2.5 fill-current" />
          : <Play className="w-2.5 h-2.5 fill-current" />
        }
      </button>

      {/* Selected indicator */}
      {selected && (
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary shadow-sm" />
      )}
    </div>
  )
}

function ShowMoreVoices({
  voices, selectedVoice, previewingVoice, onSelect, onPreview,
}: {
  voices: GeminiVoice[]
  selectedVoice: string
  previewingVoice: string | null
  onSelect: (name: string) => void
  onPreview: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (voices.length === 0) return null

  return (
    <>
      {expanded && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {voices.map((voice) => (
            <VoicePill
              key={voice.name}
              name={voice.name}
              subtitle={voice.style}
              selected={selectedVoice === voice.name}
              previewing={previewingVoice === voice.name}
              onSelect={() => onSelect(voice.name)}
              onPreview={() => onPreview(voice.name)}
            />
          ))}
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[10px] font-medium text-muted-foreground/70 hover:text-primary transition-colors px-1"
      >
        {expanded ? 'Show less' : `+${voices.length} more voices`}
      </button>
    </>
  )
}
