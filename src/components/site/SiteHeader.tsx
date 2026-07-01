/* Shared floating-pill nav for marketing/standalone pages.
 * Server component — zero client JS. Mirrors the landing nav, with links
 * that resolve correctly from any route. */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

export function SiteHeader() {
  return (
    <nav className="lp-nav" aria-label="Primary">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <TalkingoLogo size="sm" />
        <span className="text-[13px] font-semibold tracking-tight">Talkingo</span>
      </Link>
      <div className="hidden sm:flex items-center gap-6">
        <Link href="/#how" className="lp-navlink">How it works</Link>
        <Link href="/#pricing" className="lp-navlink">Pricing</Link>
        <Link href="/login" className="lp-navlink">Sign in</Link>
      </div>
      <Link href="/signup" className="lp-btn lp-btn--pill">
        Start free <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </nav>
  )
}
