/**
 * Shared Sentry PII scrubber (isomorphic — used by the browser, Next server,
 * edge, and the standalone WebSocket server inits).
 *
 * This app handles auth sessions, emails, and payment data, so we strip the
 * obvious carriers of secrets/PII before any event leaves the process:
 *   - request cookies + Authorization/Cookie headers,
 *   - `jwt` / `session` / `token` / `key` query params in URLs (the Gemini Live
 *     socket passes the session JWT as a query param),
 *   - user email / ip / username.
 *
 * It is intentionally typed generically so the same function satisfies the
 * `beforeSend` signature of both `@sentry/nextjs` and `@sentry/node` without
 * coupling to a specific package's exported event type.
 */

const SECRET_QUERY_PARAMS = /([?&](?:jwt|session|token|api[_-]?key|key|secret)=)[^&\s]+/gi

function redactUrlSecrets(value: string): string {
  return value.replace(SECRET_QUERY_PARAMS, '$1[redacted]')
}

interface ScrubbableEvent {
  request?: {
    cookies?: unknown
    headers?: Record<string, unknown>
    query_string?: unknown
    url?: unknown
    data?: unknown
  }
  user?: {
    email?: unknown
    ip_address?: unknown
    username?: unknown
    [key: string]: unknown
  }
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const req = event.request
  if (req) {
    // Cookies and auth headers can carry the session — never send them.
    delete req.cookies
    if (req.headers) {
      for (const key of Object.keys(req.headers)) {
        const k = key.toLowerCase()
        if (k === 'authorization' || k === 'cookie' || k === 'x-appwrite-key') {
          delete req.headers[key]
        }
      }
    }
    if (typeof req.query_string === 'string') {
      req.query_string = redactUrlSecrets(req.query_string)
    }
    if (typeof req.url === 'string') {
      req.url = redactUrlSecrets(req.url)
    }
  }

  if (event.user) {
    delete event.user.email
    delete event.user.ip_address
    delete event.user.username
  }

  return event
}
