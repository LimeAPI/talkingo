import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { upsertSubscription, updateUserPrefs } from '@/lib/appwrite-server'

/**
 * Stripe Webhook handler.
 * Listens for subscription events and syncs state to:
 * 1. Appwrite `subscriptions` collection (queryable, the source of truth)
 * 2. Appwrite Account Preferences (for instant cross-device client sync)
 *
 * Flow: Stripe → Webhook → Appwrite DB + Account Prefs → Client reads on login
 *
 * Events handled:
 * - checkout.session.completed → store customerId + mark as trialing
 * - customer.subscription.updated → sync status (active/past_due/canceled)
 * - customer.subscription.deleted → mark as expired
 * - invoice.payment_failed → mark as past_due
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil' as any,
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error('[webhook] Signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string
        const plan = session.metadata?.plan || 'monthly'

        console.log(`[webhook] Checkout completed — user: ${userId}, customer: ${customerId}`)

        if (userId) {
          // Write to subscriptions collection (source of truth)
          await upsertSubscription(userId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: 'trialing',
            plan,
            updatedAt: Date.now(),
          })

          // Also mirror to Account Prefs (for instant client-side sync)
          await updateUserPrefs(userId, {
            stripeCustomerId: customerId,
            subscriptionStatus: 'trialing',
            subscriptionPlan: plan,
            subscriptionUpdatedAt: Date.now(),
          })

          console.log(`[webhook] Saved subscription to DB for user: ${userId}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.userId
        const status = subscription.status
        const plan = subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly'
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

        console.log(`[webhook] Subscription updated — user: ${userId}, status: ${status}`)

        if (userId) {
          await upsertSubscription(userId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            status,
            plan,
            trialEnd: subscription.trial_end ? (subscription.trial_end as number) * 1000 : undefined,
            periodEnd: (subscription as any).current_period_end ? (subscription as any).current_period_end * 1000 : undefined,
            updatedAt: Date.now(),
          })

          await updateUserPrefs(userId, {
            subscriptionStatus: status,
            subscriptionPlan: plan,
            subscriptionUpdatedAt: Date.now(),
            ...(subscription.trial_end && {
              subscriptionTrialEnd: (subscription.trial_end as number) * 1000,
            }),
            ...((subscription as any).current_period_end && {
              subscriptionPeriodEnd: (subscription as any).current_period_end * 1000,
            }),
          })

          console.log(`[webhook] Updated subscription in DB: ${status}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.userId
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

        console.log(`[webhook] Subscription cancelled — user: ${userId}`)

        if (userId) {
          await upsertSubscription(userId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            status: 'expired',
            plan: subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
            updatedAt: Date.now(),
          })

          await updateUserPrefs(userId, {
            subscriptionStatus: 'expired',
            subscriptionUpdatedAt: Date.now(),
          })

          console.log(`[webhook] Marked subscription as expired for user: ${userId}`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const subscriptionId = (invoice as any).subscription as string

        console.log(`[webhook] Payment failed — customer: ${customerId}`)

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            const userId = sub.metadata?.userId
            if (userId) {
              await upsertSubscription(userId, {
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: 'past_due',
                plan: sub.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
                updatedAt: Date.now(),
              })

              await updateUserPrefs(userId, {
                subscriptionStatus: 'past_due',
                subscriptionUpdatedAt: Date.now(),
              })

              console.log(`[webhook] Marked subscription as past_due for user: ${userId}`)
            }
          } catch (err) {
            console.error('[webhook] Could not retrieve subscription for payment_failed:', err)
          }
        }
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
