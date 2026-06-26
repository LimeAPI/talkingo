'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  ChevronRight,
  Globe2,
  MessageCircle,
  Mic,
  Phone,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { TalkingoSparkles } from '@/components/ui/talkingo-sparkles'
import { PersonaSampleButton } from '@/components/ui/PersonaSampleButton'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'
import { useAuth } from '@/context/AuthContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ConversationPage } from '@/components/conversation/ConversationPage'

/* ── Data ────────────────────────────────────────────────────────── */

const modes = [
  { icon: MessageCircle, name: 'Chat', desc: 'Type at your own pace with AI guidance', hint: 'Great for beginners' },
  { icon: Mic, name: 'Handsfree', desc: 'Speak naturally with real-time voice AI', hint: 'Build speaking confidence' },
  { icon: Globe2, name: 'Native', desc: 'Full immersion in your target language', hint: 'Think in the language' },
  { icon: Phone, name: 'Live Call', desc: 'Simulated voice calls with AI tutors', hint: 'Real-world pressure' },
]

// Persona accent colors map to design-system tokens (no inline hex).
const personaTones = {
  eli:     { color: 'text-primary',   border: 'border-primary/30',   bg: 'bg-primary/15',   text: 'text-primary'   },
  alex:    { color: 'text-secondary', border: 'border-secondary/30', bg: 'bg-secondary/15', text: 'text-secondary' },
  drLuma:  { color: 'text-accent',    border: 'border-accent/30',    bg: 'bg-accent/15',    text: 'text-accent'    },
  sofia:   { color: 'text-info',      border: 'border-info/30',      bg: 'bg-info/15',      text: 'text-info'      },
  riko:    { color: 'text-success',   border: 'border-success/30',   bg: 'bg-success/15',   text: 'text-success'   },
  marco:   { color: 'text-warning',   border: 'border-warning/30',   bg: 'bg-warning/15',   text: 'text-warning'   },
} as const

const personas = [
  { id: 'eli',      name: 'Eli',     desc: 'Friendly guide for easy, warm conversations',            level: 'A1-A2',  tone: personaTones.eli    },
  { id: 'alex',     name: 'Alex',    desc: 'Coach who pushes your daily speaking confidence',        level: 'A2-B1',  tone: personaTones.alex   },
  { id: 'dr-luma',  name: 'Dr. Luma',desc: 'Linguist who breaks down every nuance',                  level: 'B1-C1',  tone: personaTones.drLuma },
  { id: 'sofia',    name: 'Sofia',   desc: 'Cultural guide through real-world scenarios',            level: 'All',    tone: personaTones.sofia  },
  { id: 'riko',     name: 'Riko',    desc: 'Precision teacher for advanced fluency',                 level: 'B2-C2',  tone: personaTones.riko   },
  { id: 'marco',    name: 'Marco',   desc: 'Energetic partner for fast-paced natural talk',          level: 'A2-B2',  tone: personaTones.marco  },
]

const levels = [
  'First Words', 'Building Blocks', 'Survival Mode', 'Daily Explorer',
  'Conversation Ready', 'Confident Talker', 'Confident Speaker', 'Advanced Talker',
  'Almost Native', 'Expert Speaker', 'Precision Speaker', 'Mastery',
]

const languages = [
  { native: 'Español', english: 'Spanish', code: 'es' },
  { native: '日本語', english: 'Japanese', code: 'ja' },
  { native: '中文', english: 'Mandarin', code: 'zh' },
  { native: 'Français', english: 'French', code: 'fr' },
  { native: 'Deutsch', english: 'German', code: 'de' },
  { native: 'Italiano', english: 'Italian', code: 'it' },
  { native: 'Português', english: 'Portuguese', code: 'pt' },
  { native: 'Русский', english: 'Russian', code: 'ru' },
  { native: 'العربية', english: 'Arabic', code: 'ar' },
  { native: '한국어', english: 'Korean', code: 'ko' },
  { native: 'हिन्दी', english: 'Hindi', code: 'hi' },
  { native: 'Türkçe', english: 'Turkish', code: 'tr' },
]

const scenarios = [
  'Order Coffee', 'Meet Someone New', 'Ask for Directions', 'Go Shopping',
  'At a Restaurant', 'Talk About Hobbies', 'Make a Phone Call', 'Visit the Doctor',
  'Book a Hotel', 'Job Interview', 'At the Airport', 'Daily Routine',
  'Talk About Weather', 'Ask for Help', 'Share Opinions', 'Plan a Trip',
  'Order Food Delivery', 'Small Talk', 'At the Bank', 'Emergency Situations',
]

const pricingPlans = [
  { name: 'Free', price: '$0', desc: 'Get started and explore', features: ['Daily warm-up prompts', 'Basic AI voice practice', '1 conversation mode'], popular: false, cta: 'Get started' },
  { name: 'Pro', price: '$12', desc: 'For serious fluency seekers', features: ['Unlimited voice sessions', 'All 4 conversation modes', 'Advanced corrections & feedback', 'Progress analytics & insights', 'All 6 AI tutors'], popular: true, cta: 'Start Pro' },
  { name: 'Team', price: '$29', desc: 'For groups & families', features: ['Everything in Pro', 'Up to 5 members', 'Shared progress tracking', 'Priority support'], popular: false, cta: 'Start Team plan' },
]

const faqs = [
  { q: 'Do I need to be fluent in anything to start?', a: 'Not at all. Every AI tutor adapts to your current level — from absolute beginner to near-native. You just show up and speak.' },
  { q: 'How is this different from Duolingo or Babbel?', a: 'Those teach you about a language. Talkingo lets you live it — real conversations, real corrections, real fluency. No drills, no flashcards.' },
  { q: 'Which languages can I practice?', a: `We currently support ${languages.length} languages including Spanish, Japanese, Mandarin, French, German, Italian, Portuguese, Russian, Arabic, Korean, Hindi, and Turkish. More are added as the tutors are trained on them.` },
  { q: 'How does the AI know my level?', a: 'We use a 12-level system that tunes vocabulary, speed, and complexity automatically. You can jump between levels anytime.' },
]

const stats = [
  { value: String(languages.length), label: 'Languages' },
  { value: String(scenarios.length), label: 'Scenarios' },
  { value: String(levels.length), label: 'Levels' },
  { value: String(personas.length), label: 'AI Tutors' },
]

/* ── Entry point — auth guard ───────────────────────────────────── */

export default function Home() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) return <ConversationPage />

  return <LandingPage />
}

/* ── Public landing page ───────────────────────────────────────────── */

function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── STICKY NAV ────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-card/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <TalkingoLogo size="sm" />
            <span className="text-base font-semibold tracking-tight">Talkingo</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#modes" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">Modes</a>
            <a href="#tutors" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">Tutors</a>
            <a href="#levels" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">Levels</a>
            <a href="#pricing" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" className="hidden sm:inline-flex text-sm">Sign in</Button></Link>
            <Link href="/signup">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold px-5 whitespace-nowrap">
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative flex items-center overflow-hidden pt-24 pb-20">
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          {/* Left column */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col justify-center space-y-8"
          >
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-sm text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Don&apos;t study the language. <span className="font-semibold">Live it.</span></span>
            </div>

            <div className="space-y-5">
              <h1 className="font-display max-w-2xl text-5xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl text-foreground">
                Speak real conversations.
                <br />
                <span className="text-primary">Not textbook drills.</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                Real-time AI conversations that adapt to your level, pace, and goals.
                Practice Spanish, Japanese, French &mdash; {languages.length} languages &mdash; with tutors who feel human.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link href="/signup">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-6 rounded-2xl whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Start speaking free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#modes">
                <Button variant="outline" size="lg" className="text-base px-7 py-6 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  See how it works
                </Button>
              </Link>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {stats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-primary">{s.value}</span>
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right column — conversation demo */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex items-center"
          >
            <div className="w-full rounded-3xl border border-border bg-card p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary border border-primary/30">AI</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Eli &middot; Spanish</p>
                    <p className="text-xs text-muted-foreground">Friendly guide &bull; A1 level</p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs text-success border border-success/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Live
                </span>
              </div>

              <div className="space-y-3 rounded-2xl bg-muted/40 p-4 border border-border">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="conversation-bubble-user p-3 text-sm text-foreground max-w-[85%]"
                >
                  Let&apos;s practice ordering coffee in Spanish.
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="conversation-bubble-ai p-3 text-sm text-foreground ml-auto max-w-[85%]"
                >
                  Claro, ¿qué te gustaría pedir?
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                  className="conversation-bubble-user p-3 text-sm text-foreground max-w-[85%]"
                >
                  I&apos;d like a latte, please.
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 }}
                  className="conversation-bubble-ai p-3 text-sm text-foreground ml-auto max-w-[85%]"
                >
                  <span className="text-primary font-medium">Perfecto.</span> Un café latte &mdash; excelente elección.
                  <span className="block mt-1 text-[11px] text-muted-foreground">Tip: In Spain, ask for &ldquo;un café con leche&rdquo;</span>
                </motion.div>
              </div>

              {/* Input bar mock */}
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3">
                <Mic className="h-4 w-4 text-primary/70" />
                <span className="text-sm text-muted-foreground">Tap to speak or type your response...</span>
              </div>
            </div>
            <TalkingoSparkles className="absolute -right-4 -top-4 h-20 w-20 opacity-60" />
          </motion.div>
        </div>
      </section>

      {/* ── 4 MODES ────────────────────────────────────────────────── */}
      <section id="modes" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-left"
        >
          <h2 className="font-display text-4xl font-bold text-foreground md:text-5xl">
            Choose your <span className="text-primary">flow</span>
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg">
            Four ways to practice, from typing to full immersion. Every mode adapts to your comfort level.
          </p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.map((mode, i) => {
            const Icon = mode.icon
            return (
              <motion.div
                key={mode.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="mode-pill group relative overflow-hidden rounded-2xl border border-border bg-card p-6 hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted border border-border group-hover:border-primary/40 group-hover:bg-primary/10 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{mode.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{mode.desc}</p>
                <p className="mt-3 text-xs text-primary">{mode.hint}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── 6 AI TUTORS ────────────────────────────────────────────── */}
      <section id="tutors" className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-left"
          >
            <h2 className="font-display text-4xl font-bold text-foreground md:text-5xl">
              {personas.length} personalities. <span className="text-primary">One goal.</span>
            </h2>
            <p className="mt-3 text-muted-foreground max-w-lg">
              Each tutor has a unique teaching style. Pick the one that matches your vibe.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personas.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold shrink-0 bg-muted ${p.tone}`}
                  >
                    {p.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-foreground">{p.name}</h3>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted ${p.tone}`}>{p.level}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                    <div className="mt-3">
                      <PersonaSampleButton personaId={p.id} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12 LEVEL SYSTEM ────────────────────────────────────────── */}
      <section id="levels" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-left"
        >
          <h2 className="font-display text-4xl font-bold text-foreground md:text-5xl">
            {levels.length} levels from <span className="text-primary">first words</span> to mastery
          </h2>
        </motion.div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {levels.map((level, i) => (
              <div
                key={level}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
              >
                <div className={`level-dot ${i < 6 ? 'active' : ''}`} />
                <div className="min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{level}</p>
                  <p className="text-[10px] text-muted-foreground">Level {i + 1}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Halfway mark at Level 6 &mdash; &ldquo;Confident Talker&rdquo;
          </p>
        </div>
      </section>

      {/* ── LANGUAGES ─────────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-left"
          >
            <h2 className="font-display text-4xl font-bold text-foreground md:text-5xl">
              <span className="text-primary">{languages.length}</span> languages. Real conversations.
            </h2>
          </motion.div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {languages.map((lang) => (
              <div
                key={lang.code}
                className="lang-card"
              >
                <span className="text-base font-medium text-foreground">{lang.native}</span>
                <span className="text-xs text-muted-foreground hidden sm:block">{lang.english}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCENARIOS ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-left"
        >
          <h2 className="font-display text-4xl font-bold text-foreground md:text-5xl">
            <span className="text-primary">{scenarios.length}+</span> scenarios from real life
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg">
            From ordering coffee to job interviews — practice what matters to you.
          </p>
        </motion.div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap gap-2.5">
            {scenarios.map((s) => (
              <span
                key={s}
                className="scenario-pill"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-left"
        >
          <h2 className="font-display text-4xl font-bold text-foreground md:text-5xl">
            Start free. Upgrade when you&apos;re <span className="text-primary">ready</span>.
          </h2>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`relative overflow-hidden rounded-2xl border p-6 ${
                plan.popular
                  ? 'border-primary bg-card shadow-lg'
                  : 'border-border bg-card'
              }`}
            >
              {plan.popular && (
                <div className="absolute top-4 right-4 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Most popular
                </div>
              )}

              <div className="relative z-10">
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>
                <p className="mt-6">
                  <span className="text-4xl font-black text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">/mo</span>
                </p>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link href="/signup" className="mt-6 block">
                  <Button
                    className={`w-full py-5 text-base font-semibold rounded-xl whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      plan.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ + CTA ──────────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Questions? <span className="text-primary">Answers.</span>
            </h2>

            <div className="mt-8 space-y-3">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-foreground hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={openFaq === i}
                  >
                    {faq.q}
                    <ChevronRight
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openFaq === i ? 'rotate-90' : ''}`}
                    />
                  </button>
                  <div
                    className={`grid transition-all duration-200 ${
                      openFaq === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-8 flex flex-col justify-center"
          >
            <Bot className="h-8 w-8 text-primary" />
            <h3 className="mt-4 text-2xl font-bold text-foreground">
              Ready to have real conversations?
            </h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Your first conversation is free. No card required.
            </p>
            <div className="mt-6">
              <Link href="/signup">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-5 rounded-xl whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Start your first conversation
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[2fr_1fr] lg:px-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <TalkingoLogo size="sm" />
              <span className="text-base font-semibold tracking-tight text-foreground">Talkingo</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              A voice-first AI language speaking studio. Build real fluency through natural conversation &mdash; not rigid exercises.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: 'Modes', href: '#modes' },
                { label: 'Tutors', href: '#tutors' },
                { label: 'Levels', href: '#levels' },
                { label: 'Pricing', href: '#pricing' },
              ].map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border px-6 py-5 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground md:flex-row">
            <p>&copy; {new Date().getFullYear()} Talkingo. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">Privacy Policy</Link>
              <Link href="/terms" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
