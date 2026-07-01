/**
 * Standalone WebSocket server for the Gemini Live proxy (development).
 *
 * Runs independently from Next.js so dev can use Turbopack. In production the
 * SAME proxy logic runs inside `server.ts` (single-process). All the live-voice
 * logic lives in `src/server/live-proxy.ts` — this file is just the dev
 * transport: a tiny health-check HTTP server plus the WS upgrade wiring.
 *
 * Usage:
 *   npx tsx ws-server.ts                          # standalone (port 3001)
 *   NEXT_PUBLIC_LIVE_WS_URL=ws://localhost:3001   # client env var
 */

import { createServer } from 'http'
import { parse } from 'url'
import { WebSocketServer } from 'ws'
// Initialize Sentry first so it can hook process-level error handlers before
// any connection is served (no-op unless SENTRY_DSN is set).
import './src/server/sentry-node'
import { GEMINI_LIVE_PATH, authorizeLiveConnection, handleLiveSession } from './src/server/live-proxy'

const WS_PORT = parseInt(process.env.LIVE_WS_PORT ?? '3001', 10)

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', service: 'talkingo-ws' }))
})

const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url ?? '/')

  if (pathname !== GEMINI_LIVE_PATH) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  const parsedUrl = parse(req.url ?? '/', true)
  const jwt = (parsedUrl.query?.jwt as string) || (parsedUrl.query?.session as string)

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

httpServer.listen(WS_PORT, () => {
  console.log(`[ws-server] Live WebSocket server on port ${WS_PORT}`)
})
