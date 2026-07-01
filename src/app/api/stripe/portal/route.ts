/**
 * DEPRECATED thin shim → POST /api/billing/manage.
 *
 * Kept for backward compatibility during the unified-payments rollout. The
 * legacy "open the Stripe Customer Portal" endpoint is superseded by the
 * provider-agnostic manage surface, which resolves the provider from the
 * caller's stored subscription and returns a managed billing / payment-method
 * URL as `{ url }` (Stripe Customer Portal or Dodo hosted portal). No Stripe
 * SDK logic remains here (Req 1.4).
 *
 * New clients should call `/api/billing/manage` directly.
 */
export { POST } from '@/app/api/billing/manage/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
