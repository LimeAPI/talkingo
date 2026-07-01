'use client'

/* Hallmark · macrostructure: Atmospheric Rooms · genre: editorial-premium
 * accent: gold 78° (brand, from logo) · nav: N5 floating pill · footer: Ft5 statement
 * Mostly-light with intentional dark "rooms" (Modes · Philosophy · Finale). */

import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  ArrowRight, MessageCircle, Mic, Globe2, Phone, ChevronRight, Sparkles,
  BadgeCheck, Star, Zap, Languages as LanguagesIcon, Waypoints, Quote,
} from 'lucide-react'
import { useState, useEffect, type ReactNode } from 'react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'
import { PersonaSampleButton } from '@/components/ui/PersonaSampleButton'
import { useAuth } from '@/context/AuthContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ConversationPage } from '@/components/conversation/ConversationPage'

/* ── Data ────────────────────────────────────────────────────────── */

const modes = [
  { icon: MessageCircle, name: 'Chat', desc: 'Type at your own pace. The AI guides every exchange with live corrections and tips.', span: 'lp-span-3' },
  { icon: Mic, name: 'Handsfree', desc: 'Speak naturally. Real-time voice — no typing required.', span: 'lp-span-3' },
  { icon: Phone, name: 'Live Call', desc: 'Simulated voice calls. Real-world pressure, zero stakes.', span: 'lp-span-2' },
  { icon: Globe2, name: 'Native', desc: 'Full immersion. Think, speak, and get corrected entirely in your target language.', span: 'lp-span-4' },
]

const tutors = [
  { id: 'eli', name: 'Eli', role: 'Warm guide', desc: 'Community nurse who slows down for you. Patient, encouraging, makes every word feel safe.' },
  { id: 'alex', name: 'Alex', role: 'Witty barista', desc: '24-year-old who talks like your friend. Quick, casual, full of slang and humor.' },
  { id: 'dr-luma', name: 'Dr. Luma', role: 'Executive coach', desc: 'Sharp, no fluff. Breaks down every nuance with surgical precision.' },
  { id: 'sofia', name: 'Sofia', role: 'Travel journalist', desc: 'Loves a good story. Teaches through culture, anecdotes, and real-world context.' },
  { id: 'riko', name: 'Riko', role: 'Art student', desc: 'Fast-talking 21-year-old. Full of energy, pop culture, and natural flow.' },
  { id: 'marco', name: 'Marco', role: 'Philosophy professor', desc: 'Asks "but why?" Pushes you to think deeper while you speak.' },
]

const levels = [
  { name: 'First Words', tier: 'Courage', tierNum: 1 },
  { name: 'Building Blocks', tier: 'Courage', tierNum: 1 },
  { name: 'Survival Mode', tier: 'Own sentences', tierNum: 2 },
  { name: 'Getting Comfortable', tier: 'Own sentences', tierNum: 2 },
  { name: 'Conversation Ready', tier: 'Flow', tierNum: 3 },
  { name: 'Finding Flow', tier: 'Flow', tierNum: 3 },
  { name: 'Confident Speaker', tier: 'Nuance', tierNum: 4 },
  { name: 'Nuance Hunter', tier: 'Nuance', tierNum: 4 },
  { name: 'Almost Native', tier: 'Nuance', tierNum: 4 },
  { name: 'Native Vibes', tier: 'Peer', tierNum: 5 },
  { name: 'Polished', tier: 'Peer', tierNum: 5 },
  { name: 'Mastery', tier: 'Peer', tierNum: 5 },
]

const languages = [
  { native: 'Español', english: 'Spanish' }, { native: 'Français', english: 'French' },
  { native: 'Deutsch', english: 'German' }, { native: 'Italiano', english: 'Italian' },
  { native: '日本語', english: 'Japanese' }, { native: '한국어', english: 'Korean' },
  { native: '中文', english: 'Mandarin' }, { native: 'Русский', english: 'Russian' },
  { native: 'العربية', english: 'Arabic' }, { native: 'Português', english: 'Portuguese' },
  { native: 'हिन्दी', english: 'Hindi' }, { native: 'Türkçe', english: 'Turkish' },
  { native: 'Nederlands', english: 'Dutch' }, { native: 'Polski', english: 'Polish' },
  { native: 'Українська', english: 'Ukrainian' }, { native: 'Tiếng Việt', english: 'Vietnamese' },
  { native: 'ไทย', english: 'Thai' }, { native: 'Bahasa Indonesia', english: 'Indonesian' },
  { native: 'Română', english: 'Romanian' }, { native: 'فارسی', english: 'Persian' },
  { native: 'עברית', english: 'Hebrew' }, { native: 'Ελληνικά', english: 'Greek' },
  { native: 'Magyar', english: 'Hungarian' }, { native: 'Kiswahili', english: 'Swahili' },
  { native: 'اردو', english: 'Urdu' }, { native: 'தமிழ்', english: 'Tamil' },
  { native: 'తెలుగు', english: 'Telugu' }, { native: 'मराठी', english: 'Marathi' },
  { native: 'বাংলা', english: 'Bengali' }, { native: 'Filipino', english: 'Filipino' },
]

const steps = [
  { n: '01', title: 'Pick a tutor & language', desc: 'Choose from 6 distinct personalities across 30 languages. Each one speaks, jokes, and corrects differently.' },
  { n: '02', title: 'Just start talking', desc: 'No lessons to unlock, no streaks to protect. Say something — anything — and the conversation begins.' },
  { n: '03', title: 'Get corrected in the moment', desc: 'Real-time fixes and native-speaker rewrites, woven into the chat so you learn the way you actually acquired your first language.' },
]

const plans = [
  { name: 'Free', price: '$0', period: '/mo', desc: 'Try it out — 50 free messages.',
    features: ['50 free messages', '2 tutors (Eli & Alex)', 'Levels 1–4', 'Text-based chat', 'Basic corrections'],
    cta: 'Start free', featured: false },
  { name: 'Premium', price: '$30', period: '/mo', desc: 'Full access. Cancel anytime.',
    features: ['Unlimited conversations', 'All 6 AI tutors', 'All 12 levels', 'All 4 conversation modes', 'Voice recording & playback', 'Full session recaps', 'Native-language rewrites'],
    cta: 'Start 5-day trial', featured: true, badge: '5-day trial · $5' },
  { name: 'Yearly', price: '$360', period: '/yr', desc: 'Everything in Premium, billed once.',
    features: ['All Premium features', 'Billed annually', 'Priority support', 'Early access to new languages'],
    cta: 'Go yearly', featured: false },
]

const testimonials = [
  { quote: 'I tried another popular app for months and could barely order food. After two weeks on Talkingo, I had a 10-minute conversation with my grandmother in Spanish.', name: 'Maria K.', role: 'Learning Spanish for family' },
  { quote: "The corrections are instant and actually useful. It doesn't just tell me I'm wrong — it shows me what a native speaker would say.", name: 'David L.', role: 'B1 French learner' },
]

const faqs = [
  { q: 'Do I need to know anything to start?', a: 'Zero. Every tutor adapts to your level — from absolute beginner to near-native. You just show up and speak.' },
  { q: 'How is this different from Duolingo?', a: 'Duolingo teaches you about a language. Talkingo lets you live it — real conversations, real corrections, real fluency. No drills, no flashcards, no gamified streaks.' },
  { q: 'Which languages can I learn?', a: '30 languages including Spanish, Japanese, French, German, Korean, Mandarin, Arabic, Hindi, Swahili, and more. New languages are added as our AI tutors are trained on them.' },
  { q: 'How does the AI know my level?', a: 'Our 12-level system tunes vocabulary, speed, and complexity automatically. You can jump between levels anytime.' },
  { q: 'Can I cancel anytime?', a: 'Yes. No lock-in. Cancel from your account with one click and your subscription ends at the period boundary.' },
]

const stats = [
  { value: '30', label: 'Languages' },
  { value: '6', label: 'AI Tutors' },
  { value: '12', label: 'Levels' },
  { value: '4', label: 'Modes' },
]

/* ── Motion helpers ──────────────────────────────────────────────── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: .6, delay: i * .07, ease: [.16, 1, .3, 1] } }),
}

function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      custom={i}
      variants={reduce ? undefined : fadeUp}
      initial={reduce ? undefined : 'hidden'}
      whileInView={reduce ? undefined : 'show'}
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </motion.div>
  )
}

function SectionHead({ label, title, sub, center }: { label: string; title: ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'flex flex-col items-center text-center' : ''}>
      <span className="lp-eyebrow">{label}</span>
      <h2 className={`lp-h2 mt-5 ${center ? 'mx-auto' : ''}`}>{title}</h2>
      {sub && <p className={`lp-sub ${center ? 'mx-auto' : ''}`}>{sub}</p>}
    </div>
  )
}

/* ── Entry ───────────────────────────────────────────────────────── */

export default function Home() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <ConversationPage />
  return <LandingPage />
}

function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [showCta, setShowCta] = useState(false)

  // Sticky CTA only appears after the hero, and retreats near the footer.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const past = y > window.innerHeight * 0.85
      const nearBottom = y + window.innerHeight > document.documentElement.scrollHeight - 720
      setShowCta(past && !nearBottom)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <main className="lp relative min-h-screen bg-background text-foreground overflow-x-clip">

      {/* ═══ NAV ═══ */}
      <nav className="lp-nav" aria-label="Primary">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <TalkingoLogo size="sm" />
          <span className="text-[13px] font-semibold tracking-tight">Talkingo</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6">
          <a href="#how" className="lp-navlink">How it works</a>
          <a href="#modes" className="lp-navlink">Modes</a>
          <a href="#tutors" className="lp-navlink">Tutors</a>
          <a href="#pricing" className="lp-navlink">Pricing</a>
        </div>
        <Link href="/signup" className="lp-btn lp-btn--pill">
          Start free <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="lp-mesh" aria-hidden />
        <div className="lp-grid absolute inset-0 -z-0 opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 pt-36 pb-28 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
            {/* Left */}
            <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .7, ease: [.16, 1, .3, 1] }} className="space-y-7">
              <span className="lp-tag">
                <Sparkles className="h-3.5 w-3.5" /> AI tutors that actually talk back
              </span>
              <h1 className="font-display text-[clamp(2.7rem,6vw+0.5rem,4.75rem)] font-semibold
                             leading-[1.02] tracking-[-.045em] text-[oklch(var(--color-ink))]"
                  style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                Speak a new language
                <br />
                <span className="lp-gold-text">from day one.</span>
              </h1>
              <p className="max-w-[46ch] text-[oklch(var(--color-muted))] text-[1.05rem] leading-relaxed">
                Real conversations with AI tutors in 30 languages. Instant corrections,
                natural speech, zero drills — the way you actually learned your first language.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href="/signup" className="lp-btn lp-btn--primary">
                  Start speaking free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="#how" className="lp-btn lp-btn--ghost">See how it works</Link>
              </div>
              <div className="flex flex-wrap gap-x-10 gap-y-4 pt-6">
                {stats.map(s => (
                  <div key={s.label}>
                    <span className="lp-stat__value">{s.value}</span>
                    <span className="lp-stat__label">{s.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right — demo */}
            <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .7, delay: .12, ease: [.16, 1, .3, 1] }}
              className="relative">
              <div className="lp-float -left-4 top-10 hidden sm:flex" >
                <Zap className="h-3.5 w-3.5 text-[oklch(var(--color-accent))]" /> Instant correction
              </div>
              <div className="lp-float -right-3 bottom-8 hidden sm:flex">
                <Mic className="h-3.5 w-3.5 text-[oklch(var(--color-accent))]" /> Voice or text
              </div>
              <div className="lp-demo">
                <div className="lp-demo__top">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full
                                    bg-[oklch(var(--color-accent)/.14)] text-[11px] font-bold text-[oklch(var(--color-accent-dim))]">E</div>
                    <div>
                      <p className="text-[13px] font-semibold">Eli · Spanish</p>
                      <p className="text-[10px] text-[oklch(var(--color-muted))]">A1 · First Words</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-[oklch(var(--color-success)/.12)]
                                   px-2.5 py-1 text-[10px] font-semibold text-[oklch(var(--color-success))]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[oklch(var(--color-success))] animate-pulse" /> Live
                  </span>
                </div>
                <div className="lp-demo__body">
                  <div className="lp-msg lp-msg--ai" style={{ animationDelay: '.5s' }}>
                    ¡Hola! Soy Eli. ¿De dónde eres?
                  </div>

                  <div className="lp-msg__wrap" style={{ animationDelay: '1.1s' }}>
                    <span className="lp-msg__badge">
                      <Sparkles className="h-2.5 w-2.5" /> 1
                    </span>
                    <div className="lp-msg lp-msg--user">Soy de Estados Unidos. Aprendo español.</div>
                  </div>

                  <div className="lp-corr" style={{ animationDelay: '1.7s' }}>
                    <div className="lp-corr__head">
                      <Sparkles className="h-3 w-3" /> 1 correction
                    </div>
                    <div className="lp-corr__body">
                      <span className="lp-corr__tag">grammar</span>
                      <div className="lp-corr__diff">
                        <span className="lp-corr__old">Aprendo</span>
                        <ArrowRight className="h-3 w-3 text-[oklch(var(--color-accent)/.7)]" />
                        <span className="lp-corr__new">Estoy aprendiendo</span>
                      </div>
                      <p className="lp-corr__note">For something happening right now, Spanish prefers the present continuous.</p>
                    </div>
                  </div>

                  <div className="lp-typing" style={{ animationDelay: '2.4s' }}>
                    <span /><span /><span />
                  </div>
                </div>
                <div className="lp-demo__input">
                  <Mic className="h-4 w-4 text-[oklch(var(--color-accent))]" />
                  <span className="text-[13px] text-[oklch(var(--color-muted))]">Tap to speak…</span>
                  <span className="lp-wave"><i /><i /><i /><i /><i /></span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ TRUST STRIP ═══ */}
      <section className="border-y border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper-2)/.5)]">
        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[12px] font-medium text-[oklch(var(--color-muted))]">
            <span className="text-[oklch(var(--color-ink))] font-semibold">No drills.</span>
            <span className="opacity-40">/</span>
            <span>No flashcards.</span>
            <span className="opacity-40">/</span>
            <span>No cartoon owls.</span>
            <span className="opacity-40">/</span>
            <span>No streak guilt.</span>
            <span className="opacity-40">/</span>
            <span className="text-[oklch(var(--color-accent-dim))] font-semibold">Just conversation.</span>
          </div>
        </div>
      </section>

      {/* ═══ PROBLEM ═══ */}
      <section className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <Reveal>
            <SectionHead
              label="01 — The problem"
              title={<>You&apos;ve &ldquo;learned&rdquo; for months.<br /><span className="lp-gold-text">Can you actually speak?</span></>}
            />
          </Reveal>
          <Reveal i={1}>
            <div className="space-y-6 lg:pt-14">
              <p className="text-[1.05rem] leading-relaxed text-[oklch(var(--color-muted))]">
                Most apps gamify vocabulary and call it fluency. You collect points, protect streaks,
                and translate flashcards — then freeze the moment a real person speaks to you.
              </p>
              <p className="text-[1.05rem] leading-relaxed text-[oklch(var(--color-ink))] font-medium">
                Language isn&apos;t a quiz. It&apos;s a conversation. Talkingo drops you into that
                conversation on day one — and stays patient until it feels effortless.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <hr className="lp-rule" />

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <Reveal><SectionHead label="02 — How it works" title="Three steps. Then you're talking." center /></Reveal>
        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} i={i} className="lp-step">
              <span className="lp-step__num">{s.n}</span>
              <h3 className="text-lg font-semibold text-[oklch(var(--color-ink))]">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ MODES · DARK ROOM ═══ */}
      <section id="modes" className="lp-dark relative overflow-hidden">
        <div className="lp-mesh opacity-80" aria-hidden />
        <div className="lp-dotgrid absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 py-32 lg:px-8">
          <Reveal>
            <SectionHead
              label="03 — Conversation modes"
              title={<>Four ways to talk.<br /><span className="text-[oklch(var(--color-accent))]">Switch anytime.</span></>}
              sub="Every mode adapts in real time — start typing, jump to voice mid-sentence, take a call."
            />
          </Reveal>
          <Reveal i={1}>
            <div className="lp-bento mt-14">
              {modes.map(m => {
                const I = m.icon
                return (
                  <div key={m.name} className={`lp-bento__cell ${m.span}`}>
                    <div className="lp-bento__icon"><I className="h-5 w-5" /></div>
                    <h3 className="text-lg font-semibold text-[oklch(var(--color-ink))]">{m.name}</h3>
                    <p className="text-[13.5px] leading-relaxed text-[oklch(var(--color-muted))]">{m.desc}</p>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ TUTORS ═══ */}
      <section id="tutors" className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <Reveal>
          <SectionHead
            label="04 — Meet the tutors"
            title="Six tutors. Six personalities."
            sub="Every tutor speaks differently — pick the one that matches how you want to learn, then hear their voice."
          />
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tutors.map((t, i) => (
            <Reveal key={t.id} i={i % 3} className="lp-tutor">
              <div className="flex items-center gap-3">
                <div className="lp-tutor__avatar">{t.name[0]}</div>
                <div>
                  <h3 className="text-[14px] font-semibold leading-tight">{t.name}</h3>
                  <span className="text-[11px] font-medium text-[oklch(var(--color-accent-dim))]">{t.role}</span>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed text-[oklch(var(--color-muted))]">{t.desc}</p>
              <div className="mt-auto pt-1 text-[oklch(var(--color-accent))]">
                <PersonaSampleButton personaId={t.id} />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <hr className="lp-rule" />

      {/* ═══ LANGUAGES · MARQUEE ═══ */}
      <section className="py-28 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <SectionHead
              label="05 — Languages"
              title={<>30 languages.<br /><span className="lp-gold-text">Zero textbooks.</span></>}
              sub="From Spanish to Swahili — every language is taught through conversation, never memorization."
              center
            />
          </Reveal>
        </div>
        <div className="mt-16 space-y-4">
          <div className="lp-marquee">
            <div className="lp-marquee__track lp-marquee__track--a">
              {[...languages.slice(0, 15), ...languages.slice(0, 15)].map((l, i) => (
                <div key={`a${i}`} className="lp-chip">
                  <span className="lp-chip__native">{l.native}</span>
                  <span className="lp-chip__en">{l.english}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-marquee">
            <div className="lp-marquee__track lp-marquee__track--b">
              {[...languages.slice(15), ...languages.slice(15)].map((l, i) => (
                <div key={`b${i}`} className="lp-chip">
                  <span className="lp-chip__native">{l.native}</span>
                  <span className="lp-chip__en">{l.english}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="lp-rule" />

      {/* ═══ LEVELS · TIMELINE ═══ */}
      <section className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <SectionHead
                label="06 — The path"
                title={<>12 levels.<br />5 stages.<br /><span className="lp-gold-text">One path.</span></>}
                sub="From your very first words to native-level nuance — each level quietly tunes vocabulary, speed, and how deep the corrections go."
              />
              <div className="mt-8 flex items-center gap-2 text-[12px] font-medium text-[oklch(var(--color-muted))]">
                <Waypoints className="h-4 w-4 text-[oklch(var(--color-accent))]" />
                You can jump between levels anytime.
              </div>
            </div>
          </Reveal>
          <Reveal i={1}>
            <div className="lp-timeline">
              {levels.map((l, i) => (
                <div key={l.name} className={`lp-tl ${i < 6 ? 'lp-tl--on' : ''}`}>
                  <span className="lp-tl__name">{l.name}</span>
                  <span className="lp-tl__tier">· Tier {l.tierNum} · {l.tier}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ PHILOSOPHY · DARK ROOM ═══ */}
      <section className="lp-dark relative overflow-hidden">
        <div className="lp-mesh opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 py-36 lg:px-8 text-center">
          <Reveal className="flex flex-col items-center">
            <span className="lp-eyebrow">07 — Why Talkingo</span>
            <p className="lp-statement mx-auto mt-8">
              You didn&apos;t learn your first language with flashcards.
              <span className="text-[oklch(var(--color-accent))]"> You learned it by talking.</span>
            </p>
            <p className="mt-8 max-w-[48ch] mx-auto text-[1.05rem] leading-relaxed text-[oklch(var(--color-muted))]">
              No points. No leaderboards. No guilt for missing a day. Just a tutor who listens,
              corrects, and keeps the conversation going until the words feel like your own.
            </p>
            <div className="mt-10">
              <Link href="/signup" className="lp-btn lp-btn--primary">
                Have your first conversation <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <Reveal><SectionHead label="08 — In their words" title="People who stopped studying — and started speaking." /></Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <Reveal key={i} i={i} className="lp-quote">
              <Quote className="h-6 w-6 text-[oklch(var(--color-accent)/.4)]" />
              <p className="text-[15px] leading-relaxed text-[oklch(var(--color-ink))]">{t.quote}</p>
              <div className="flex items-center gap-3 pt-1">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-[oklch(var(--color-accent))] text-[oklch(var(--color-accent))]" />
                  ))}
                </div>
                <div className="text-[12px]">
                  <span className="font-semibold text-[oklch(var(--color-ink))]">{t.name}</span>
                  <span className="text-[oklch(var(--color-muted))]"> · {t.role}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <hr className="lp-rule" />

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <Reveal>
          <SectionHead label="09 — Pricing" title="Simple pricing." sub="Start free with 50 messages. Upgrade when you're ready — cancel in one click." center />
        </Reveal>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} i={i} className={`lp-price ${p.featured ? 'lp-price--feat' : ''}`}>
              {(p.badge || p.featured) && (
                <span className="self-start rounded-full bg-[oklch(var(--color-accent)/.12)] px-3 py-1
                                 text-[11px] font-semibold text-[oklch(var(--color-accent-dim))]">
                  {p.badge ?? 'Most popular'}
                </span>
              )}
              <div>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-0.5 text-[12px] text-[oklch(var(--color-muted))]">{p.desc}</p>
              </div>
              <div className="lp-price__amt">
                {p.price}<span className="text-base font-normal text-[oklch(var(--color-muted))]">{p.period}</span>
              </div>
              <ul className="space-y-2 text-[12.5px] text-[oklch(var(--color-muted))]">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <BadgeCheck className="h-4 w-4 shrink-0 mt-px text-[oklch(var(--color-accent))]" />{f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`lp-btn mt-auto w-full ${p.featured ? 'lp-btn--primary' : 'lp-btn--ghost'}`}>
                {p.cta}
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <hr className="lp-rule" />

      {/* ═══ FAQ ═══ */}
      <section className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
        <Reveal><SectionHead label="10 — FAQ" title="Questions people ask." center /></Reveal>
        <div className="mt-12">
          {faqs.map((f, i) => (
            <div key={i} className="lp-faq">
              <button className="lp-faq__q" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                <span>{f.q}</span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-[oklch(var(--color-accent))] transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
              </button>
              <motion.div
                initial={false}
                animate={{ height: openFaq === i ? 'auto' : 0, opacity: openFaq === i ? 1 : 0 }}
                transition={{ duration: .3, ease: [.16, 1, .3, 1] }}
                className="lp-faq__a"
              >
                <p className="pb-4">{f.a}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FINALE · DARK ROOM ═══ */}
      <footer className="lp-dark relative overflow-hidden">
        <div className="lp-mesh opacity-90" aria-hidden />
        <div className="lp-dotgrid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-28 lg:px-8 text-center">
          <hr className="lp-rule lp-rule--short mb-12" />
          <p className="lp-statement mx-auto">
            The world speaks.
            <br /><span className="text-[oklch(var(--color-accent))]">So should you.</span>
          </p>
          <p className="mt-7 max-w-[42ch] mx-auto text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">
            Built for real conversations — not gamified streaks, not cartoon owls, not fill-in-the-blank drills.
          </p>
          <div className="mt-10">
            <Link href="/signup" className="lp-btn lp-btn--primary">
              Start speaking free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-6 text-[12px] text-[oklch(var(--color-muted))]">
            <Link href="/privacy" className="hover:text-[oklch(var(--color-ink))] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[oklch(var(--color-ink))] transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-[oklch(var(--color-ink))] transition-colors">Sign in</Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-3">
            <TalkingoLogo size="md" />
            <span className="font-display text-2xl font-semibold tracking-tight text-[oklch(var(--color-ink))]">Talkingo</span>
          </div>
          <p className="mt-5 text-[11px] text-[oklch(var(--color-muted))]">© {new Date().getFullYear()} Talkingo</p>
        </div>
      </footer>

      {/* ═══ STICKY CTA ═══ */}
      <motion.aside
        className="lp-ctabar"
        initial={false}
        animate={{ y: showCta ? 0 : 120, opacity: showCta ? 1 : 0 }}
        transition={{ duration: .35, ease: [.16, 1, .3, 1] }}
        style={{ pointerEvents: showCta ? 'auto' : 'none' }}
      >
        <span className="text-[13px] font-medium text-[oklch(var(--color-ink))]">Ready to have real conversations?</span>
        <Link href="/signup" className="lp-btn lp-btn--pill">
          Start speaking <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </motion.aside>
    </main>
  )
}
