
Here's the gist:

## What Exists Now

**300 seeds across 12 levels**, each level a fully independent unit with 25 scenarios. The LearnScreen shows collapsible level cards (`surface-card`) — you pick a level in the filter, see its 25 scenarios, track progress per level (X/25), and the grammar filter cross-cuts all levels to find scenarios by grammar topic.

The old module system is dead — no more "Lvl 3-5" lumps mixing unrelated levels together.

## The Philosophy

**Level independence is a teaching principle, not just UI polish.** In language acquisition, a learner at L3 is fundamentally different from a learner at L5 — different grammar reach, different vocabulary range, different AI behavior from the prompt system. Mixing them in a "module" meant a user thought they were working at L3, but the module exposed L7 seeds. That undermines trust in the progression system.

**The curriculum is spiral, not modular.** Each topic (e.g., "food", "travel") reappears at higher levels with greater complexity. The spiral group connects them across levels. The module system was a legacy grouping that added noise—the spiral is the *real* structure that ties levels together.

**Grammar is a cross-cutting filter, not a module property.** Instead of saying "Module X teaches past tense", every seed has explicit grammar tags. You filter by grammar across *all* levels and see the spiral progression of that grammar topic visually.

**The level selector in WelcomeModal is honest** — all 12 levels are presented equally, no ranges, no ambiguity. The user picks L4 and gets L4 content, period.