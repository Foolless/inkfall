# INKFALL

A NES-difficulty 2D platformer about a squid descending from a sunlit tide pool to the abyss.

**Status:** design phase — documentation only, no code yet. Start with the PRD.

📄 **[docs/PRD.md](docs/PRD.md)** — what the game is
🛠️ **[docs/PLAN.md](docs/PLAN.md)** — how it gets built: four phases, checkpoints, testing, hosting

## The short version

You play Nib, a squid whose signature move is an **eight-directional ink jet dash** costing
one of three pips from a slowly-refilling ink meter. Every jump puzzle and every boss is a
question about where you spend those pips.

- **Five hand-authored levels**, one boss each — Tide Pools, Kelp Forest, Sunken Ship,
  Volcanic Vents, and the Abyss. Roughly 25 minutes for a clean run.
- **Three tiers, Mario-style.** A hit blows Nib's ink out and shrinks him from Full (3 pips)
  to Spent (2 pips, but fits through 1-tile gaps); another kills. A rare **Ink Core** promotes
  him to Charged, where the dash itself kills what it passes through. The ink meter *is* the
  health bar.
- Sparse checkpoints, 3 lives, 3 continues. The difficulty lives in the distance between
  conches, not in the hit count.
- 15 hidden pearls, per-level speedrun timers with ghosts, arcade scoring, and five permanent
  ink upgrades that open routes back through earlier worlds.
- **Everything authored in code**: pixel sprites as TypeScript arrays, chiptune synthesised at
  runtime through a Web Audio APU emulation. No image files, no audio files, no runtime
  dependencies.

## Intended stack

TypeScript (strict) · Vite · Canvas 2D · Web Audio · Vitest. Zero runtime dependencies.
Ships as a static bundle under 1.5 MB, locked to 60 fps on a fixed timestep.

## Scope

**v1 is five levels.** The long-term target is around fifty, and PRD §12.7 lists the
constraints v1 must respect — stable string level ids, no per-level code, chapter-owned
tilesets, a data-driven world map — so that growing the game later is content work rather
than a rewrite. None of that scaffolding is built ahead of time; it is a set of rules about
how v1 is built.

## Building it

Nothing to build yet. [PLAN.md](docs/PLAN.md) breaks the work into four phases, each ending
with a playable build at a public URL and a gate that a machine can't pass for you:

1. **Engine & Feel** — a deployable grey box where Nib moves perfectly and nothing else
   exists. Its gate is a genuine go/no-go: if the ink dash isn't fun with no content around
   it, the project stops there rather than at Phase 4.
2. **One Real Level** — World 1 complete, proving the whole pipeline once instead of five
   times.
3. **All Five Levels** — the full descent, completable start to finish.
4. **Meta & Ship** — pearls, scoring, speedrun timers, audio, polish, accessibility.

## Contributing

Design decisions live in the PRD's decisions log (Appendix C), including the ones that were
considered and rejected. If a change contradicts something there, update the log in the same
commit — a decision that quietly reverses without a record is how a design drifts.
