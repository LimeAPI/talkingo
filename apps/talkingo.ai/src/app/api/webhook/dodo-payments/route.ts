import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DodoPayments Webhook handler.
 *
 * Falls back to a no-op handler when DODO_PAYMENTS_WEBHOOK_SECRET is not
 * configured (e.g. during build or when only Stripe is active).
 */
export async function POST(req: NextRequest) {
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_SECRET

  if (!webhookKey) {
    console.warn('[DodoPayments] Missing DODO_PAYMENTS_WEBHOOK_SECRET — webhook skipped')
    return NextResponse.json({ received: true, skipped: true })
  }

  // Lazy-import the DodoPayments adapter so the build doesn't fail when
  // the package is not yet installed / can't be resolved at build time.
  const { Webhooks } = await import('@dodopayments/nextjs')

  const handler = Webhooks({
    webhookKey,
    onPayload: async (payload: any) => {
      console.log('[DodoPayments] Webhook received:', payload.type)
    },
    onPaymentSucceeded: async (payload: any) => {
      console.log('[DodoPayments] Payment Succeeded:', { data: payload.data })
    },
    onPaymentFailed: async (payload: any) => {
      console.log('[DodoPayments] Payment Failed:', { data: payload.data })
    },
    onPaymentProcessing: async (payload: any) => {
      console.log('[DodoPayments] Payment Processing:', { data: payload.data })
    },
    onPaymentCancelled: async (payload: any) => {
      console.log('[DodoPayments] Payment Cancelled:', { data: payload.data })
    },
    onRefundSucceeded: async (payload: any) => {
      console.log('[DodoPayments] Refund Succeeded:', { data: payload.data })
    },
    onRefundFailed: async (payload: any) => {
      console.log('[DodoPayments] Refund Failed:', { data: payload.data })
    },
    onSubscriptionActive: async (payload: any) => {
      console.log('[DodoPayments] Subscription Active:', { data: payload.data })
    },
    onSubscriptionRenewed: async (payload: any) => {
      console.log('[DodoPayments] Subscription Renewed:', { data: payload.data })
    },
    onSubscriptionPlanChanged: async (payload: any) => {
      console.log('[DodoPayments] Subscription Plan Changed:', { data: payload.data })
    },
    onSubscriptionCancelled: async (payload: any) => {
      console.log('[DodoPayments] Subscription Cancelled:', { data: payload.data })
    },
    onSubscriptionFailed: async (payload: any) => {
      console.log('[DodoPayments] Subscription Failed:', { data: payload.data })
    },
    onSubscriptionExpired: async (payload: any) => {
      console.log('[DodoPayments] Subscription Expired:', { data: payload.data })
    },
    onSubscriptionUpdated: async (payload: any) => {
      console.log('[DodoPayments] Subscription Updated:', { data: payload.data })
    },
  })

  return handler(req)
}