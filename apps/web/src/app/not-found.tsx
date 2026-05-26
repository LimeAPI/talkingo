import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="font-display text-6xl font-extrabold text-foreground/20 mb-2">404</h1>
      <h2 className="text-xl font-bold text-foreground mb-2">Page not found</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
      >
        Back to Talkingo
      </Link>
    </div>
  )
}
