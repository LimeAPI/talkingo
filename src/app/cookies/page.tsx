import type { Metadata } from 'next'
import { Cookie } from 'lucide-react'
import { LegalShell, Section, SubSection } from '@/components/site/LegalShell'

export const metadata: Metadata = {
  title: 'Cookie Policy — Talkingo',
  description:
    'How Talkingo uses cookies, local storage, and similar technologies, including analytics from PostHog and Microsoft Clarity.',
}

export default function CookiePolicyPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      icon={Cookie}
      title="Cookie Policy"
      updated="June 30, 2026"
      related={[
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/terms', label: 'Terms of Service' },
        { href: '/data-deletion', label: 'Data Deletion Request' },
      ]}
    >
      <p>
        This Cookie Policy explains how <strong>Talkingo</strong> uses cookies, browser local storage, and
        similar technologies when you use our platform. It should be read together with our{' '}
        <strong>Privacy Policy</strong>.
      </p>

      <Section title="1. What These Technologies Are">
        <p>
          Cookies are small text files stored on your device. We also use related browser technologies such
          as <strong>localStorage</strong> and <strong>sessionStorage</strong>, which let a web app remember
          information between visits. Throughout this policy we refer to all of these collectively as
          &ldquo;cookies.&rdquo;
        </p>
      </Section>

      <Section title="2. How We Use Them">
        <SubSection title="2.1 Strictly necessary">
          These keep the service working and cannot be switched off. They include your authentication
          session (so you stay signed in), security tokens, and your locally cached preferences and learning
          state. As a Progressive Web App, Talkingo also uses a service worker and local caches so the app
          can load quickly and work offline.
        </SubSection>
        <SubSection title="2.2 Preferences">
          We store your settings — such as language, selected tutor, and interface choices — locally so your
          experience is consistent each time you return.
        </SubSection>
        <SubSection title="2.3 Analytics & product improvement">
          We use privacy-conscious analytics to understand how the product is used and to fix issues. These
          help us see which features are used, diagnose errors, and improve the experience. They do not sell
          your data.
        </SubSection>
      </Section>

      <Section title="3. Third-Party Tools We Use">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>PostHog</strong> — product analytics that measures feature usage and aggregated behavior
            to guide improvements.
          </li>
          <li>
            <strong>Microsoft Clarity</strong> — session insights and heatmaps that help us understand
            usability and diagnose interface problems.
          </li>
          <li>
            <strong>Stripe &amp; DodoPayments</strong> — set cookies during checkout to process payments
            securely and prevent fraud.
          </li>
          <li>
            <strong>Google &amp; Facebook (OAuth)</strong> — set cookies when you sign in with your social
            account to complete authentication.
          </li>
        </ul>
        <p className="mt-2">
          These providers process data under their own privacy and cookie policies. We encourage you to
          review them for details on their practices.
        </p>
      </Section>

      <Section title="4. Managing Your Preferences">
        <SubSection title="4.1 Browser controls">
          Most browsers let you view, block, or delete cookies through their settings. Blocking strictly
          necessary cookies will prevent you from signing in or using core features. Clearing site data will
          also remove your locally cached preferences and offline content.
        </SubSection>
        <SubSection title="4.2 Opting out of analytics">
          You can limit analytics tracking by enabling your browser&apos;s &ldquo;Do Not Track&rdquo; signal
          or by using browser privacy extensions. Microsoft Clarity and PostHog also honor standard
          industry opt-out mechanisms where applicable.
        </SubSection>
      </Section>

      <Section title="5. Changes to This Policy">
        <p>
          We may update this Cookie Policy as our tools or legal requirements change. Material changes will
          be reflected by the &ldquo;Last updated&rdquo; date above and, where appropriate, communicated
          in-app or by email.
        </p>
      </Section>

      <Section title="6. Contact">
        <p>If you have questions about how we use cookies, contact us at:</p>
        <p className="mt-2">📧 <strong>privacy@talkingo.ai</strong></p>
      </Section>
    </LegalShell>
  )
}
