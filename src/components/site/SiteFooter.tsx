/* Shared lightweight footer for marketing/standalone pages.
 * Server component — zero client JS. Lighter than the landing's dark
 * finale, sized for legal/content pages. */

import Link from 'next/link'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

const columns: { title: string; links: [string, string][] }[] = [
  { title: 'Product', links: [['How it works', '/#how'], ['Modes', '/#modes'], ['Tutors', '/#tutors'], ['Pricing', '/#pricing']] },
  { title: 'Legal', links: [['Privacy', '/privacy'], ['Terms', '/terms'], ['Refunds', '/refund'], ['Cookies', '/cookies'], ['Data deletion', '/data-deletion']] },
  { title: 'Company', links: [['Contact', '/contact'], ['Sign in', '/login'], ['Start free', '/signup']] },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-[oklch(var(--color-rule))] bg-[oklch(var(--color-paper-2)/.4)]">
      <div className="mx-auto max-w-6xl px-6 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <TalkingoLogo size="md" />
              <span className="font-display text-lg font-semibold tracking-tight">Talkingo</span>
            </Link>
            <p className="mt-4 max-w-[32ch] text-[13px] leading-relaxed text-[oklch(var(--color-muted))]">
              Real conversations with AI tutors in 30 languages — learn a language the way you actually learned your first.
            </p>
          </div>
          {columns.map(col => (
            <div key={col.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[oklch(var(--color-accent-dim))]">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-[13px] text-[oklch(var(--color-muted))] hover:text-[oklch(var(--color-ink))] transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <hr className="lp-rule my-10" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[oklch(var(--color-muted))]">
          <span>© {new Date().getFullYear()} Talkingo. All rights reserved.</span>
          <span className="text-[oklch(var(--color-accent-dim))]">The world speaks. So should you.</span>
        </div>
      </div>
    </footer>
  )
}
