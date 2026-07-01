/**
 * Shared DodoPayments SDK instance.
 *
 * Lazily instantiated on first access — prevents build-time crashes when
 * env vars aren't available during static analysis.
 */

import 'server-only'
import DodoPayments from 'dodopayments'
import { DODOPAYMENTS_ENV, getDodoEnvironment } from './env'

let _dodo: DodoPayments | null = null

function getDodoInstance(): DodoPayments {
  if (_dodo) return _dodo
  _dodo = new DodoPayments({
    bearerToken: DODOPAYMENTS_ENV.DODOPAYMENTS_API_KEY,
    environment: getDodoEnvironment(),
  })
  return _dodo
}

/** Proxy that lazily creates the DodoPayments instance on first method call. */
export const dodo = new Proxy({} as DodoPayments, {
  get(_target, prop: string | symbol) {
    const instance = getDodoInstance()
    const value = (instance as any)[prop]
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
