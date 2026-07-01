import { NextRequest } from 'next/server'

/**
 * Shared helper for the DEPRECATED `/api/stripe/*` thin shims.
 *
 * The legacy Stripe-only action routes are retained for backward compatibility
 * during the unified-payments rollout, but they must contain no Stripe SDK
 * logic (Req 1.4). Routes whose unified counterpart expects an explicit
 * `provider` in the body (checkout, sync-checkout) use this helper to inject
 * `provider: 'stripe'` and re-issue the request to the provider-agnostic
 * handler.
 *
 * Auth/origin headers are preserved so the unified handler's guards still see
 * the original caller; the stale `content-length` is dropped so the new body
 * length is recomputed by the runtime.
 */
export async function forwardToBillingAsStripe(
  req: NextRequest,
  handler: (r: NextRequest) => Promise<Response> | Response,
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const headers = new Headers(req.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  const forwarded = new NextRequest(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, provider: 'stripe' }),
  })
  return handler(forwarded)
}
