import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { LegalShell, Section, SubSection } from '@/components/site/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service — Talkingo',
  description: 'Terms and conditions for using the Talkingo AI language learning platform.',
}

export default function TermsOfServicePage() {
  return (
    <LegalShell
      eyebrow="Legal"
      icon={FileText}
      title="Terms of Service"
      updated="June 6, 2026"
      related={[
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/refund', label: 'Refund & Cancellation' },
        { href: '/data-deletion', label: 'Data Deletion Request' },
      ]}
    >
      <p>
        Welcome to <strong>Talkingo</strong>. By accessing or using our AI-powered language learning platform
        (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree,
        please do not use Talkingo.
      </p>

      <Section title="1. Eligibility">
        <p>
          You must be at least 13 years old to use Talkingo. If you are under 18, you must have a parent
          or legal guardian&apos;s consent. By creating an account, you represent that you meet these
          requirements and that the information you provide is accurate and complete.
        </p>
      </Section>

      <Section title="2. Account Responsibilities">
        <ul className="list-disc pl-5 space-y-2">
          <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
          <li>You must notify us immediately of any unauthorized use or security breach.</li>
          <li>You may not share your account or use another person&apos;s account without permission.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
        </ul>
      </Section>

      <Section title="3. Subscriptions & Payments">
        <SubSection title="3.1 Free Tier">
          Talkingo offers a free tier with limited features. Free tier availability and features may change
          at any time. We reserve the right to modify or discontinue the free tier with reasonable notice.
        </SubSection>
        <SubSection title="3.2 Paid Subscriptions">
          Paid subscriptions provide access to premium features such as unlimited sessions, advanced AI
          corrections, and progress analytics. Subscription fees are billed in advance on a recurring
          basis (monthly or annually) as selected at checkout.
        </SubSection>
        <SubSection title="3.3 Cancellation & Refunds">
          You may cancel your subscription at any time through your account settings or by contacting
          support. Cancellation takes effect at the end of the current billing period. Refunds are
          handled in accordance with our{' '}
          <a href="/refund" className="text-[oklch(var(--color-accent-dim))] underline underline-offset-2 hover:text-[oklch(var(--color-accent))]">
            Refund &amp; Cancellation Policy
          </a>{' '}
          and applicable consumer protection laws.
        </SubSection>
        <SubSection title="3.4 Price Changes">
          We may change subscription pricing with at least 30 days&apos; notice. Continued use after a
          price change constitutes acceptance of the new pricing.
        </SubSection>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-2 mt-2">
          <li>Use the Service for any illegal purpose or in violation of any applicable laws</li>
          <li>Attempt to reverse-engineer, decompile, or extract the AI models or platform code</li>
          <li>Use automated tools (bots, scrapers) to access the Service without permission</li>
          <li>Upload malicious code, spam, or content that infringes on others&apos; rights</li>
          <li>Engage in harassment, hate speech, or abusive behavior through the platform</li>
          <li>Use the AI tutors to generate harmful, deceptive, or illegal content</li>
          <li>Excessively consume resources in a way that degrades service for other users</li>
        </ul>
      </Section>

      <Section title="5. AI-Generated Content">
        <p>
          Talkingo uses AI models (Google Gemini) to generate conversational responses, corrections, and
          learning feedback. AI-generated content may occasionally be inaccurate, incomplete, or
          inappropriate. You acknowledge that:
        </p>
        <ul className="list-disc pl-5 space-y-2 mt-2">
          <li>AI responses are provided for educational purposes and should not be treated as professional advice</li>
          <li>We do not guarantee the accuracy, completeness, or appropriateness of AI-generated content</li>
          <li>You use AI features at your own discretion and risk</li>
          <li>We continuously improve our AI systems but make no warranties about their performance</li>
        </ul>
      </Section>

      <Section title="6. Intellectual Property">
        <SubSection title="6.1 Our IP">
          Talkingo, its branding, design, code, curriculum, and original content are owned by Talkingo
          and protected by copyright, trademark, and other intellectual property laws. You may not copy,
          modify, distribute, or create derivative works without our written permission.
        </SubSection>
        <SubSection title="6.2 Your Content">
          You retain ownership of conversation transcripts and content you generate while using Talkingo.
          By using the Service, you grant us a limited license to store, process, and display your content
          solely for the purpose of providing and improving the Service to you.
        </SubSection>
        <SubSection title="6.3 Feedback">
          Any feedback, suggestions, or ideas you provide about Talkingo may be used by us without
          restriction or compensation.
        </SubSection>
      </Section>

      <Section title="7. Third-Party Services">
        <p>
          Talkingo integrates with third-party services including Google (Gemini AI, OAuth), Facebook
          (OAuth), Stripe, DodoPayments, and Appwrite. Your use of these services is subject to their
          respective terms and privacy policies. We are not responsible for third-party service
          availability, content, or practices.
        </p>
      </Section>

      <Section title="8. Disclaimer of Warranties">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES
          OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, TALKINGO
          DISCLAIMS ALL WARRANTIES INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR
          COMPLETELY SECURE.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, TALKINGO AND ITS AFFILIATES SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE
          OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE AMOUNT YOU PAID US IN
          THE 12 MONTHS PRECEDING THE CLAIM, OR $100 IF YOU USE THE FREE TIER.
        </p>
      </Section>

      <Section title="10. Indemnification">
        <p>
          You agree to indemnify and hold Talkingo harmless from any claims, damages, losses, or expenses
          arising from your violation of these Terms, your misuse of the Service, or your infringement of
          any third-party rights.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          You may stop using Talkingo and delete your account at any time. We may suspend or terminate
          your access if you violate these Terms, with or without notice. Upon termination, your right to
          use the Service ceases immediately. Provisions that by their nature should survive termination
          (including IP, disclaimers, and liability limitations) will continue to apply.
        </p>
      </Section>

      <Section title="12. Governing Law">
        <p>
          These Terms are governed by the laws of the jurisdiction in which Talkingo operates, without
          regard to conflict of law principles. Any disputes shall be resolved through binding arbitration
          or in the courts of that jurisdiction, as applicable.
        </p>
      </Section>

      <Section title="13. Changes to Terms">
        <p>
          We may update these Terms from time to time. Material changes will be communicated via email or
          in-app notification at least 30 days before taking effect. Your continued use after changes take
          effect constitutes acceptance. If you disagree with the changes, you must stop using the Service.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>For questions about these Terms, contact us at:</p>
        <p className="mt-2">📧 <strong>legal@talkingo.ai</strong></p>
      </Section>
    </LegalShell>
  )
}
