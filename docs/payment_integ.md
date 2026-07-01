# Payments — How It Works

Short overview of the billing architecture. The code is the source of truth —
this doc just orients you. (All paths are under `apps/talkingo.ai/src`.)

## Shape

- **One provider interface** — `lib/payments/provider.ts` defines `PaymentProvider`.
  Two implementations: `stripe-provider.ts` and `dodo-provider.ts`. Routes never
  call a vendor SDK directly; they resolve a provider via `lib/payments/registry.ts`.
- **One webhook entry** — `lib/payments/webhook-handler.ts` (`handleWebhook`) verifies
  the signature, claims the event for idempotency (`${provider}:${eventId}`), then
  applies it. Both `/api/stripe/webhook` and `/api/webhook/dodo-payments` delegate here.
- **One race-safe writer** — `lib/payments/sync.ts` (`syncToAppwrite`) is the only
  place subscription state is persisted. It's monotonic on the provider event time,
  idempotent, and writes both canonical and legacy fields.
- **Entitlement is server-side** — `gemini/chat`, `gemini/stream`, `gemini/audio-chat`,
  `analyze`, and the live-voice WebSocket all gate on `getSubscription(userId)` status
  (`active`/`trialing`). The client paywall is UI only.

## Safety invariants (proven by tests in `src/__tests__/`)

- No lost payment, idempotent sync, monotonic state, no double charge — driven against
  the real `syncToAppwrite` / checkout handler.
- Real signature → idempotency → DB → entitlement is covered end-to-end in
  `webhook-signature-integration.test.ts` (real Stripe + Dodo crypto).
- Webhook idempotency and the free-usage counter **fail closed** if their Appwrite
  collection is missing; `server.ts` asserts required collections at boot.

## Setup

- Configure keys/products in `.env.local` (see `.env.example`).
- Provision collections: `npm run db:setup`.
- Provider product setup: `npm run stripe:setup` / `npm run dodo:setup`.
