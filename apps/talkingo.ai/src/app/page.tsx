'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import {
  MessageCircle, BookOpen, Sparkles, ArrowRight, Play,
  Mic, Globe2, Phone, Bot, Star, Zap, BadgeCheck,
  ChevronRight, Shield
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { TALKINGO_LEVELS } from '@/shared/levels'

/* ── Data ──────────────────────────────────────────────────── */

const modes = [
  { icon: MessageCircle, name: 'Chat', desc: 'Type at your own pace with AI guidance', hint: 'Great for beginners', accent: 'bg-[hsl(var(--primary))]' },
  { icon: Mic, name: 'Voice', desc: 'Speak naturally with real-time voice AI', hint: 'Build speaking confidence', accent: 'bg-[hsl(var(--accent))]' },
  { icon: Globe2, name: 'Immersion', desc: 'Full immersion in your target language', hint: 'Think in the language', accent: 'bg-[hsl(var(--secondary))]' },
]

const tutors = [
  { name: 'Eli', desc: 'Friendly guide for easy, warm conversations', color: '#F4A261', level: 'A1-A2' },
  { name: 'Alex', desc: 'Coach who pushes your daily speaking confidence', color: '#A8DADC', level: 'A2-B1' },
  { name: 'Dr. Luma', desc: 'Linguist who breaks down every nuance', color: '#2C4A3E', level: 'B1-C1' },
]

const testimonials = [
  { quote: 'I finally look forward to speaking practice. The AI tutors feel like real conversation partners.', name: 'Sofia M.', role: 'Learning Spanish' },
  { quote: 'The immersion mode pushed me to think in Portuguese instead of translating in my head.', name: 'James K.', role: 'Portuguese, B1' },
  { quote: 'I tried the big apps. Nothing comes close to how natural this feels.', name: 'Aiko T.', role: 'English learner' },
]

const faqs = [
  { q: 'Do I need to be fluent to start?', a: 'Not at all. Every AI tutor adapts to your current level — from absolute beginner to near-native. You just show up and speak.' },
  { q: 'How is this different from other apps?', a: 'Those teach you about a language. Talkingo lets you live it — real conversations, real corrections, real fluency. No drills, no flashcards.' },
  { q: 'How does the AI know my level?', a: 'We use a 12-level system that tunes vocabulary, speed, and complexity automatically. You can jump between levels anytime.' },
]

const levels = TALKINGO_LEVELS.map(l => l.name)

/* ── Dashboard (authenticated) ─────────────────────────────── */

const quickActions = [
  { label: 'Start Speaking', description: 'Jump into a conversation with your AI tutor', icon: MessageCircle, href: '/talk', primary: true },
  { label: 'Browse Levels', description: 'Explore 12 levels from First Words to Mastery', icon: BookOpen, href: '/learn' },
]

function Dashboard() {
  const router = useRouter()
  const recentLevels = TALKINGO_LEVELS.slice(0, 4)
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 md:px-8 pt-8 md:pt-14 pb-8">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <p className="text-xs font-semibold text-[hsl(var(--accent))] mb-3 tracking-[0.15em] uppercase">Welcome back</p>
          <h1 className="text-[clamp(1.75rem,5vw,2.75rem)] font-bold text-[hsl(var(--foreground))] leading-[1.08] tracking-tight text-balance">
            Ready to <span className="text-premium animate-gradient">practice</span>?
          </h1>
          <p className="mt-4 text-[hsl(var(--muted-foreground))] text-base max-w-lg text-balance leading-relaxed">
            Your AI language partner is ready. Pick up where you left off or explore something new.
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-14"
        >
          {quickActions.map((action) => (
            <button key={action.label} onClick={() => router.push(action.href)}
              className={[
                'group relative flex items-start gap-4 p-5 rounded-[24px] text-left',
                'transition-[transform,box-shadow] duration-300 ease-out',
                action.primary
                  ? 'border-premium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg hover:shadow-xl hover:scale-[1.015]'
                  : 'glass hover:shadow-lg hover:scale-[1.01]',
              ].join(' ')}
            >
              <div className={[
                'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 ease-out group-hover:scale-105',
                action.primary ? 'bg-white/20' : 'bg-[hsl(var(--primary-subtle))] text-[hsl(var(--primary))]',
              ].join(' ')}>
                <action.icon size={20} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[15px]">{action.label}</span>
                  <ArrowRight size={15} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300 ease-out" />
                </div>
                <p className={['text-[13px] mt-0.5 leading-snug', action.primary ? 'opacity-80' : 'text-[hsl(var(--muted-foreground))]'].join(' ')}>
                  {action.description}
                </p>
              </div>
            </button>
          ))}
        </motion.div>

        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Your Journey</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">12 levels from First Words to Mastery</p>
            </div>
            <button onClick={() => router.push('/learn')} className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--primary))] hover:opacity-75 transition-opacity duration-200">
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {recentLevels.map((level, i) => (
              <button key={level.level} onClick={() => router.push(`/talk?level=${level.level}`)}
                className="glass group p-4 rounded-[20px] text-left transition-[transform,box-shadow] duration-300 ease-out hover:shadow-lg hover:scale-[1.02]"
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-[10px] bg-[hsl(var(--primary-subtle))] text-[hsl(var(--primary))] flex items-center justify-center text-xs font-bold">{level.level}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Lv {level.level}</span>
                </div>
                <h3 className="font-semibold text-sm text-[hsl(var(--foreground))] mb-1">{level.name}</h3>
                <p className="text-[12px] text-[hsl(var(--muted-foreground))] leading-snug line-clamp-2">{level.description}</p>
                <div className="flex items-center gap-1 mt-3 text-[12px] font-medium text-[hsl(var(--primary))] opacity-0 group-hover:opacity-100 transition-opacity duration-200"><Play size={12} /> Start</div>
              </button>
            ))}
          </div>
        </motion.section>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 glass p-5 rounded-[24px] flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-[hsl(var(--accent)/0.12)] flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-[hsl(var(--accent))]" />
          </div>
          <div>
            <p className="font-semibold text-sm text-[hsl(var(--foreground))] mb-0.5">Tip: Speak, don&apos;t type</p>
            <p className="text-[13px] text-[hsl(var(--muted-foreground))] leading-snug">
              Voice conversations build fluency faster. Try 5 minutes of speaking practice today.
            </p>
          </div>
        </motion.div>
        <div className="h-4 md:hidden" />
      </div>
    </AppShell>
  )
}

/* ── Public Landing ────────────────────────────────────────── */

function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const { scrollYProgress } = useScroll()
  const navOpacity = useTransform(scrollYProgress, [0, 0.04], [0, 1])
  const heroRef = useRef<HTMLDivElement>(null)

  const itemVars = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } } }

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-x-clip">
      {/* Nav */}
      <motion.header style={{ opacity: navOpacity }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-[hsl(var(--border))]
                   backdrop-blur-xl bg-[hsl(var(--background)/0.7)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-glow))] text-sm font-bold text-white">T</span>
            <span className="text-base font-semibold tracking-tight">Talkingo</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">Sign in</Link>
            <Link href="/signup" className="inline-flex items-center px-5 py-2 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold shadow-md hover:shadow-lg transition-all">Start free</Link>
          </div>
        </div>
      </motion.header>

      {/* Hero */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[hsl(var(--primary)/0.04)] rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[hsl(var(--accent)/0.04)] rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-24 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col justify-center space-y-8">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm font-medium">
              <Sparkles size={14} className="text-[hsl(var(--accent))]" />
              <span className="text-[hsl(var(--foreground))]">AI-powered language learning</span>
            </motion.div>
            <div className="space-y-5">
              <h1 className="max-w-2xl text-5xl font-extrabold leading-[1.08] tracking-tight md:text-6xl lg:text-7xl text-balance">
                Speak real conversations.<br />
                <span className="text-premium animate-gradient">Not textbook drills.</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))] md:text-xl">
                Real-time AI conversations that adapt to your level, pace, and goals. Practice languages with tutors who feel human.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-base shadow-xl shadow-[hsl(var(--primary)/0.2)] hover:shadow-2xl hover:shadow-[hsl(var(--primary)/0.3)] transition-shadow">
                Start speaking free <ArrowRight size={18} />
              </Link>
              <Link href="/login" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-medium text-base hover:bg-[hsl(var(--muted))] transition-colors">Sign in</Link>
            </div>
            <div className="flex flex-wrap gap-10 pt-4">
              {[{ v: '23', l: 'Languages' }, { v: '300+', l: 'Scenarios' }, { v: '12', l: 'Levels' }, { v: '6', l: 'AI Tutors' }].map((s, i) => (
                <motion.div key={s.l} variants={itemVars} initial="hidden" animate="visible" transition={{ delay: 0.3 + i * 0.08 }}>
                  <span className="text-3xl font-bold tracking-tight">{s.v}</span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))] block">{s.l}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Chat preview */}
          <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} className="relative flex items-center">
            <div className="w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-3.5 bg-[hsl(var(--muted)/0.4)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-white">AI</div>
                  <div><p className="text-sm font-semibold">Eli · Spanish</p><p className="text-xs text-[hsl(var(--muted-foreground))]">Friendly guide</p></div>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--success)/0.1)] px-3 py-1 text-xs font-medium text-[hsl(var(--success))] border border-[hsl(var(--success)/0.15)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" /> Live
                </span>
              </div>
              <div className="space-y-3 p-5">
                {[{ delay: 0.5, text: "Let's practice ordering coffee in Spanish." }, { delay: 0.7, text: "Claro, ¿qué te gustaría pedir?", user: true }, { delay: 0.9, text: "I'd like a latte, please." }, { delay: 1.1, text: "Perfecto. Un café latte — excelente elección.", correction: "Tip: In Spain, ask for 'un café con leche'" }].map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: m.delay }}
                    className={`p-3 text-sm max-w-[85%] rounded-2xl ${m.user ? 'ml-auto rounded-br-md glass' : 'rounded-bl-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))]'}`}>
                    {m.text}
                    {m.correction && <span className="block mt-1 text-xs text-[hsl(var(--muted-foreground))]">{m.correction}</span>}
                  </motion.div>
                ))}
              </div>
              <div className="border-t border-[hsl(var(--border))] px-5 py-3.5 bg-[hsl(var(--card))]">
                <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-3">
                  <Mic size={16} className="text-[hsl(var(--primary)/0.6)]" />
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">Tap to speak or type...</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-[hsl(var(--background))] pointer-events-none" />
      </section>

      {/* Modes */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))] mb-4"><Zap size={12} /> Three ways to practice</div>
          <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">Choose your <span className="text-premium animate-gradient">flow</span></h2>
          <p className="mt-3 text-[hsl(var(--muted-foreground))] max-w-lg mx-auto text-lg">Every mode adapts to your comfort level.</p>
        </motion.div>
        <div className="grid gap-5 sm:grid-cols-3">
          {modes.map((mode, i) => {
            const Icon = mode.icon
            return (
              <motion.div key={mode.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className="group rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 transition-shadow duration-200 hover:shadow-xl">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${mode.accent} text-white shadow-md`}><Icon size={20} /></div>
                <h3 className="text-lg font-bold">{mode.name}</h3>
                <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{mode.desc}</p>
                <span className="mt-4 inline-flex items-center rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] group-hover:bg-[hsl(var(--primary)/0.1)] transition-colors">{mode.hint}</span>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Tutors */}
      <section className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} className="mb-14 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--accent)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--accent))] mb-4"><Bot size={12} /> Meet your AI tutors</div>
            <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">Personalized <span className="text-premium animate-gradient">guidance</span></h2>
            <p className="mt-3 text-[hsl(var(--muted-foreground))] max-w-lg mx-auto text-lg">Each tutor has a unique teaching style.</p>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-3">
            {tutors.map((p, i) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.06 }} whileHover={{ y: -3 }}
                className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-shadow duration-200 hover:shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-md" style={{ backgroundColor: p.color }}>{p.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold">{p.name}</h3>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: p.color, borderColor: p.color, background: `${p.color}18` }}>{p.level}</span>
                    </div>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{p.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Levels */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--success)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--success))] mb-4">Progression system</div>
          <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">12 levels from <span className="text-premium animate-gradient">first words</span> to mastery</h2>
        </motion.div>
        <div className="glass rounded-[28px] p-8">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {levels.map((level, i) => (
              <motion.div key={level} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3.5 hover:border-[hsl(var(--primary)/0.3)] transition-colors">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--primary-subtle))] text-[hsl(var(--primary))] text-xs font-bold shrink-0">{i + 1}</span>
                <span className="text-sm font-semibold truncate text-[hsl(var(--foreground))]">{level}</span>
              </motion.div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">Each level tunes vocabulary, speed, and complexity automatically.</p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} className="mb-14 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--accent)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--accent))] mb-4">Real learners</div>
            <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">What our <span className="text-premium animate-gradient">talkers</span> say</h2>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
                <div className="mb-4 flex items-center gap-1">{Array.from({ length: 5 }).map((_, si) => (<Star key={si} size={14} className="fill-[hsl(var(--accent))] text-[hsl(var(--accent))]" />))}</div>
                <p className="text-[hsl(var(--foreground)/0.85)] leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 pt-4 border-t border-[hsl(var(--border))] flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)] text-sm font-bold text-[hsl(var(--primary))]">{t.name[0]}</div>
                  <div><p className="text-sm font-semibold">{t.name}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{t.role}</p></div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))] mb-4">Simple pricing</div>
          <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">Start free. Upgrade when <span className="text-premium animate-gradient">ready</span>.</h2>
        </motion.div>
        <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
          {[{ n: 'Free', p: '$0', d: 'Get started', f: ['Daily practice', 'Basic AI voice', '12 levels'], l: '/signup', t: 'Start for free' }, { n: 'Pro', p: '$12', d: 'For serious learners', f: ['Unlimited sessions', 'Advanced corrections', 'All 6 AI tutors', 'Progress analytics'], l: '/pricing', t: 'See Pro plans', pop: true }].map((plan, i) => (
            <motion.div key={plan.n} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className={`relative overflow-hidden rounded-[28px] border-2 p-6 transition-shadow ${plan.pop ? 'border-[hsl(var(--accent))] bg-[hsl(var(--card-elevated))] shadow-xl' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
              {plan.pop && <div className="absolute top-4 right-4 rounded-full bg-[hsl(var(--accent))] px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">Most popular</div>}
              <h3 className="text-xl font-bold">{plan.n}</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{plan.d}</p>
              <p className="mt-6 flex items-baseline gap-1"><span className="text-5xl font-extrabold tracking-tight">{plan.p}</span><span className="text-sm text-[hsl(var(--muted-foreground))]">/month</span></p>
              <ul className="mt-8 space-y-3">{plan.f.map((f) => (<li key={f} className="flex items-start gap-3 text-sm"><BadgeCheck size={16} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /><span className="text-[hsl(var(--muted-foreground))]">{f}</span></li>))}</ul>
              <Link href={plan.l} className="mt-8 block w-full py-3 rounded-2xl text-center font-semibold text-sm shadow-lg transition-all hover:scale-[1.01]"
                style={{ background: plan.pop ? 'hsl(var(--primary))' : 'transparent', color: plan.pop ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))', border: plan.pop ? 'none' : '1px solid hsl(var(--border))' }}>{plan.t}</Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ + CTA */}
      <section className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }}>
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))] mb-4">FAQ</div>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Questions? <span className="text-premium animate-gradient">Answers.</span></h2>
            <div className="mt-8 space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold hover:text-[hsl(var(--primary))] transition-colors">
                    {faq.q}
                    <ChevronRight size={16} className={`shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 ${openFaq === i ? 'rotate-90 text-[hsl(var(--primary))]' : ''}`} />
                  </button>
                  <motion.div initial={false} animate={{ height: openFaq === i ? 'auto' : 0, opacity: openFaq === i ? 1 : 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{faq.a}</p>
                  </motion.div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl border-2 border-[hsl(var(--primary)/0.3)] bg-gradient-to-br from-[hsl(var(--primary)/0.05)] to-[hsl(var(--accent)/0.03)] p-8 flex flex-col justify-center">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-[hsl(var(--primary)/0.1)] rounded-full blur-3xl pointer-events-none" />
            <Bot size={36} className="relative z-10 text-[hsl(var(--primary))]" />
            <h3 className="relative z-10 mt-5 text-2xl font-extrabold tracking-tight">Ready to have real conversations?</h3>
            <p className="relative z-10 mt-3 text-[hsl(var(--muted-foreground))] leading-relaxed">
              Join learners who stopped studying and started speaking. Your first conversation is free.
            </p>
            <Link href="/signup" className="relative z-10 mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold shadow-xl shadow-[hsl(var(--primary)/0.25)] hover:shadow-2xl hover:shadow-[hsl(var(--primary)/0.35)] transition-shadow">
              Start your first conversation <ArrowRight size={18} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-glow))] text-sm font-bold text-white shadow-md">T</span>
              <span className="text-lg font-bold tracking-tight">Talkingo</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">A voice-first AI language speaking studio. Build real fluency through natural conversation.</p>
          </div>
          <div><h4 className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[hsl(var(--foreground)/0.5)]">Product</h4><ul className="space-y-3 text-sm">{['Pricing', 'Login', 'Sign up'].map(l => (<li key={l}><Link href={`/${l.toLowerCase().replace(' ', '-')}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">{l}</Link></li>))}</ul></div>
          <div><h4 className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[hsl(var(--foreground)/0.5)]">Company</h4><ul className="space-y-3 text-sm">{['About', 'Blog', 'Contact'].map(l => (<li key={l}><span className="text-[hsl(var(--muted-foreground)/0.5)] cursor-default">{l}</span></li>))}</ul></div>
        </div>
        <div className="border-t border-[hsl(var(--border))] px-6 py-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-[hsl(var(--muted-foreground))] md:flex-row">
            <p>&copy; {new Date().getFullYear()} Talkingo. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="hover:text-[hsl(var(--foreground))] transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-[hsl(var(--foreground))] transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}

/* ── Entry point ────────────────────────────────────────────── */

export default function Home() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--secondary))]
                          animate-[avatar-breathe_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading...</p>
        </div>
      </div>
    )
  }
  if (user) return <Dashboard />
  return <LandingPage />
}
