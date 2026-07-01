I'll start by reading the intended product (docs) and mapping the real tree, then trace actual flows. Let me kick off parallel investigation.

The docs reference `apps/web/...` paths but the real workspace is `apps/talkingo.ai`. That's a flag already (stale docs). Let me map the actual source tree fully.

Now let me expand the API routes and dispatch parallel deep-dives while I read the security/payments/learning core myself.

Now I understand the shape. Critically, there are **two parallel payment surfaces**: `/api/stripe/*` (old) and `/api/billing/*` (new provider-abstraction). That's a major source-of-truth flag I'll dig into.

Let me dispatch parallel deep-dives for the breadth-heavy pillars while I personally read the security/payments/learning core.

I have the core realtime pipeline. Now let me read the audio layer, TTS, conversation mode components, and the HTTP API routes.

Let me read the HTTP route handlers and the conversation mode components, and check for a separate tts route and ws-server.ts.

There is a separate `api/tts` route and a `ws-server.ts`. Let me read those, the conversation mode components, and the auth-guard.

Now the memory and storage layer, plus the chat routes and curriculum.

Now let me trace where the planner injection feeds into state, and verify curriculum/language counts.

Now verifying seed counts, languages, and heritage.

I have enough evidence across the full pipeline. Compiling the report.

I have everything I need. Let me compile the findings.

Strong picture of learning + realtime. Now the money and security questions. Let me dispatch payments + UX/i18n deep-dives and personally read the auth, entitlement, and webhook core.

I have enough to deliver a thorough, evidence-based verdict.

I have a complete evidence-based picture. Compiling findings.

Let me verify the remaining security surface directly: headers/CSP, secret hygiene, XSS sinks, and the deploy story.

Let me run the test suite to verify what actually passes (the suite includes property-based tests), turning "inferred" into "verified" for the billing invariants.

I've now traced every pillar end to end, read the actual code, and run the test suite (372 pass / 2 fail). Here is the audit.

---

# Talkingo — Production Readiness Audit

Scope note on method: I read the real tree under `src/`, `server.ts`, `ws-server.ts`, `public/worklets`, and the test suite, and I executed `npm run test`. "Verified" = I read it or ran it. "Inferred" = reasoned but not executed. I did not have runtime/secret access (no live Stripe/Dodo/Gemini/Appwrite calls), and I did not read `.env.local` values.

One structural thing to know up front: the docs in `docs/payment_integ.md` reference `apps/web/src/...` paths that **do not exist** — the real app is `apps/talkingo.ai`. The docs are stale relative to the code.

---

## 1. Executive Verdict

This is a genuinely shipped product, not a prototype in costume — the conversation engine, onboarding, dual-provider billing, 32-locale i18n, legal pages, and PWA are all real and wired. The core promise ("an AI that is both your conversation partner *and* your teacher") is **partially delivered**: there is a real, deterministic cross-session learning loop (`structured-memory.ts` → planner injection), but the actual *teaching* is delegated entirely to the LLM by a 3-paragraph "soul" prompt that explicitly says "Never drill. Never lecture… Just talk" (`src/shared/gemini/master-prompt.ts`), and most of the pedagogical gaps your own `docs/audit.md` flagged are **still true in code**. The realtime voice pipeline is the strongest pillar — proxied, premium-gated, fail-closed, with mature reconnection/cleanup. The two things that would stop me from putting my name on a production launch tomorrow are an **OAuth account-linking hole** (no `email_verified` check before linking accounts by email) and **two fail-open paths in billing** (webhook idempotency and the free-usage counter both silently disable if an Appwrite collection is missing).

**Readiness scores (1–10):**

> **⚠️ Reading note (post-implementation):** Sections 1–5 below are the **original pre-fix audit snapshot**, preserved for history. **All of Tiers 0–3 in §6 have since been implemented and verified** (`next build` exits 0; full suite **407 pass / 0 fail**; servers + CSP runtime-smoke-tested). §6 is the source of truth for current state. The score column below shows **original → now**.

| Pillar | Score (orig → now) | What changed |
|---|---|---|
| Core Learning | **5 → 7** | Within-session "circle back" coach, real `keyWords` vocab tracking, surfaced progress (recap + profile), recap-on-return. Still LLM-trust for teaching quality; no real SRS; voice path doesn't emit keyWords. |
| Realtime Voice | **8 → 9** | WS proxy de-duplicated into one shared module; `analyze`/forced-Gemini-TTS now premium-gated; origin checks added. |
| Security | **5 → 8** | OAuth `email_verified` guard, nonce+`strict-dynamic` CSP, webhook idempotency fail-closed, origin checks. JS-readable token remains (mitigated by CSP; WS-ticket optional/future); rate limiter still per-instance. |
| Payments | **6 → 8** | Fail-closed idempotency + free counter, provider event-time stamping, a real signature→DB→entitlement integration test. Dodo path still `any`-typed; no reconcile cron. |
| UX / Funnel | **8 → 9** | Recap-on-return, visible progress, "6/day" copy corrected. Live-AI first-run dependency still present. |
| Code Health | **6 → 8** | WS dedup, stale tests fixed, docs cleaned, memory field-collision removed. `learner-memory.ts` now local-only (not yet deleted). |

_Original scores and justifications (for reference):_

| Pillar | Score | One-line justification |
|---|---|---|
| Core Learning | **5** | Real cross-session memory/planner loop, but teaching is LLM-improvised; no within-session recycling, no surfaced progress metrics — promise overstates reality. |
| Realtime Voice | **8** | Proxied, premium-gated (402, fail-closed), reconnection/resume/idle-end/VAD all handled; docked for `server.ts`/`ws-server.ts` duplication and ungated TTS/analyze cost surface. |
| Security | **5** | Solid fundamentals (JWT, CSP, server-side entitlement) undermined by OAuth email-linking, a JS-readable session cookie, and fail-open webhook idempotency. |
| Payments | **6** | Excellent architecture and unit-proven invariants (tests pass), but money-critical edges are unproven end-to-end and two paths fail open. |
| UX / Funnel | **8** | Coherent, complete, real legal + i18n + PWA; docked for live-AI dependence on first run and "6/day" vs 50-lifetime copy mismatch. |
| Code Health | **6** | Good patterns, but duplicated WS servers, dual sources of truth, `.replaybak` cruft, and stale tests. |

---

## 2. Critical Blockers (ranked)

> **Phase 1 status (✅ RESOLVED):** Blockers 1–4 fixed and verified. **Phase 2 status (✅ RESOLVED):** Blocker 5 fixed — the nonce + `strict-dynamic` CSP (runtime-verified) closes the XSS path that made the JS-readable token exploitable; the optional WS-only ticket is noted as a future enhancement. Details per item below.

### BLOCKER 1 — OAuth account takeover via email linking (no `email_verified` check) — Security, HIGH→CRITICAL — ✅ RESOLVED
**Files:** `src/app/api/auth/google/callback/route.ts`, `src/app/api/auth/facebook/callback/route.ts`
**Verified:** `grep email_verified` → **no matches** anywhere. The Google callback does `users.list([Query.equal('email', email)])` and, if a row exists, logs the caller into that account by minting an admin token (`users.createToken(userId,…)`) — purely on email match. The Facebook callback uses the identical pattern.
**Exploit:** Facebook does not guarantee a verified email and a user controls their FB profile email. An attacker sets their Facebook email to a victim's address; signing in with Facebook matches the victim's existing (e.g. Google-created) account and mints a full session for it. This is account takeover. Google's userinfo is *usually* verified, but the code never checks the `email_verified`/`verified_email` claim, so this rests on provider behavior, not your logic.
**Fix:** Reject the login (or branch to a separate identity) when the provider response is not email-verified — check `googleUser.email_verified === true` and Facebook's verified status before doing any email-based lookup. Prefer linking by provider subject id (`googleSub` is already stored in prefs) over email. Effort: small.

### BLOCKER 2 — Webhook idempotency fails OPEN on missing collection — Payments, HIGH — ✅ RESOLVED
**File:** `src/lib/appwrite-server.ts` → `claimWebhookEvent()`
**Verified:** on a 404 (the `WEBHOOK_EVENTS` collection not provisioned) it logs a warning and `return true` — i.e. every delivery is treated as first-sight. Stripe/Dodo retry deliveries aggressively; with idempotency disabled, retries reprocess and can double-apply state transitions.
**Fix:** fail closed — throw/return non-2xx so the provider retries instead of silently disabling replay protection, and assert the collection exists at boot. Effort: small.

### BLOCKER 3 — Status-transition events stamped with `Date.now()` not event time — Payments, HIGH — ✅ RESOLVED
**File:** `src/lib/payments/webhook-handler.ts` → `applyStatusTransition()` builds `UnifiedSubscription` with `updatedAt: Date.now()`.
**Verified:** the monotonic guard in `syncToAppwrite` (`src/lib/payments/sync.ts`) correctly rejects stale writes by comparing `updatedAt`. But because transition events (`invoice.payment_failed`→past_due, `charge.refunded`→canceled, `charge.dispute.created`→expired) use processing time rather than provider event time, an out-of-order/delayed delivery can stamp a *newer* timestamp on an *older* transition and override fresher state (e.g. a re-activation gets clobbered back to past_due).
**Fix:** carry the provider event timestamp into `NormalizedEvent` and use it for `updatedAt`. Effort: small–medium.

### BLOCKER 4 — Free-usage counter fails OPEN to per-instance memory — Payments/Security, MEDIUM→HIGH — ✅ RESOLVED (counter now fails closed; the in-memory rate limiter is still per-instance — acceptable on the single-process deploy, see note)
**File:** `src/lib/appwrite-server.ts` → `incrementFreeUsage()`/`getFreeUsage()` fall back to `inMemoryUsageFallback` (a module `Map`) if the `FREE_USAGE` collection is missing or errors.
**Verified.** On serverless/multi-instance or after a restart, the lifetime 50-message cap resets/parallelizes per instance — free users get effectively unlimited text AI. Combined with the in-memory, non-distributed rate limiter (`src/lib/api/auth-guard.ts`, comment: "Not distributed — works per-instance only"), the free-tier economics are not enforceable under horizontal scale.
**Fix:** treat counter-store failure as deny (or hard-require the collection); use a distributed store for both usage and rate limiting in production. Effort: medium.

### BLOCKER 5 — Session JWT in a JS-readable cookie + `unsafe-inline` script CSP — Security, MEDIUM — ✅ RESOLVED (Phase 2: nonce CSP shipped; WS-only ticket optional/future)
**Files:** `src/app/api/auth/google/callback/route.ts` (`cookies.set('appwrite-jwt', jwt, { httpOnly: false … })`), `next.config.ts` (CSP `script-src 'self' 'unsafe-inline'`).
**Verified.** The session token is intentionally readable by JS (needed because browsers can't set headers on the Live WebSocket, so it's passed as `?jwt=`). That's a defensible tradeoff, but it means any XSS = session theft, and `'unsafe-inline'` in `script-src` materially weakens your XSS defense. The one HTML sink (`src/components/conversation/TranscriptMessage.tsx`) is correctly `DOMPurify.sanitize`d, which helps.
**Fix:** drop `'unsafe-inline'` from `script-src` (use nonces/hashes), keep tokens short-lived (already 3600s), and consider a short-lived WS-only ticket instead of exposing the full session JWT to JS. Effort: medium.

None of these are architectural rewrites — they're targeted hardening of an otherwise well-built system.

---

## 3. Per-Pillar Findings

### 3.1 Core Product & Learning Engine — the thing that matters

**How a turn is actually built (verified):** `getSystemInstruction(state)` in `src/shared/gemini/prompts.ts` concatenates 8 blocks (soul → persona → level → language → language-lock → scenario → memory → adaptive → response-format) and asks Gemini to return JSON with `response`, `corrections[]`, `memoryUpdate`. The HTTP routes (`src/app/api/gemini/chat/route.ts`, `stream/route.ts`) are **stateless prompt relays** — they hold no learning state. The server contains zero pedagogy.

**Is there a teaching strategy across a session? Mostly no (verified).** `master-prompt.ts` is the entire teaching philosophy and it actively suppresses overt teaching: *"Never drill. Never lecture… Don't turn moments into lessons. Just talk."* Within-session, the only adaptive signal is `recentCorrectionCountsRef` in `ConversationPage.tsx` (~L930): if error rate >0.6 over the last 5 turns it injects `_adaptiveHint: 'high-error-rate'` → `buildAdaptiveBlock`. That's confidence management, not vocabulary recycling.

**Is there a real cross-session loop? Yes, and it's the best part of the learning engine (verified).** `src/lib/storage/structured-memory.ts` (v2) deterministically, with $0 extra AI cost, tracks `vocab[]` (introduced vs produced via `processVocabulary`), `errors[]` (`ErrorPattern` with frequency/recency), and rolling `sessions[]`. `computePlannerTargets()` selects ≤5 dormant words + ≤3 errors with `frequency>=3`, and `buildPlannerInjection()` renders "SESSION TARGETS (weave naturally — never announce or drill)" into the next session's prompt via `buildMemoryBlock` → `state.practiceTargets`. So "memory drives the next session" is **real**, not a diary.

**But your `docs/audit.md` gaps are largely still true (verified):**
- #1 within-session recycling of just-introduced vocab — **absent**; production is only tallied at session *end* (`processVocabulary` scans messages once).
- #2 recast reinforcement of a corrected form later in the same session — **absent**; only natural in-reply recast + cross-session error targeting.
- #5 speaking/progress metrics surfaced to the user — **absent**; data exists in `structured-memory` but isn't shown as "you used 5 new words / sentences grew."
- #6 modes serve learning goals — **still I/O plumbing**: Chat and Handsfree share the exact HTTP path (`/api/gemini/chat`), Native and Live both ride the same `LiveCallService` WebSocket; the difference is input/output, not pedagogy. (A newer `learningMode: 'free'|'practice'` toggle exists in `ConversationPage.tsx` and does change memory injection — a step toward purpose-based modes.)
- #7 spaced repetition — **present but crude**: recency/frequency thresholds (`TWO_DAYS`, `producedCount>=3`, `ONE_WEEK`) in `computePlannerTargets`, not a real SM-2/Leitner SRS.

**Evidence the prompt was deliberately stripped of teaching:** my test run shows `src/__tests__/preservation.test.ts` and `bug-condition-exploration.test.ts` failing because they assert `MASTER_PROMPT` contains phrases like "correct naturally" that the rewritten soul prompt no longer has. The tests are stale, but they document that the engine moved *away* from explicit teaching guidance.

**Curriculum/languages (verified):** 12 real levels with authored `aiBehavior` (`src/shared/levels/index.ts`); 300 seeds (25/level) in `src/shared/curriculum/levels/` — L01, L10–L12 spot-checked as fully authored, L02–L09 inferred consistent. Seeds are **language-agnostic** (one `scenarioBrief` executed by the AI in any target language), so "23 languages × 12 levels" is real coverage but shallow — no per-language bespoke content. `LANGUAGES` actually defines **32** languages (claim of 23 is understated). Dialects exist for only 3 (ar/es/pt, `dialects.ts`); heritage mode is a 9-language persona overlay (`getHeritagePersonaOverlay`), not a separate engine.

**Verdict:** The learning loop is real but thin and trust-based — it suggests targets to the LLM and accounts for outcomes deterministically, but never verifies the AI actually taught, recycled, or reinforced anything. It's meaningfully more than a demo and meaningfully less than an engineered tutor. **Highest-leverage fix:** implement within-session vocabulary tracking (introduced-this-session vs produced) and feed it back mid-session ("circle back" pressure), plus surface 2–3 progress metrics post-session. The first is mostly prompt+client-state; the value-per-effort is high because it directly closes the #1 gap between the marketing and the code.

### 3.2 Realtime Voice / AI Pipeline — strongest pillar (verified)

- **Proxied, key server-only.** Browser → `/api/gemini/live` only; `server.ts`/`ws-server.ts` open the upstream Google socket with `?key=${process.env.GEMINI_API_KEY}`. `gemini-client.ts` confirms no client key.
- **Auth + entitlement fail-closed.** Upgrade path verifies the Appwrite JWT, then `hasPremiumAccess(userId)` → `402 Payment Required` for non-premium, denying on any read error. This is the right shape for the most expensive feature.
- **Failure handling is mature.** `LiveCallView.tsx` has `triggerReconnect` (max 4) on unexpected close/GoAway, session-resumption handles, a 12s thinking-stall watchdog (`_armThinking`), and an idle auto-end (`IDLE_PROMPT_MS`/`IDLE_END_MS`) driven by the playback signal (not the flaky status flag). `live-client.ts` schedules audio on a persistent playhead (gap-free), and `disconnect()` stops mic tracks and closes both AudioContexts. VAD self-interrupt prevention (`vad.ts`, gate during AI playback) is thoughtful.
- **Cost exposure gaps:** `analyze` (120/min) and `tts` + `tts/pronunciation` (120/min) are auth-gated but **not premium-gated** — an authenticated free user can drive Edge TTS + a Gemini analyze model at high rate. The rate limiter is in-memory per-instance (`auth-guard.ts`), so it's a single-instance safety net, not a real control under scale. The Live path itself has no hard per-session/day minute cap (relies on premium gating + idle auto-end).
- **Divergence hazard:** `server.ts` (prod) and `ws-server.ts` (dev) are near-duplicate ~400-line proxies that **enforce different limits** — WS rate 120 vs 600/min, and different base64 validators (lenient base64url+no-padding vs strict `length%4===0`). Prod and dev behave differently on the cost-critical path.

### 3.3 Security & Safety

**Good (verified):** every `/api/*` route calls `verifyAuth` (Appwrite JWT via `account.get()`); subscriptions/usage/webhook collections are server-only and read via the admin client scoped by a verified `userId` (no cross-user leak — `getSubscription`); production CSP + `X-Frame-Options: DENY` + HSTS + `nosniff` + sane `Permissions-Policy` (`microphone=(self)`); secrets gitignored (`.env`, `.env.local`, `*.env`); `server-only` import guard on `appwrite-server.ts`; the lone HTML sink is DOMPurified; OAuth uses `state` nonce + httpOnly nonce cookie + `sanitizeRedirectPath` (open-redirect guarded).

**Findings:**
- **HIGH** — OAuth email-linking without `email_verified` (Blocker 1).
- **MEDIUM–HIGH** — JS-readable `appwrite-jwt` cookie + `unsafe-inline` script CSP (Blocker 5).
- **MEDIUM** — fail-open webhook idempotency + free-usage counter (Blockers 2, 4).
- **MEDIUM** — `validateOrigin()` exists in `auth-guard.ts` but I did not find it called on the AI/TTS routes I read (`chat`, `stream`, `audio-chat`, `analyze`, `tts`); CSRF/origin checks appear inconsistent across routes (billing routes do check, per the payments investigation).
- **LOW** — the Google `?debug=1` branch in `auth/google/route.ts` echoes the client_id and forwarded host headers. No secrets, but it's diagnostic surface that should be removed before launch (the comment says so).
- **Input validation:** zod is used consistently on AI/billing routes (`chatRequestSchema`, `analyzeSchema`, `ttsSchema`, etc.) with length caps — this is a genuine strength.

### 3.4 Payments & Billing — would I charge money today?

**Architecture is genuinely good (verified):** one `PaymentProvider` interface (`src/lib/payments/provider.ts`), enablement derived solely from the registry (`registry.ts`), a single race-safe writer `syncToAppwrite` (`sync.ts`) that is monotonic on `updatedAt` with verify-and-retry-once, namespaced idempotency (`${provider}:${rawId}`), a double-charge guard in `billing/checkout/route.ts` (`already_subscribed`/`payment_past_due` 409s + `adoptExistingSubscription` reconcile-on-checkout), and a dead-letter queue. Both Stripe and Dodo providers are fully implemented (no stub methods). The old `/api/stripe/*` routes are **thin shims** that forward into `/api/billing/*` — not dead, not conflicting.

**Entitlement is enforced server-side (verified):** `gemini/chat`, `gemini/stream`, `gemini/audio-chat` each read `getSubscription(userId)` and gate on `status==='active'||'trialing'`; voice is hard-403 for non-subscribers. The client paywall (`free-tier.ts`, `use-subscription.ts`) is localStorage UI only and *can* be bypassed client-side, but doing so does **not** grant AI access because the server gates the actual calls. Correct design.

**What the tests actually prove — I ran them: 372 pass / 2 fail.**
- **Real and proven:** `no-lost-payment`, `idempotent-sync`, `monotonic-state` drive the *real* `syncToAppwrite` against in-memory deps (no module mocking) — these genuinely prove ordering/idempotency/convergence and exactly-one-record. `no-double-charge` drives the *real* `billing/checkout` handler. `webhook-id-isolation` and `subscription-mapper` exercise real functions. The 2 failures are the stale `preservation`/`bug-condition` pedagogy tests, not billing.
- **Stubbed / NOT proven:** `signature-gate` uses a *fake* `verifyWebhook` — real Stripe `constructEvent` and Dodo `standardwebhooks.verify` crypto is **never exercised**. `stripe-provider`/`dodo-provider` tests mock the SDK and `syncToAppwrite`. `checkout-e2e.integration` mocks the provider, guards, auth, and `getSubscription`. **Nothing tests a real signature → DB → entitlement path.**

**Other money-correctness notes:** Dodo provider uses `any` pervasively (type safety effectively off on that path). Free-counter accounting is inconsistent — `gemini/chat` increments only `type==='message'`, while `gemini/stream` increments on *every* call. No reconcile cron is wired in-tree (inferred manual/admin); a dead-letter double-failure (`logDeadLetterEvent` is best-effort `.catch(()=>{})`) loses the event.

**Verdict:** I would **not** charge real customers today without fixing Blockers 2–4 and adding at least one real signature-verification + idempotency integration test. The design is trustworthy; the unproven, fail-open edges are exactly the money-critical ones.

### 3.5 Pages, UI/UX & Flow (verified)

Everything is real and wired — `page.tsx` landing branches on auth to `ConversationPage` (2,469 lines) or `LandingPage`; `WelcomeModal.tsx` (1,058 lines) runs a real multi-step onboarding with a live 5-turn placement chat; `HomeShell` tabs Talk/Learn/History/Profile (settings live inside `ProfileScreen` — no deep-linkable `/settings`). Legal pages (privacy/terms/refund/cookies/data-deletion/contact) are substantive prose, not stubs. i18n: 32 locale files, identical structure (~71 keys), genuinely translated (sampled es/ar/hi/zh/sw/he = fully translated) with `request.ts` cookie-driven + English key fallback; the small surface is by design (UI chrome only — conversation is AI-generated). PWA is real (manifest + Workbox SW + offline fallback + install prompt). `demo/*.html` are mockups outside `public/`, not served.

**Funnel risks:** (1) onboarding placement depends on a **live Gemini call** — if the AI is down, a brand-new user's first experience is an error state. (2) `FREE_TIER.LIFETIME_MESSAGES = 50` but landing/marketing copy says "6 messages a day" — the daily-vs-lifetime framing is inconsistent and will confuse users and support. (3) partial saved prefs silently force full re-onboarding.

### 3.6 Architecture, Code Health & Redundancy

- **Duplicated WS proxy:** `server.ts` ⟷ `ws-server.ts` (~400 lines each, divergent limits) — extract the shared proxy into one module.
- **Two memory systems:** legacy `learner-memory.ts` (freeform `memoryLifeline`) coexists with `structured-memory.ts` (v2). `buildMemoryBlock` reads structured-first, freeform-fallback — fine during migration, but it's two sources of truth.
- **Two free-usage counters:** client `free-tier.ts` (localStorage) and server `incrementFreeUsage` (Appwrite) are unsynchronized; only the server one gates.
- **Leftover `*.replaybak` files** beside `provider.ts`/`stripe-provider.ts`/`dodo-provider.ts`/`webhook-handler.ts` (reported by the payments investigation) — dead cruft.
- **Stale tests:** `preservation.test.ts`, `bug-condition-exploration.test.ts` fail against the current `MASTER_PROMPT`.
- **Deploy:** `start` = `NODE_ENV=production tsx server.ts` — one process serves Next HTTP **and** the Live WebSocket. Simple, but a single point of failure and it runs TypeScript via `tsx` in production rather than a compiled build (`next build` output isn't used by the custom server start). `scripts/reset-dev-data.ts` (`db:reset-dev`) is destructive — confirm it's environment-guarded before it can ever touch a prod DB (I did not verify its guard).

---

## 4. Promise vs. Reality Gap Table

> **Status (post-implementation):** several gaps below were closed in Phase 3 — within-session vocabulary recycling (now the live coach + real `keyWords`) is **Delivered**; surfaced progress metrics (recap + profile chips) is **Delivered**; "teach in the moment" gained correction **re-elicitation**; the "6 messages a day" copy is **fixed** (now 50 lifetime); "no double charge / idempotent / no lost payment" is now backed by a **real signature→DB→entitlement test** and fail-closed paths. Still genuinely **Partial**: spaced repetition (#7, no real SRS) and modes-as-pedagogy (#6, deliberately not pursued). The table rows below are the original snapshot.

| Marketing / doc claim | What the code actually does | Verdict |
|---|---|---|
| "The only app where you actually speak" | Real full-duplex Gemini Live voice, premium-gated, with reconnection/resume (`live-client.ts`, `server.ts`) | **Delivered** |
| "AI that is both your conversation partner *and* your teacher" | Partner: yes. Teacher: LLM-improvised via a soul prompt that forbids drilling/lecturing; deterministic teaching machinery is cross-session only | **Partial** |
| "They correct your mistakes… teach in the moment" | `corrections[]` parsed + anti-hallucination filtered (`parser.ts`); natural recast; **no enforced reinforcement** of the corrected form | **Partial** |
| "Remember you session after session… your weak spots are remembered" | `structured-memory.ts` tracks vocab/errors/sessions; `buildPlannerInjection` targets weak spots at next session start | **Delivered** |
| Within-session vocabulary recycling (`docs/audit.md` #1) | Production tallied only at session end; no live "circle back" | **Missing** |
| Spaced repetition (#7) | Recency/frequency heuristic in `computePlannerTargets`; not a real SRS | **Partial** |
| Speaking/progress metrics so users *feel* progress (#5) | Data captured in memory but **not surfaced** to the user | **Missing** |
| 4 modes = different learning experiences (#6) | Chat/Handsfree share HTTP; Native/Live share the WebSocket — I/O plumbing, not pedagogy (newer free/practice toggle is a start) | **Partial** |
| "23 languages, 6 tutors" | 32 languages defined; 6 personas; curriculum is language-agnostic (shared seeds) | **Delivered** (understated) |
| "$10/month… unlimited" + "6 messages a day" free | Free tier is **50 lifetime** messages (`FREE_TIER.LIFETIME_MESSAGES`), not daily | **Faked/inconsistent copy** |
| Dual provider (Stripe + Dodo) production-ready | Both fully implemented behind a clean interface; Dodo path is `any`-typed | **Delivered** (with caveat) |
| "No double charge / idempotent / no lost payment" (tests) | Invariants unit-proven (tests pass); but idempotency + usage **fail open**, transition events use wrong timestamp, signature verification untested | **Partial** |

---

## 5. Redundancy & Cleanup List

> **Status (post-implementation):**
> - ✅ **Done:** WS proxy merged (`src/server/live-proxy.ts`); stale tests refreshed; `?debug=1` removed; stale `apps/web` doc paths fixed + `payment_integ.md` rewritten; `reset-dev-data.ts` now requires `--confirm-project=<id>`; the memory **field-collision** removed (structured engine is the sole remote writer). No `.replaybak` files exist.
> - ⚠️ **Partial:** `learner-memory.ts` is now **local-only** (the remote collision that motivated retiring it is gone) but the module is **not deleted** yet.
> - ⚠️ **Still open (minor, non-blocking):** (a) the in-memory **rate limiter** is per-instance — fine on the single-process deploy, needs Redis only if you scale horizontally; (b) the two free-usage counters (client localStorage vs server) remain unsynchronized and `gemini/chat` (counts only `type==='message'`) vs `gemini/stream` (counts every call) still differ — harmless because the **server counter is authoritative and gates**, but worth unifying eventually.

- **Merge** `server.ts` + `ws-server.ts` shared proxy logic into one module; reconcile the divergent rate limits (120 vs 600) and base64 validators.
- **Delete** the `*.replaybak` files next to `src/lib/payments/{provider,stripe-provider,dodo-provider,webhook-handler}.ts`.
- **Retire** legacy `src/lib/storage/learner-memory.ts` once `structured-memory.ts` migration is complete (single source of truth).
- **Reconcile** the two free-usage counters (`src/lib/subscription/free-tier.ts` client vs `incrementFreeUsage` server) and the chat-vs-stream increment inconsistency.
- **Update or delete** stale tests `src/__tests__/preservation.test.ts` and `bug-condition-exploration.test.ts` (they assert old `MASTER_PROMPT` copy).
- **Remove** the `?debug=1` diagnostic branch in `src/app/api/auth/google/route.ts`.
- **Fix** stale doc paths in `docs/payment_integ.md` (`apps/web` → `apps/talkingo.ai`).
- **Verify** `scripts/reset-dev-data.ts` has a hard prod guard.

---

## 6. Prioritized Action Plan

**Tier 0 — Must fix before charging money / public launch — ✅ DONE (Phase 1, shipped)**

_Verified: full test suite 377 pass / 2 fail (the 2 are the stale-prompt `preservation` + `bug-condition-exploration` tests in Tier 3, item 13) and `next build` exits 0._

1. ✅ **DONE** — OAuth account-takeover guard. Google callback now requires `email_verified === true` before any email lookup (rejects with `?error=email_unverified`). Facebook callback links to an existing account ONLY when it is already bound to THIS Facebook identity (`prefs.facebookId`); an email belonging to a different identity is refused (`?error=account_exists`) instead of silently handing over a session — `src/app/api/auth/{google,facebook}/callback/route.ts`.
2. ✅ **DONE** — `claimWebhookEvent` now fails CLOSED on a missing collection (throws → webhook 503 → provider retries) instead of degrading open. Added `assertRequiredCollections()` and a boot-time check in `server.ts` that loudly flags missing `subscriptions` / `stripe_webhook_events` / `free_tier_usage` collections — `src/lib/appwrite-server.ts`, `server.ts`.
3. ✅ **DONE** — Added `eventTime` to `NormalizedEvent`; Stripe stamps `event.created`, Dodo stamps the signed `webhook-timestamp`. `applyStatusTransition` (and subscription writes) now use provider event time, not `Date.now()`, so a delayed/out-of-order delivery can no longer clobber fresher state — `webhook-handler.ts`, `provider.ts`, `stripe-provider.ts`, `dodo-provider.ts`.
4. ✅ **DONE (fail-closed)** — Removed the in-memory free-usage fallback that reset the lifetime cap. `incrementFreeUsage`/`getFreeUsage` now throw `FreeUsageStoreError` on store failure, and `gemini/chat` + `gemini/stream` deny (503 `usage_unavailable`) rather than grant free AI on an unverifiable counter — `src/lib/appwrite-server.ts`, `gemini/{chat,stream}/route.ts`. _Note: the money-critical fail-open (the lifetime **counter**) is now closed. The in-memory per-instance **rate limiter** was **not** moved to a distributed store — this is **still open**, but acceptable on the current single-process `tsx server.ts` deploy (one instance = one shared map). It only becomes necessary if you scale horizontally (then use Redis/Upstash for both the limiter and the counter)._
5. ✅ **DONE** — New `src/__tests__/webhook-signature-integration.test.ts` drives REAL crypto end to end: Stripe `generateTestHeaderString`/`constructEvent` and Dodo `standardwebhooks` `sign`/`verify` → `handleWebhook` → the real `syncToAppwrite` (in-memory store) → entitlement assertion. Covers valid-sig→entitled, tampered-body→400+no-state-change, and duplicate→idempotent no-op.

**Tier 1 — Security & cost hardening — ✅ DONE (Phase 2, shipped)**

_Verified: `next build` exits 0 (Middleware registered); full suite 380 pass / 2 fail (the 2 are the Tier 3 stale-prompt tests); and a production-server smoke test confirmed the CSP at runtime — `/` and `/login` return 200, every Next/`next-script` tag carries the per-request nonce, the response-header nonce matches the script-tag nonce, `script-src` no longer contains `unsafe-inline`, and zero scripts are left un-nonced._

6. ✅ **DONE** — Replaced static `script-src 'self' 'unsafe-inline'` with a per-request **nonce + `'strict-dynamic'`** CSP emitted from new `src/middleware.ts` (production-only, so dev HMR is untouched); removed the CSP from `next.config.ts` (other security headers stay). Next auto-stamps the nonce onto its bootstrap scripts and the `next/script` Clarity tag, and `'strict-dynamic'` lets those trusted scripts load chunks + third-party loaders by propagation. This is the real mitigation for the JS-readable session token (XSS that would steal it is now blocked). _The optional WS-only short-lived ticket (vs exposing the session JWT to JS) is left as a future enhancement — the nonce CSP closes the actual exploit path, and changing the token model risked breaking OAuth session continuity, so it was deliberately not rushed._
7. ✅ **DONE** — Cost surface gated. `analyze` (paid Gemini, only ever called during premium live calls) is now **premium-gated** (402, fail-closed). The forced-Gemini TTS path (premium voice previews) is premium-gated; **free Edge TTS stays open to everyone** so the free experience is unaffected. `validateOrigin` (the same allowlist proven on the billing routes) now guards `analyze`, `tts`, `tts/pronunciation`, `gemini/chat`, and `gemini/stream` (CSRF / direct-abuse defense) — `src/app/api/**`.
8. ✅ **DONE** — Removed the `?debug=1` diagnostic branch from `auth/google/route.ts`. Hardened `scripts/reset-dev-data.ts`: a destructive `--yes` run now also requires `--confirm-project=<PROJECT_ID>` matching the resolved project id, making an accidental production wipe effectively impossible (dry-run remains the default). _No `.replaybak` files exist in the tree — already clean._

**Tier 2 — Close the learning-promise gap (highest product ROI) — ✅ DONE (Phase 3, shipped)**

_Verified: `next build` exits 0; full suite 392 pass / 2 fail (the 2 are the Tier 3 stale-prompt tests); 9 new `session-coach` unit tests pass; the whole loop adds **$0 AI cost** (deterministic client-side bookkeeping)._

9. ✅ **DONE (dynamic, better than prompt-only)** — Instead of a static "productive pressure" line, a live **Session Coach** (`src/lib/learning/session-coach.ts`) injects a *targeted, transient* `_coachNudge` only when warranted, rendered by a new `buildCoachBlock` in `prompts.ts`. It tells the AI to weave in one unused target word or model a just-corrected form — never to drill/quiz/announce.
10. ✅ **DONE** — Within-session "heard it → said it" loop. The coach tracks, per turn, which session target words the learner actually produced and which corrected forms are "owed a re-elicitation," then gently nudges the AI to create a natural opening — with **UX guardrails**: a 2-turn warm-up, a 3-turn cooldown, one nudge at a time, one-shot per word, and **nudges fully suppressed while the learner is struggling** (high error rate → comfort wins). Wired into the text-chat path in `ConversationPage.tsx`; voice modes are unaffected.
11. ✅ **DONE** — Felt progress is now surfaced. The recap shows new words *used*, self-corrections, words introduced, and a sentence-length trend (`getLatestSessionProgress` + two cheap new `SessionSummary` fields `avgUserWords`/`vocabProduced`). **Recap-on-return fixed**: a session the user closed before finishing now persists a History report AND shows a gentle "Welcome back — here's where we left off" recap exactly once on return (previously it was folded into memory silently with no recap) — `SessionRecapDialog.tsx`, `ConversationPage.tsx` recovery path.
    - **Memory robustness (Pillar 3):** cross-device merge is now **recency-based** (freshest session wins, not just the larger row count) with a safe user-note merge — `loadAndMergeStructuredMemory`. The vocab matcher was consolidated into one shared, tested `word-match.ts` used by both the memory reducer and the coach.
    - **Deliberately respected existing decisions:** no new "modes" (the Practice/Free-Talk injection split already is the right two-level dial); auto level-up was left as the team's manual Learn-page flow; a real SRS engine is deferred (depth, not the gap).
12. ✅ **DONE** — Aligned the free-tier copy with what's actually enforced (50 lifetime messages, not "6 a day"): pricing cards + pricing subhead in `src/app/page.tsx` and the legal plan description in `src/app/refund/page.tsx`. The in-app surfaces (usage badge, profile, upgrade prompt) already used the correct 50-message framing. No remaining user-facing "6/day" copy.

**Tier 3 — Maintainability — ✅ MOSTLY DONE**

_Verified: `next build` exits 0; full suite now **396 pass / 0 fail** (the 2 long-standing stale-prompt failures are fixed); both the prod (`server.ts`) and dev (`ws-server.ts`) servers were runtime-smoke-tested (boot OK, health 200, live upgrade → 401 unauth / 402 non-premium, wrong path → 404)._

13. Status by part:
    - ✅ **WS server de-duplication** — the ~350-line live-voice proxy is now a single shared module (`src/server/live-proxy.ts`); `server.ts` and `ws-server.ts` are thin transports that both import it. The old divergence is resolved by taking the **safer behavior of each**: rate limit unified to 600/min (the old prod 120 would throttle a real audio call) + prod's memory-safety cap/sweep; lenient base64 validation; `validateSetupMessage` kept; generic Gemini-error message (no upstream leak).
    - ✅ **Stale tests refreshed** — `preservation.test.ts` and `bug-condition-exploration.test.ts` now assert the *current* MASTER_PROMPT wording ("Never drill", "Correct by example", "Just talk"); suite is fully green.
    - ✅ **Docs cleaned** — fixed stale `apps/web/…` path references in code comments (`stripe/env.ts`, `setup-appwrite-schema.ts`, `backfill-subscription-canonical.ts`); replaced the long, broken-link `docs/payment_integ.md` changelog with a short accurate overview; deleted redundant `docs/standout.md` (duplicated `core_idea.md`) and the stale `docs/ai_experience_fixes.md` tracker.
    - ✅ **Memory system — robustness + learning rebuild (deep pass).** A full review found two real problems beyond cleanup, now fixed:
      - **Data-loss field collision (robustness):** the legacy paragraph writer and the structured-memory JSON both wrote the same Appwrite field (`user_preferences.memoryLifeline`) and raced — a paragraph write could clobber the structured blob, and the legacy migration stamped `Date.now()` so the recency merge then preferred the near-empty stub and overwrote good local data on the next load. Fixed by making the **structured engine the sole remote writer** (the paragraph now rides along as the session highlight — `captureMemoryUpdate`/`endSession` no longer sync it), stamping migration stubs at the epoch, and computing merge recency from **real** sessions only. No more cross-device memory loss.
      - **Vocabulary tracked the wrong data (learning value):** the vocab tracker keyed off `seed.targetVocab`, which are English concept tags ("greetings", "travel-plans"), not target-language words — so "produced" never matched and every tag stayed perpetually "dormant" (noise injected into the prompt). Fixed by having the AI return real `keyWords` (target-language words it used, optional/additive field in the response contract + parser), tracking those as the introduced vocabulary, feeding them to the live Session Coach (`addCoachTargets`), and **purging the legacy concept tags on load**. Production tracking, the recap's "words used", and the planner now run on real words.
      - **Premium UX:** the profile now shows the actual **"words you're working on"** (mastered vs still-practicing chips) — surfacing the real engine, which was previously invisible. _Verified: build 0, suite 400 pass / 0 fail (+4 new coach/parser tests)._
    - ✅ **`learner-memory.ts` no longer collides** — it's reduced to a local-only paragraph (profile display + session-highlight source); the remote collision that motivated retiring it is gone. Full module removal can still happen later but is no longer urgent.

The honest one-line summary: **the plumbing is better than the teaching.** You've over-invested in a genuinely strong realtime/payments/UX substrate and under-invested in the one thing your own positioning says is the whole point — an engine that provably makes someone speak *better*, not just speak. Tier 0 makes it safe to charge; Tier 2 makes the core promise true.