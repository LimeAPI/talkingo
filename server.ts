/**
 * Custom Next.js server — production entry point.
 *
 * Serves the Next.js app AND the Gemini Live WebSocket proxy in a single
 * process. The live-voice logic itself lives in `src/server/live-proxy.ts` and
 * is shared verbatim with the standalone dev server (`ws-server.ts`) — this file
 * is just the production transport (Next HTTP handler + WS upgrade wiring) plus a
 * boot-time check that the server-only collections exist.
 *
 * In development, prefer `next dev --turbopack` for HMR and run the WebSocket
 * server separately via `tsx ws-server.ts`.
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { Query } from 'node-appwrite'
import { APPWRITE_DB_ID, COLLECTION_IDS } from './src/lib/appwrite-schema'
import {
  GEMINI_LIVE_PATH,
  authorizeLiveConnection,
  handleLiveSession,
  getAdminDatabases,
} from './src/server/live-proxy'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME ?? 'localhost'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  // ── WebSocket upgrade handler ──────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/')

    // Let Next.js handle its own HMR WebSocket connections.
    if (pathname?.startsWith('/_next/webpack-hmr')) return

    if (pathname !== GEMINI_LIVE_PATH) {
      socket.destroy()
      return
    }

    const parsedWsUrl = parse(req.url ?? '/', true)
    const jwt = (parsedWsUrl.query?.jwt as string) || (parsedWsUrl.query?.session as string)

    authorizeLiveConnection(jwt)
      .then((res) => {
        if (!res.ok) {
          const line = res.code === 402 ? '402 Payment Required' : '401 Unauthorized'
          socket.write(`HTTP/1.1 ${line}\r\n\r\n`)
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket as any, head, (clientWs) => {
          handleLiveSession(clientWs, res.userId)
        })
      })
      .catch(() => {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
      })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    // Surface a misprovisioned database LOUDLY at boot rather than silently
    // failing closed on the first paid webhook / free-tier check in production.
    void assertRequiredCollections()
  })
})

/**
 * Boot-time check that the server-only collections required for billing
 * idempotency and free-tier enforcement exist. Best-effort: logs prominently and
 * never throws (a transient Appwrite blip at boot must not block startup; the
 * runtime paths already fail closed).
 */
async function assertRequiredCollections(): Promise<void> {
  const db = getAdminDatabases()
  if (!db) {
    console.error('[boot] APPWRITE_API_KEY missing — cannot verify required collections.')
    return
  }
  const required = [
    COLLECTION_IDS.SUBSCRIPTIONS,
    COLLECTION_IDS.WEBHOOK_EVENTS,
    COLLECTION_IDS.FREE_USAGE,
  ]
  const missing: string[] = []
  for (const id of required) {
    try {
      await db.listDocuments(APPWRITE_DB_ID, id, [Query.limit(1)])
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.code === 404) missing.push(id)
      else console.warn(`[boot] could not verify collection '${id}':`, (err as Error).message)
    }
  }
  if (missing.length > 0) {
    console.error(
      `[boot] ⚠️  MISSING required collections: ${missing.join(', ')}. ` +
      `Billing idempotency + free-tier enforcement FAIL CLOSED until \`npm run db:setup\` is run.`,
    )
  } else {
    console.log('[boot] ✓ Required collections present (subscriptions, webhook events, free usage).')
  }
}
