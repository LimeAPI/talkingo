/**
 * DEPRECATED thin shim → POST /api/billing/reactivate.
 *
 * Kept for backward compatibility during the unified-payments rollout. The
 * unified route is already provider-agnostic: it resolves the provider from the
 * caller's stored subscription and delegates to `provider.reactivate(...)`. No
 * Stripe SDK logic remains here (Req 1.4).
 *
 * New clients should call `/api/billing/reactivate` directly.
 */
export { POST } from '@/app/api/billing/reactivate/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
