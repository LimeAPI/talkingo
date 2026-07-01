/**
 * Standalone DodoPayments invoice/payment listing helper.
 *
 * Keeps the Dodo SDK out of the provider-agnostic `/api/billing/history` route.
 * Dodo exposes billing records through the Payments API (`payments.list`), so we
 * map each payment to the same provider-agnostic `UnifiedInvoice` shape the
 * Stripe helper returns.
 *
 * This is a read-only listing — it never mutates Dodo or Appwrite state.
 *
 * _Requirements: 12.1, 12.3_
 */

import 'server-only'
import { dodo } from './client'
import type { UnifiedInvoice } from '../payments/provider'

/** How many payments to pull for the history view. */
const PAYMENT_PAGE_SIZE = 100

/** A single Dodo payment record (loosely typed; the SDK shapes can lag the API). */
interface DodoPaymentRecord {
  payment_id?: string
  created_at?: string
  total_amount?: number
  currency?: string
  status?: string | null
}

/**
 * List a Dodo customer's payments and map them to `UnifiedInvoice[]`.
 *
 * - `amount` is converted from Dodo's smallest-unit integer (e.g. cents) to a
 *   major-unit number.
 * - `date` is the payment `created_at` timestamp parsed to epoch ms.
 * - Dodo's list response does not expose a hosted receipt URL, so `receiptUrl`
 *   is left undefined (the field is optional per Req 12.1).
 *
 * Any SDK/network failure propagates to the caller, which turns it into a
 * provider-unreachable error WITHOUT altering stored data (Req 12.3).
 */
export async function listDodoInvoices(customerId: string): Promise<UnifiedInvoice[]> {
  const res: any = await dodo.payments.list({
    customer_id: customerId,
    page_size: PAYMENT_PAGE_SIZE,
  } as any)

  const items: DodoPaymentRecord[] = res?.items ?? res?.data ?? []

  return items.map((payment) => {
    const parsedDate = payment.created_at ? Date.parse(payment.created_at) : NaN
    const amount = typeof payment.total_amount === 'number' ? payment.total_amount / 100 : 0

    return {
      id: payment.payment_id ?? `dodo_payment_${parsedDate}`,
      date: Number.isNaN(parsedDate) ? 0 : parsedDate,
      amount,
      currency: payment.currency ?? 'usd',
      status: payment.status ?? 'unknown',
      provider: 'dodopayments',
      receiptUrl: undefined,
    }
  })
}
