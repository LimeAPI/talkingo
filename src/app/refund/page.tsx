import type { Metadata } from 'next'
import { RotateCcw } from 'lucide-react'
import { LegalShell, Section, SubSection } from '@/components/site/LegalShell'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — Talkingo',
  description:
    'How Talkingo subscriptions, trials, cancellations, and refunds work across Stripe and DodoPayments.',
}

export default function RefundPolicyPage() {
  return (
    <LegalShell
      eyebrow="Billing"
      icon={RotateCcw}
      title="Refund & Cancellation Policy"
      updated="June 30, 2026"
      related={[
        { href: '/terms', label: 'Terms of Service' },
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/contact', label: 'Contact Support' },
      ]}
    >
      <p>
        This Refund &amp; Cancellation Policy explains how billing, trials, cancellations, and refunds work
        for <strong>Talkingo</strong> subscriptions. It applies alongside our{' '}
        <strong>Terms of Service</strong>. Payments are processed securely by our payment partners —
        <strong> Stripe</strong> and <strong>DodoPayments</strong> — and Talkingo never stores your full
        card details.
      </p>

      <Section title="1. Our Plans">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Free</strong> — $0. 50 free messages (one-time, no expiry), 2 tutors, levels 1–4. No payment required.</li>
          <li><strong>Premium</strong> — $30/mo, billed monthly. Optional 5-day trial for $5, which then converts to $30/mo unless cancelled.</li>
          <li><strong>Yearly</strong> — $360/yr, billed once annually.</li>
        </ul>
        <p className="mt-2">
          All paid plans renew automatically at the end of each billing period until cancelled. The exact
          price and currency shown at checkout — including any local taxes or regional pricing applied by
          our payment provider — is the amount you will be charged.
        </p>
      </Section>

      <Section title="2. Free Trial">
        <SubSection title="2.1 How the trial works">
          The Premium trial gives you 5 days of full Premium access for a one-time $5 charge. At the end of
          the 5-day period, your subscription automatically converts to the standard Premium plan at $30/mo
          unless you cancel before the trial ends.
        </SubSection>
        <SubSection title="2.2 Avoiding the renewal charge">
          To avoid being charged for the first full month, cancel at any time before your trial period ends.
          Cancelling during the trial keeps your access until the trial&apos;s final day, after which no
          further charge is made. The initial $5 trial fee is non-refundable, as it covers the trial period
          already provided.
        </SubSection>
      </Section>

      <Section title="3. Cancelling Your Subscription">
        <SubSection title="3.1 Self-service cancellation">
          <p>You can cancel anytime, in one click, with no need to contact us:</p>
          <ol className="list-decimal pl-5 space-y-1.5 mt-1.5">
            <li>Sign in to Talkingo</li>
            <li>Open <strong>Profile → Manage Subscription</strong></li>
            <li>Select <strong>Cancel Subscription</strong> and confirm</li>
          </ol>
        </SubSection>
        <SubSection title="3.2 What happens after you cancel">
          Cancellation stops future renewals. You keep full Premium access until the end of the billing
          period you have already paid for — your plan then reverts to Free. We do not lock you out the
          moment you cancel, and we never charge a cancellation fee.
        </SubSection>
        <SubSection title="3.3 Changing your mind">
          If you cancel and then change your mind before the period ends, you can reactivate your
          subscription from the same <strong>Manage Subscription</strong> screen to resume automatic renewal.
        </SubSection>
      </Section>

      <Section title="4. Refunds">
        <SubSection title="4.1 General policy">
          Because Talkingo is a digital service delivered instantly, subscription fees are generally
          non-refundable once a billing period has begun. When you cancel, you retain access for the
          remainder of the period you paid for rather than receiving a pro-rated refund.
        </SubSection>
        <SubSection title="4.2 14-day right of withdrawal (EU / EEA / UK)">
          If you are a consumer in the EU, EEA, or UK, you may have a statutory right to withdraw from a
          purchase within 14 days. Where you begin using paid features immediately, you acknowledge that the
          service has started and that your withdrawal right may be reduced in proportion to the access
          already used. To exercise this right, contact us within 14 days of your purchase.
        </SubSection>
        <SubSection title="4.3 Discretionary refunds">
          We want you to be happy. If you were charged in error, experienced a technical issue that
          prevented you from using Premium, or were billed after a cancellation you believe was completed,
          contact us and we will review your case. Approved refunds are returned to your original payment
          method via Stripe or DodoPayments and typically appear within 5–10 business days, depending on
          your bank or card issuer.
        </SubSection>
        <SubSection title="4.4 Annual plans">
          For Yearly subscriptions, refund requests made within 14 days of the initial purchase or renewal
          are reviewed on a case-by-case basis. After 14 days, the annual plan is non-refundable, but you
          may cancel to prevent the next year&apos;s renewal.
        </SubSection>
      </Section>

      <Section title="5. Failed Payments & Past-Due Accounts">
        <p>
          If a renewal payment fails, your subscription enters a past-due state and our payment provider may
          retry the charge. You can update your payment method from <strong>Profile → Manage Subscription</strong>.
          If payment cannot be collected, your subscription will lapse and your account will return to the
          Free plan. You are not charged for periods you did not receive Premium access.
        </p>
      </Section>

      <Section title="6. Price Changes">
        <p>
          We may change subscription pricing in the future. Any change will be communicated at least 30 days
          in advance and will only apply to billing periods that begin after the change takes effect.
          Continued use after a price change constitutes acceptance of the new pricing; if you disagree, you
          may cancel before the new price applies.
        </p>
      </Section>

      <Section title="7. How to Request a Refund">
        <p>To request a refund or raise a billing question, email us with the details below:</p>
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li>The email address associated with your account</li>
          <li>The approximate date and amount of the charge</li>
          <li>The payment method or provider used (Stripe or DodoPayments)</li>
          <li>A short description of the issue</li>
        </ul>
        <p className="mt-3">📧 <strong>support@talkingo.ai</strong></p>
        <p className="mt-1 text-[12px] text-[oklch(var(--color-muted))]">
          We aim to respond within 48 hours. This policy does not limit any non-waivable rights you have
          under applicable consumer protection law.
        </p>
      </Section>
    </LegalShell>
  )
}
