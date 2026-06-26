import Link from 'next/link'
import type { Metadata } from 'next'
import { Trash2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Data Deletion — Talkingo',
  description: 'Request deletion of your personal data from Talkingo.',
}

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold shadow-sm">T</span>
            <span className="text-base font-semibold tracking-tight">Talkingo</span>
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-error/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-error mb-4">
            <Trash2 size={12} /> Data Request
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">User Data Deletion</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: June 6, 2026</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground leading-relaxed">
          <p>
            At <strong>Talkingo</strong>, we respect your right to control your personal data. This page
            explains how you can request deletion of your data from our platform. We comply with data
            protection regulations including GDPR (EU/EEA) and CCPA (California).
          </p>

          <Section title="1. What Data Can Be Deleted">
            <p>When you request data deletion, the following will be permanently removed:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Account information</strong> — Name, email, profile picture, authentication records</li>
              <li><strong>Conversation history</strong> — All chat and voice transcripts with AI tutors</li>
              <li><strong>Learning data</strong> — Progress, level history, saved vocabulary, notes</li>
              <li><strong>Subscription records</strong> — Payment history and plan information (transaction records may be retained for legal compliance)</li>
              <li><strong>Preferences</strong> — Language settings, tutor preferences, notification settings</li>
            </ul>
          </Section>

          <Section title="2. How to Request Deletion">
            <SubSection title="2.1 In-App Deletion (Recommended)">
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>Log into your Talkingo account</li>
                <li>Navigate to <strong>Profile → Settings → Account</strong></li>
                <li>Select <strong>&ldquo;Delete My Account&rdquo;</strong> at the bottom of the page</li>
                <li>Confirm your choice by entering your password</li>
                <li>Your account will be scheduled for deletion and data removed within 30 days</li>
              </ol>
            </SubSection>
            <SubSection title="2.2 Email Request">
              <p>
                If you cannot access your account, send a deletion request to{' '}
                <strong>privacy@talkingo.ai</strong> with:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 mt-1.5">
                <li>The email address associated with your account</li>
                <li>Subject line: &ldquo;Data Deletion Request&rdquo;</li>
              </ul>
              <p className="mt-2">
                We may ask for additional verification to confirm your identity before processing the request.
              </p>
            </SubSection>
            <SubSection title="2.3 Facebook Data Deletion">
              <p>
                If you signed up using Facebook Login, you can also request deletion of the data Talkingo
                received from Facebook. Go to your Facebook settings → Apps & Websites → Talkingo → Remove.
                Alternatively, email us at <strong>privacy@talkingo.ai</strong> to request removal of
                Facebook-linked data specifically.
              </p>
            </SubSection>
            <SubSection title="2.4 Google Data Deletion">
              <p>
                For Google OAuth users, you can revoke Talkingo&apos;s access through your Google Account
                settings → Security → Third-party apps with account access. For full data deletion, please
                also submit a deletion request through the methods above.
              </p>
            </SubSection>
          </Section>

          <Section title="3. Processing Timeline">
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Acknowledgment:</strong> You will receive a confirmation email within 48 hours of your request</li>
              <li><strong>Account freeze:</strong> Your account will be immediately deactivated and inaccessible</li>
              <li><strong>30-day grace period:</strong> You have 30 days to cancel the deletion request by contacting support</li>
              <li><strong>Permanent deletion:</strong> All personal data is permanently erased from our systems within 30 days of request confirmation</li>
              <li><strong>Third-party deletion:</strong> We will instruct our service providers to delete your data; this may take up to 60 additional days</li>
            </ul>
          </Section>

          <Section title="4. What Is NOT Deleted">
            <p>The following may be retained even after data deletion:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Legal requirements:</strong> Transaction records may be kept for tax and accounting purposes (typically 7 years)</li>
              <li><strong>Anonymized data:</strong> Aggregated, de-identified usage statistics that cannot be linked back to you</li>
              <li><strong>Security logs:</strong> System access logs retained for security and abuse prevention (up to 90 days)</li>
              <li><strong>Active subscriptions:</strong> If you have an active paid subscription, it will be cancelled but billing records are retained for legal compliance</li>
            </ul>
          </Section>

          <Section title="5. Effects of Deletion">
            <p>Please be aware that data deletion is <strong>irreversible</strong>. After deletion:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>You will lose access to your learning history and progress</li>
              <li>Any remaining subscription time will be forfeited (cancel first if you want to use remaining time)</li>
              <li>You will not be able to recover your account or data</li>
              <li>If you wish to use Talkingo again, you must create a new account</li>
            </ul>
          </Section>

          <Section title="6. GDPR-Specific Rights (EU/EEA Users)">
            <p>
              Under the General Data Protection Regulation, in addition to deletion you have the right to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Data portability</strong> — Request a machine-readable export of your data</li>
              <li><strong>Processing restriction</strong> — Limit how we process your data without full deletion</li>
              <li><strong>Lodge a complaint</strong> — File a complaint with your local data protection authority</li>
            </ul>
            <p className="mt-2">
              To exercise GDPR rights, email <strong>privacy@talkingo.ai</strong> with your specific request.
            </p>
          </Section>

          <Section title="7. CCPA-Specific Rights (California Users)">
            <p>
              Under the California Consumer Privacy Act, you have the right to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Know what personal information we collect and how we use it</li>
              <li>Request deletion of your personal information</li>
              <li>Opt-out of the sale of personal information (Note: Talkingo does not sell personal data)</li>
              <li>Not be discriminated against for exercising your CCPA rights</li>
            </ul>
            <p className="mt-2">
              To exercise CCPA rights, email <strong>privacy@talkingo.ai</strong>.
            </p>
          </Section>

          <Section title="8. Contact">
            <p>
              For any questions about data deletion or your privacy rights, contact our Data Protection team:
            </p>
            <p className="mt-2">
              📧 <strong>privacy@talkingo.ai</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Please allow up to 48 hours for a response. For urgent privacy concerns, include
              &ldquo;URGENT&rdquo; in the subject line.
            </p>
          </Section>

          <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="text-accent hover:opacity-75 transition-opacity">
              Privacy Policy →
            </Link>
            <Link href="/terms" className="text-accent hover:opacity-75 transition-opacity">
              Terms of Service →
            </Link>
          </div>
        </div>
      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight mb-3 text-foreground">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}
