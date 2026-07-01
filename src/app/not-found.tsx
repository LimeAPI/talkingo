import Link from 'next/link'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

export default function NotFound() {
  return (
    <main className="lp min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />

      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-32 text-center">
        <div className="lp-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="lp-mesh opacity-50" aria-hidden />

        <div className="relative">
          <p className="lp-eyebrow justify-center">Error 404</p>
          <h1 className="mt-6 font-display text-[clamp(4.5rem,16vw,9rem)] font-semibold leading-none tracking-[-.05em] text-[oklch(var(--color-ink))]">
            404
          </h1>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-.03em]">Page not found</h2>
          <p className="mx-auto mt-3 max-w-[40ch] text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">
            The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back to the conversation.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="lp-btn lp-btn--primary">
              Back home <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="lp-btn lp-btn--ghost">
              <ArrowLeft className="h-4 w-4" /> Sign in
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
