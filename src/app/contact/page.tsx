import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy, CreditCard, ShieldCheck, Scale, ArrowRight, Clock, MessageCircle } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

export const metadata: Metadata = {
  title: 'Contact & Support — Talkingo',
  description:
    'Reach the Talkingo team for help, billing questions, privacy requests, or legal matters. We typically reply within 48 hours.',
}

const channels = [
  {
    icon: LifeBuoy,
    title: 'General support',
    desc: 'Questions about your account, tutors, levels, or how something works. We are happy to help.',
    email: 'support@talkingo.ai',
    subject: 'Talkingo support request',
  },
  {
    icon: CreditCard,
    title: 'Billing & refunds',
    desc: 'Subscription changes, trial questions, charges, or refund requests.',
    email: 'support@talkingo.ai',
    subject: 'Billing question',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy & data',
    desc: 'Data access, export, or deletion requests and any privacy concerns.',
    email: 'privacy@talkingo.ai',
    subject: 'Privacy request',
  },
  {
    icon: Scale,
    title: 'Legal',
    desc: 'Terms, partnerships, press, and other legal or business inquiries.',
    email: 'legal@talkingo.ai',
    subject: 'Legal inquiry',
  },
]

const resources: [string, string][] = [
  ['How it works', '/#how'],
  ['Pricing', '/#pricing'],
  ['Refund & cancellation', '/refund'],
  ['Data deletion', '/data-deletion'],
  ['Privacy policy', '/privacy'],
]

function mailto(email: string, subject: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`
}

export default function ContactPage() {
  return (
    <main className="lp min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="relative mx-auto max-w-5xl px-6 pt-32 pb-20 lg:px-8">
        <div className="lp-grid pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60" aria-hidden />

        <header className="relative max-w-2xl">
          <span className="lp-eyebrow"><MessageCircle className="h-3.5 w-3.5" /> Support</span>
          <h1 className="mt-5 font-display text-[clamp(2.1rem,4vw,2.9rem)] font-semibold tracking-[-.04em] text-[oklch(var(--color-ink))]">
            Get in touch
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[oklch(var(--color-muted))]">
            We are a small team that reads every message. Pick the channel that fits your question and email
            us directly — there is no ticket queue to navigate. We typically reply within 48 hours.
          </p>
        </header>

        {/* Contact channels */}
        <div className="relative mt-12 grid gap-4 sm:grid-cols-2">
          {channels.map((c) => {
            const Icon = c.icon
            return (
              <a
                key={c.title}
                href={mailto(c.email, c.subject)}
                className="group flex flex-col gap-3 rounded-2xl border border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper-2)/.4)] p-6 transition-colors hover:border-[oklch(var(--color-accent)/.5)] hover:bg-[oklch(var(--color-paper-2)/.7)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(var(--color-accent)/.12)] text-[oklch(var(--color-accent-dim))]">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-[15px] font-semibold text-[oklch(var(--color-ink))]">{c.title}</h2>
                <p className="text-[13.5px] leading-relaxed text-[oklch(var(--color-muted))]">{c.desc}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-[13px] font-medium text-[oklch(var(--color-accent-dim))] group-hover:text-[oklch(var(--color-accent))] transition-colors">
                  {c.email}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            )
          })}
        </div>

        {/* Response time note */}
        <div className="relative mt-6 flex items-center gap-2.5 rounded-xl border border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper-2)/.3)] px-4 py-3 text-[13px] text-[oklch(var(--color-muted))]">
          <Clock className="h-4 w-4 shrink-0 text-[oklch(var(--color-accent))]" />
          Average response time is under 48 hours. For urgent privacy matters, add &ldquo;URGENT&rdquo; to your subject line.
        </div>

        {/* Helpful resources */}
        <div className="relative mt-14 border-t border-[oklch(var(--color-rule))] pt-8">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[oklch(var(--color-accent-dim))]">
            Before you email
          </h3>
          <p className="mt-3 text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">
            Many questions are answered in these pages:
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-[14px]">
            {resources.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="font-medium text-[oklch(var(--color-accent-dim))] hover:text-[oklch(var(--color-accent))] transition-colors"
              >
                {label} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
