/**
 * Standalone Stripe invoice listing helper.
 *
 * Keeps the Stripe SDK out of the provider-agnostic `/api/billing/history` route:
 * the route resolves the user's provider + customer id from the stored
 * subscription and calls the matching helper, then renders the returned
 * `UnifiedInvoice[]`.
 *
 * This is a read-only listing — it never mutates Stripe or Appwrite state.
 *
 * _Requirements: 12.1, 12.3_
 */

import type Stripe from 'stripe'
import { stripe } from './client'
import type { UnifiedInvoice } from '../payments/provider'

/** How many invoices to pull. The history view is a recent-first summary. */
const INVOICE_PAGE_SIZE = 100

/**
 * List a Stripe customer's invoices and map them to the provider-agnostic
 * `UnifiedInvoice` shape.
 *
 * - `amount` is converted from Stripe's smallest-unit integer (e.g. cents) to a
 *   major-unit number using `amount_paid` when present, otherwise `total`.
 * - `date` is the invoice creation time in epoch ms.
 * - `receiptUrl` prefers the hosted invoice page, falling back to the PDF link.
 *
 * Any SDK/network failure propagates to the caller, which turns it into a
 * provider-unreachable error WITHOUT altering stored data (Req 12.3).
 */
export async function listStripeInvoices(customerId: string): Promise<UnifiedInvoice[]> {
  const page = await stripe.invoices.list({
    customer: customerId,
    limit: INVOICE_PAGE_SIZE,
  })

  return page.data.map((invoice: Stripe.Invoice) => {
    const smallestUnit =
      typeof invoice.amount_paid === 'number' ? invoice.amount_paid : (invoice.total ?? 0)

    return {
      id: invoice.id ?? `stripe_invoice_${invoice.created}`,
      date: (invoice.created ?? 0) * 1000,
      amount: smallestUnit / 100,
      currency: invoice.currency ?? 'usd',
      status: invoice.status ?? 'unknown',
      provider: 'stripe',
      receiptUrl: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? undefined,
    }
  })
}
