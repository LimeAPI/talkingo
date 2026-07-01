# AI Cost & Rate Reference

> Per-mode Gemini cost model for Talkingo. Use this to size usage caps and plan
> pricing. **The code is the source of truth for which model each mode uses; the
> dollar rates are external and change — re-verify against your own Google
> billing before making pricing decisions.**
>
> Last reviewed: **July 2026**

---

## 1. What each mode calls

Traced from the codebase (all paths under `src/`):

| Mode | Route / file | Model (env-overridable) | Billed usage |
|---|---|---|---|
| **Live call** | `server/live-proxy.ts` | `GEMINI_LIVE_MODEL` → `gemini-3.1-flash-live-preview` | streamed **audio in + audio out**, continuous |
| ↳ per-turn correction | `app/api/gemini/analyze/route.ts` | `gemini-2.5-flash-lite` (→ `2.5-flash` fallback) | text in/out, once per user turn *during the live call* |
| **Handsfree / voice note** | `app/api/gemini/audio-chat/route.ts` | `gemini-2.5-flash` | audio in, text out |
| ↳ spoken reply | `app/api/gemini/tts/route.ts` | `gemini-3.1-flash-tts` (→ `2.5-flash-preview-tts`) | **audio out** (expensive) |
| **Text chat** | `app/api/gemini/chat/route.ts` + `stream/route.ts` | `gemini-2.5-flash` (→ `3.1-flash-lite` → `2.5-flash-lite`) | text in/out |
| Translate helper | `app/api/gemini/translate/route.ts` | `gemini-2.5-flash-lite` | text in/out (tiny) |

---

## 2. Rate inputs (per 1M tokens, 2026)

| Model | Text in | Text out | Audio in | Audio out |
|---|---|---|---|---|
| `gemini-3.1-flash-live-preview` | $0.75 | $4.50 | ~$1.50 *(est.)* | ~$9.00 *(est.)* |
| `gemini-2.5-flash` | $0.30 | $2.50 | ~$1.00 | — |
| `gemini-2.5-flash-lite` | $0.10 | $0.40 | — | — |
| `gemini-3.1-flash-tts` | — | — | — | ~$20.00 |

**Confirmed** (published): all text rates, TTS audio-output rate.
**Estimated** (Google only partially publishes Live audio rates): the Live model's
audio in/out. Audio-in is estimated at ~2× text-in following the Gemini 3 Flash
pattern; audio-out is a rough ~$9 and should be treated as **±50%**.

Sources:
- [Gemini 3.1 Flash Live pricing (langcopilot)](https://langcopilot.com/llm-pricing/google/gemini-3.1-flash-live-preview)
- [Gemini 3.1 Flash Live specs (cloudprice)](https://cloudprice.net/models/google-gemini-3-1-flash-live-preview)
- [Google Agent Platform pricing (audio vs text ratio)](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
- [Google Text-to-Speech pricing ($20/1M audio out)](https://cloud.google.com/text-to-speech/pricing)

*Rates were rephrased/summarized for licensing compliance.*

### Key conversion
Audio is tokenized at **~32 tokens/second = 1,920 tokens/minute**. This is the
single biggest lever in every audio calculation below — if Google's real rate
differs, all audio costs scale linearly.

---

## 3. Per-mode cost

### Live call — **~$0.012 / minute** (range $0.008–0.025)

Assumes a minute of call ≈ half user audio + half AI audio, plus context overhead:

| Component | Estimate |
|---|---|
| audio in (~1,000 tok/min × $1.50) | $0.0015 |
| audio out (~1,000 tok/min × $9.00) | $0.0090 |
| text / system-prompt context overhead | ~$0.0005 |
| per-turn `analyze` (flash-lite, ~2/min) | ~$0.0005 (negligible) |
| **Total** | **~$0.011–0.012 / min** |

### Handsfree voice note — **~$0.012 / exchange**

| Component | Estimate |
|---|---|
| audio-chat turn (`gemini-2.5-flash`, audio in + text out) | ~$0.002 |
| TTS spoken reply (~15s = ~480 audio tokens × $20/1M) | **~$0.0096** ← dominates |
| **Total per turn** | **~$0.012** |

A 10-min handsfree session at ~2 turns/min ≈ **$0.24**. Self-throttling because
it's turn-based, not continuous.

### Text chat — **~$0.0018 / message** (effectively free)

`gemini-2.5-flash`, ~3,500 input tokens (history + system) + ~300 output tokens.
The **50-message free tier costs ~$0.09 total** over an account's lifetime.

### Translate — **~$0.0001 / call.** Ignore.

---

## 4. Implications for usage caps

1. **Live voice is ~7–10× more expensive per minute than any turn-based mode, and
   it is the only *unbounded* one.** Any usage cap belongs here first.
2. **TTS is a sleeper cost** — a spoken reply costs more than the chat turn that
   produced it, because of the $20/1M audio-output rate. Watch it if handsfree
   usage grows (shorter replies / cheaper voice = direct savings).
3. **Text is nearly free** — keep it uncapped to protect the "unlimited
   conversations" brand promise.

### Daily live-voice cap sizing

| Daily cap | Cost/day (@ $0.012/min) | Cost/month if maxed daily |
|---|---|---|
| 20 min | $0.24 | ~$7.20 |
| **30 min** (proposed) | **$0.36** | **~$10.80** |
| 45 min | $0.54 | ~$16.20 |
| 60 min | $0.72 | ~$21.60 |

Worst-case (pessimistic $0.025/min): 30 min/day ≈ **$22/month/user**.

> **Takeaway:** a user who maxes 30 min/day every day costs ~$11/mo (up to ~$22 at
> the pessimistic audio rate) in live voice alone — enough to eat the margin on a
> typical $10–15 plan. The daily cap converts an unbounded liability into a known
> per-user ceiling; almost no genuine learner hits it daily.

### Committed decision (July 2026)

Live voice is capped **per plan**, metered server-side per user-day. Text stays
truly unlimited.

| Tier | Daily live-voice cap | Worst-case cost/day | Worst-case cost/month |
|---|---|---|---|
| `active` (monthly/yearly, $30/mo) | **20 min** | ~$0.24 | ~$7.20 (up to ~$14 pessimistic) |
| `trial` | **10 min** | ~$0.12 | trial-length only |

At the actual **$30/mo** price the cap leaves healthy margin even when maxed — so
its real jobs are (a) tail-risk / abuse protection and (b) protecting margin on
cheaper plans we may add later. Trial gets a tighter leash because a trial user
is pure cost until they convert.

### How it's implemented

- **Source of truth:** the live WebSocket proxy (`server/live-proxy.ts`). The
  client paywall/UI is advisory only.
- **Counter:** `live_usage_daily` collection, doc id `${userId}_${localDate}`,
  server-only, **fails open** (a store blip never blocks a paying user — opposite
  of the free-tier counter which fails closed).
- **Caps resolved per plan:** `src/lib/subscription/live-limits.ts` — add a row
  to extend for new plans; nothing else changes.
- **Shadow mode first:** metering + logging always run; enforcement (connect
  gate + wind-down + disconnect) is behind `LIVE_CAP_ENFORCE` (default `false`).
  Ship in shadow mode, review real usage for a week or two, then flip.
- **Metering:** wall-clock from session-ready, flushed every 15s (crash-safe;
  blocks "kill the tab at 19:59" evasion). An idle auto-disconnect
  (`LIVE_IDLE_TIMEOUT_SECONDS`, 60s of no audio) stops idle time from burning a
  user's minutes and bounds the wall-clock estimate.
- **One active session per user (newest wins):** closes the concurrent-tabs/
  devices cost-multiplication hole while staying safe for reconnects.
- **Timezone:** resets at the user's local midnight (client sends `localDate`;
  server validates). Gaming only shifts the window, can't remove the cap.
- **Graceful UX:** at 2 min before the cap (`LIVE_WINDDOWN_SECONDS`) the tutor is
  nudged to wrap up warmly in-conversation (best-effort decoration); the hard-cap
  disconnect fires independently. On cutoff, route to unlimited text.
- **Pre-check:** `GET /api/gemini/live-quota` returns remaining minutes + tier +
  whether enforcement is active, so the UI can soft-disable the call button
  before connecting.

### Rollout checklist

1. `npm run db:setup` to provision `live_usage_daily`.
2. Deploy with `LIVE_CAP_ENFORCE=false` (shadow mode).
3. Watch `[live-proxy] SHADOW ...` logs / the counter for real daily-minute
   distribution.
4. Confirm 20 min (and 10 for trial) against that data; adjust in
   `live-limits.ts` if needed.
5. Build the client "done for today" screen for `usage_limit` / `usage_warning`.
6. Set `LIVE_CAP_ENFORCE=true` and add the honest plan line: *"Unlimited text ·
   up to 20 min of live voice/day."*

---

## 5. How to re-derive with real numbers

Once you can see actual Live audio rates on your Google billing:

```
live_cost_per_min =
    (audio_in_tokens_per_min  / 1_000_000 * audio_in_rate)
  + (audio_out_tokens_per_min / 1_000_000 * audio_out_rate)
  + context_overhead_per_min

# audio tokens/min ≈ 1920 × (fraction of the minute that direction is streaming)
```

Then: `monthly_worst_case = live_cost_per_min × daily_cap_minutes × 30`, and set
the cap so `monthly_worst_case` stays comfortably under your per-user plan margin.
