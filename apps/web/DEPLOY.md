# Deploying Talkingo Web

The web app lives in `apps/web/` but depends on `packages/shared/` at build time. Here's how to deploy it.

## Option 1: Vercel / Railway (Recommended — Zero Config)

These platforms handle monorepos natively.

1. Push the entire repo to GitHub
2. Connect to Vercel/Railway
3. Set **Root Directory** to `apps/web`
4. Set **Build Command** to `npm run build` (or leave default)
5. Set **Install Command** to `npm install` (from repo root)
6. Add all env vars from `.env.example` with production values

**Vercel-specific:** Add a `vercel.json` at repo root:
```json
{
  "buildCommand": "npm run build --workspace=@talkingo/web",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": "apps/web/.next"
}
```

## Option 2: Docker (Any VPS)

From the **repo root**:
```bash
docker build -t talkingo-web -f apps/web/Dockerfile .
docker run -p 3000:3000 --env-file apps/web/.env.local talkingo-web
```

## Option 3: Manual VPS Deployment

From the **repo root**:
```bash
npm install                    # installs all workspaces
npm run build                  # builds the web app
cd apps/web
NODE_ENV=production npx tsx server.ts
```

## Required Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://makersuite.google.com/app/apikey) |
| `APPWRITE_API_KEY` | Appwrite Console → API Keys |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Signing secret |
| `NEXT_PUBLIC_APP_URL` | Your production URL (e.g., `https://talkingo.app`) |

## Pre-Deploy Checklist

- [ ] Update `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Switch Stripe to **live mode** (new keys + price IDs)
- [ ] Create Stripe webhook endpoint: `https://yourdomain.com/api/stripe/webhook`
- [ ] Enable events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Create `subscriptions` collection in Appwrite (see `scripts/SETUP_SUBSCRIPTIONS_COLLECTION.md`)
- [ ] Add production domain to `next.config.ts` → `serverActions.allowedOrigins`
- [ ] Set up HTTPS (required for cookies + microphone)
- [ ] Generate strong `CACHE_INVALIDATION_SECRET`
- [ ] Ensure `.env.local` is NOT committed to git

## Architecture

```
talkingo/
├── apps/web/          ← The app you're deploying
│   ├── src/           ← Next.js app (pages, API routes, components)
│   ├── server.ts      ← Custom server (WebSocket proxy for live calls)
│   └── .next/         ← Build output
├── packages/shared/   ← Shared types, prompts, personas (compiled into web at build time)
└── package.json       ← Workspace root
```

The `packages/shared` folder is compiled INTO the web app's bundle at build time via `transpilePackages` in `next.config.ts`. It does NOT need to be deployed separately — it's baked into the `.next/` output.
