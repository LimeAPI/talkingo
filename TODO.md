# TODO — Learning Page “Scenario Path” UI (Option C: Phase-based journey)

## Information gathered
- `src/components/layout/LearnScreen.tsx` currently renders:
  - Search input
  - Level filter pills (L1–L12)
  - Grammar filter chips
  - Expand/collapse accordion per level
  - Scenario rows with done indicator (based on `getCompletedLessons()`)
- Curriculum/levels exist in `src/shared/levels/index.ts` (`TALKINGO_LEVELS`).
- Curriculum scenarios are loaded via `fetchScenariosWithCache()` and grouped by `difficulty` (treated as level number).
- Current UI already knows:
  - completed per level: `completedLessons.includes(s.id)`
  - total per level: number of scenarios in that level

## Plan (code-level)
1. Refactor `src/components/layout/LearnScreen.tsx` scenario/level rendering into **phase groups**:
   - Foundation: L1–L3
   - Building: L4–L6
   - Fluency: L7–L9
   - Mastery: L10–L12
2. In each phase section:
   - Show phase header + optional progress summary.
   - Show a **compact level “stepper row”** (still expandable/clickable) to reduce scrolling.
   - Keep existing filters (search/level/grammar) working (they will affect which levels/scenarios appear inside phases).
3. Upgrade the scenario UI inside each expanded level:
   - Add a small “path” indicator per scenario (step index within level)
   - Ensure done state remains consistent
4. Remove/disable the old top-level “Level sections” layout so the new phase layout is the primary UX.

## Dependent files to edit
- `src/components/layout/LearnScreen.tsx`

## Followup steps
- Run typecheck/lint (if available) and quick dev build.
- Smoke test: filters + auto-expand first incomplete level should still work, but now within phase layout.

## Progress tracking
- [ ] Implement phase-based section grouping UI in `LearnScreen.tsx`
- [ ] Upgrade level header/stepper and scenario step indicators
- [ ] Validate filtering behavior + auto-expand first incomplete level
- [ ] Run `npm test`/`npm run build` (whichever exists) and fix TS/ESLint issues

