/* Shared shell for legal/content pages (privacy, terms, data-deletion).
 * Server component — zero client JS. Provides consistent header, footer,
 * gold (.lp) theming, page header, and the Section / SubSection primitives
 * so the individual pages only carry their content. */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'

interface RelatedLink { href: string; label: string }

export function LegalShell({
  eyebrow,
  icon: Icon,
  title,
  updated,
  children,
  related = [],
}: {
  eyebrow: string
  icon: LucideIcon
  title: string
  updated: string
  children: ReactNode
  related?: RelatedLink[]
}) {
  return (
    <main className="lp min-h-screen bg-background text-foreground">
      <SiteHeader />

      <article className="relative mx-auto max-w-3xl px-6 pt-32 pb-20 lg:px-8">
        <div className="lp-grid pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60" aria-hidden />

        <header className="relative mb-12">
          <span className="lp-eyebrow"><Icon className="h-3.5 w-3.5" /> {eyebrow}</span>
          <h1 className="mt-5 font-display text-[clamp(2.1rem,4vw,2.9rem)] font-semibold tracking-[-.04em] text-[oklch(var(--color-ink))]">
            {title}
          </h1>
          <p className="mt-3 font-[var(--font-outlier)] text-[12px] text-[oklch(var(--color-muted))]">
            Last updated: {updated}
          </p>
        </header>

        <div className="relative space-y-9">
          {children}
        </div>

        {related.length > 0 && (
          <div className="relative mt-14 flex flex-wrap gap-x-6 gap-y-3 border-t border-[oklch(var(--color-rule))] pt-8 text-[14px]">
            {related.map(r => (
              <a key={r.href} href={r.href} className="font-medium text-[oklch(var(--color-accent-dim))] hover:text-[oklch(var(--color-accent))] transition-colors">
                {r.label} →
              </a>
            ))}
          </div>
        )}
      </article>

      <SiteFooter />
    </main>
  )
}

/* ── Content primitives ── */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold tracking-[-.02em] text-[oklch(var(--color-ink))] mb-3">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">{children}</div>
    </section>
  )
}

export function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-[14px] font-semibold text-[oklch(var(--color-ink))] mb-1">{title}</h3>
      <div className="text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">{children}</div>
    </div>
  )
}
