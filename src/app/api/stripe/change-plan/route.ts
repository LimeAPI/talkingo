/**
 * DEPRECATED thin shim → POST /api/billing/change-plan.
 *
 * Kept for backward compatibility during the unified-payments rollout. The
 * unified route is already provider-agnostic: it validates the plan, resolves
 * the provider from the caller's stored subscription, and delegates to
 * `provider.changePlan(...)` (immediate proration + race-safe persistence). No
 * Stripe SDK logic remains here (Req 1.4). The request body `{ plan }` is
 * unchanged between the two routes.
 *
 * New clients should call `/api/billing/change-plan` directly.
 */
export { POST } from '@/app/api/billing/change-plan/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
