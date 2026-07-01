# Talkingo — Premium Design Overhaul (implementation tracker)

Goal: elevate the whole app from "generic" to world-class, premium, intentional UX.
One design system, used everywhere. The call + chat (the differentiators) feel alive.

Status: **shipped & build-verified** (`npm run build` exits 0).
Legend: [x] done · [~] partial (with rationale) · [ ] deferred

---

## PHASE 0 — Foundation (design tokens & shared primitives)
- [x] F1. Defined `.glass-card` (was referenced by the call screen but never existed → broken glass). `globals.css`
- [x] F2. `.eyebrow` utility + `<Eyebrow>` primitive (one section-label motif). `globals.css`, `ui/Eyebrow.tsx`
- [x] F3. `.surface-inset` flat nested-row surface. `globals.css`
- [x] F4. Audio-reactive primitive `.voice-ring` (driven by `--amp`). `globals.css` (`.voice-bar` removed in cross-check — rings approach won)
- [x] F5. Choreography: `.animate-message-in`, `connect-shimmer`, `connected-pop` + reduced-motion guards. `globals.css` (`.stream-caret` removed — will return with the streaming PR)
- [x] F6. Shared React primitives: `<Stat>`, `<Eyebrow>`, `<StatusBadge>`. `ui/` (`<SegControl>` removed in cross-check — orphaned)

## PHASE 1 — Call experience (the marquee differentiator)
- [x] C1. Fixed broken glass surfaces (status pill, error card, idle prompt) via real `.glass-card`.
- [x] C2. Real playback amplitude + mic level from the audio pipeline. `live-client.ts` (`setOnAmplitude`, `setOnMicLevel`, AnalyserNode taps)
- [x] C3. Audio-reactive avatar rings + halo + revived `waveform-border-container`. `CallAvatar.tsx`
- [x] C4. Mic-level listening visualization (cool-tone ring follows your voice). `CallAvatar.tsx`
- [x] C5. Choreographed states: connecting shimmer · connected pop · thinking breathe.
- [x] C6. End-call button reskinned onto the `error` token (no stock VoIP gradient).
- Perf note: levels passed as refs + single rAF in CallAvatar → zero 60fps re-renders of the call view.

## PHASE 2 — Chat experience
- [x] CH2. Upgraded message entrance (fade + rise + subtle scale, ease-out token).
- [x] CH4. CorrectionsBlock reveal animation (`animate-message-in`).
- [x] CH5. Tool pills moved to `.pill`/`.pill--accent`/`.pill--on` → ≥32px tap targets, ≥11px text.
- [~] CH1/CH3. Token-reveal streaming + shared markdown renderer — deferred: both require refactoring the
       `ConversationPage` streaming path + the per-call-site markdown regex; higher regression risk than the
       visible-polish budget here. `.stream-caret` primitive is in place for a follow-up.

## PHASE 3 — Learn / progression
- [x] L1. Removed rainbow bar + emerald/blue/purple `LEVEL_COLORS`; all progress now gold (`primary`/`primary-glow`),
       level identity = tier depth (opacity/weight). Phase tints + correction dots mapped to `success/warning/error` tokens.
- [x] L2. Removed redundant per-level linear bar (kept the SVG ring).
- [x] L3. Filter active states now gold (via the unified LEVEL_COLORS).
- [x] L4. Level names aligned to the landing source-of-truth; "modules"→"scenarios"; dropped the 🎉; level-up banner → `surface-card--elevated` + `btn-gradient`.

## PHASE 4 — Talk/Home
- [x] T2. Capped entrance stagger (`i*0.1` → `min(i*0.05, .16)`), ease-out token; trimmed unused icon imports.
- [~] T1. Mode/Input selectors kept (they already use `layoutId` animations and carry descriptions a bare
       segmented control can't) — `SegControl` exists for future adoption; forcing it here would lose content.

## PHASE 5 — History
- [x] H1. Adopted shared `<Stat>` + `<Eyebrow>`.
- [x] H2. Added a loading skeleton; wrapped the data load in try/finally so a read error no longer drops reports silently.

## PHASE 6 — Profile
- [x] P1. Polished identity: gradient badge + gold ring + glow + one elegant rotating dashed ring (reduced-motion safe).
- [x] P2. Replaced the 13-branch flag ternary with a reusable `TARGET_FLAGS` map / `flagFor()` (covers all 32 langs).
- [x] P3. Calmed Premium copy ("neural pathways" → "Unlimited conversations & voice").
- [x] P4. Constellation stat circles made consistent (all `glow-gold`).

## PHASE 7 — Paywall & subscription
- [x] PW1. `SubscriptionManager` now uses `surface-card` (matches the surrounding Profile cards).
- [x] PW5. Fixed `bg-primary text-white` → `text-primary-foreground` (real contrast fix on the gold confirm button).
- [~] PW2/PW3/PW4. PaymentSuccessDialog already mirrors the shell visually; UpgradePrompt's terser contextual layout
       is intentional; BrandChip's white tiles are correct for brand-logo legibility. Left as-is (maintainability-only,
       not visible-quality, and changing risks logo contrast). Shell/PlanSelector/PaymentMethodPicker were already premium.

## PHASE 8 — Nav & shell
- [x] N1. Replaced magic `rgba(255,215,0,…)` gold shadows with `oklch(var(--primary)/…)` in BottomNav + DesktopTopNav.
- [~] N2/N3. Nav duplication merge + global container-width unification — deferred (refactor, no visible change).

## PHASE 9 — Landing & copy
- [x] LP1. Level names now match the app; free-tier framing already correct (50 lifetime); language count left as a round "30".

## Verification
- [x] `npm run build` → exit 0 (all routes compiled, middleware registered).
- [x] Per-file diagnostics clean on every edited file.
- [x] reduced-motion guards added for all new animations.
- Pre-existing (unrelated) TS errors remain only in `src/__tests__/*` (NODE_ENV assignment, test-only casts) — not part of the build.

## CROSS-CHECK PASS (post-implementation review)
- [x] **Bug fixed**: `animate-connected-pop` was on the disc whose inline `transform` the rAF overwrites every
      frame → the pop never rendered. Moved it to the `waveform-border-container` wrapper (untouched by rAF).
- [x] **Dead code removed**: `SegControl.tsx` (no consumer), `.voice-bar` + `.stream-caret` CSS (orphaned).
- [x] **Primitives made real**: adopted `<StatusBadge>` in History (fixes/Clean pills) and `.surface-inset` in
      the Learn level rows (they hand-rolled the same recipe).
- [x] **A11y**: `CallAvatar` rAF now early-returns under `prefers-reduced-motion` (no avatar pulse / ring churn).
- [x] **Perf**: amplitude/mic RMS loops hoist their `Uint8Array` out of the per-frame tick (no 60fps GC churn).
- [x] Re-verified: `npm run build` → "Compiled successfully", exit 0; all edited files diagnostics-clean.

## Deferred follow-ups (intentional, documented above)
- Token-reveal streaming + shared markdown renderer (ConversationPage refactor).
- Nav component de-duplication; global container-width token.
- Delete the now-superseded dead `ui/VoiceVisualizer.tsx` (concept revived in CallAvatar).
