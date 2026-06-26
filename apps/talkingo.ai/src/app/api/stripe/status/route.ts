/**
 * DEPRECATED thin shim → POST /api/billing/status.
 *
 * Kept for backward compatibility during the unified-payments rollout. The
 * unified route is already provider-agnostic: it resolves the provider from the
 * caller's stored subscription's canonical `provider` field and returns the
 * authoritative `UnifiedSubscription` (shaped with `status`, `plan`,
 * `customerId`, `trialEndsAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`,
 * `provider`). No Stripe SDK logic remains here (Req 1.4).
 *
 * New clients should call `/api/billing/status` directly.
 */
export { POST } from '@/app/api/billing/status/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
