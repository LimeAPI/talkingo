import Link from 'next/link'
import type { Metadata } from 'next'
import { Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — Talkingo',
  description: 'How Talkingo collects, uses, and protects your personal data.',
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[hsl(var(--border))] backdrop-blur-xl bg-[hsl(var(--background)/0.7)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-glow))] text-sm font-bold text-white">T</span>
            <span className="text-base font-semibold tracking-tight">Talkingo</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <article className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))] mb-4">
            <Shield size={12} /> Legal
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Last updated: June 6, 2026</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-[hsl(var(--foreground))] leading-relaxed">
          <p>
            At <strong>Talkingo</strong>, we take your privacy seriously. This Privacy Policy explains how we collect, use,
            disclose, and safeguard your information when you use our AI-powered language learning platform. By using
            Talkingo, you agree to the practices described in this policy.
          </p>

          <Section title="1. Information We Collect">
            <SubSection title="1.1 Account Information">
              When you create an account, we collect your name, email address, profile picture (if provided), and
              authentication method (Google, Facebook, or email/password). We also store your language preferences
              and learning progress.
            </SubSection>
            <SubSection title="1.2 Conversation Data">
              Talkingo processes the text and audio of your conversations with our AI tutors to provide real-time
              language feedback, corrections, and personalized learning. We store conversation transcripts to
              maintain session continuity and track your learning progress.
            </SubSection>
            <SubSection title="1.3 Usage & Device Data">
              We collect anonymized usage data including feature interactions, session duration, device type,
              browser information, and approximate geographic region. This helps us improve the service and
              diagnose issues.
            </SubSection>
            <SubSection title="1.4 Payment Information">
              We do <strong>not</strong> store full credit card numbers. Payment processing is handled by
              Stripe and DodoPayments. We store only subscription status, plan type, and transaction
              identifiers needed for account management.
            </SubSection>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide, maintain, and improve the Talkingo service</li>
              <li>To personalize your learning experience with AI tutors adapted to your level</li>
              <li>To process your subscription payments and manage your account</li>
              <li>To send service-related communications (account updates, security alerts)</li>
              <li>To analyze aggregated, anonymized usage patterns for product improvement</li>
              <li>To comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </Section>

          <Section title="3. AI & Voice Data">
            <p>
              Voice conversations with AI tutors are processed through Google&apos;s Gemini API. Audio data is
              streamed for real-time processing and is <strong>not</strong> stored as raw audio recordings.
              Only text transcripts are retained for your learning history. You can delete your conversation
              history at any time through the app or by requesting full data deletion.
            </p>
          </Section>

          <Section title="4. Data Sharing & Third Parties">
            <p>
              We do <strong>not</strong> sell your personal data. We share data only with the following service
              providers necessary to operate Talkingo:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Google (Gemini API)</strong> — AI conversation processing</li>
              <li><strong>Stripe / DodoPayments</strong> — Payment processing and subscription management</li>
              <li><strong>Appwrite</strong> — Database and authentication infrastructure</li>
              <li><strong>Google OAuth / Facebook OAuth</strong> — Social login authentication</li>
            </ul>
            <p className="mt-2">
              We may disclose information if required by law, court order, or governmental regulation.
            </p>
          </Section>

          <Section title="5. Data Storage & Security">
            <p>
              Your data is stored on secure cloud infrastructure provided by Appwrite with encryption at rest and
              in transit. We implement industry-standard security measures including HTTPS, authenticated API
              endpoints, and regular security reviews. While we strive to protect your data, no method of
              electronic storage is 100% secure.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p>
              We retain your account information and conversation data for as long as your account is active.
              If you delete your account or request data deletion, we will remove your personal data within
              30 days, except where retention is required by law. Anonymized, aggregated data may be retained
              indefinitely for analytical purposes.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Access</strong> — Request a copy of your personal data</li>
              <li><strong>Rectification</strong> — Correct inaccurate or incomplete data</li>
              <li><strong>Erasure</strong> — Request deletion of your personal data</li>
              <li><strong>Portability</strong> — Receive your data in a structured, machine-readable format</li>
              <li><strong>Objection</strong> — Object to certain processing of your data</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, visit our{' '}
              <Link href="/data-deletion" className="text-[hsl(var(--primary))] underline hover:opacity-75">
                Data Deletion page
              </Link>{' '}
              or contact us at the email below.
            </p>
          </Section>

          <Section title="8. Children&apos;s Privacy">
            <p>
              Talkingo is not intended for children under 13 years of age. We do not knowingly collect personal
              information from children under 13. If you believe a child has provided us with personal data,
              please contact us immediately.
            </p>
          </Section>

          <Section title="9. International Data Transfers">
            <p>
              Talkingo operates globally. Your data may be processed in countries where our service providers
              operate. We ensure appropriate safeguards are in place for cross-border data transfers in
              compliance with applicable data protection laws including GDPR.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes via
              email or through the app. Your continued use of Talkingo after changes take effect constitutes
              acceptance of the updated policy.
            </p>
          </Section>

          <Section title="11. Contact Us">
            <p>
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <p className="mt-2">
              📧 <strong>privacy@talkingo.ai</strong>
            </p>
          </Section>

          <div className="mt-12 pt-8 border-t border-[hsl(var(--border))] flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="text-[hsl(var(--primary))] hover:opacity-75 transition-opacity">
              Terms of Service →
            </Link>
            <Link href="/data-deletion" className="text-[hsl(var(--primary))] hover:opacity-75 transition-opacity">
              Data Deletion Request →
            </Link>
          </div>
        </div>
      </article>
    </main>
  )
}

/* ── Reusable subcomponents ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight mb-3 text-[hsl(var(--foreground))]">{title}</h2>
      <div className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1">{title}</h3>
      <div className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{children}</div>
    </div>
  )
}
