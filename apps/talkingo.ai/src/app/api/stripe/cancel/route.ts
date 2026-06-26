/**
 * DEPRECATED thin shim → POST /api/billing/cancel.
 *
 * Kept for backward compatibility during the unified-payments rollout. The
 * unified route is already provider-agnostic: it resolves the provider from the
 * caller's stored subscription (which is Stripe for these legacy callers) and
 * delegates to `provider.cancel(...)`. No Stripe SDK logic remains here (Req 1.4).
 *
 * New clients should call `/api/billing/cancel` directly.
 */
export { POST } from '@/app/api/billing/cancel/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
