# INKFALL

A NES-difficulty 2D platformer about a squid descending from a sunlit tide pool to the abyss.

**Status:** design phase — documentation only, no code yet. Start with the PRD.

📄 **[docs/PRD.md](docs/PRD.md)** — the full product requirements document

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

Nothing to build yet. Milestone M1 in the PRD creates the project skeleton; M2 is the
vertical slice, and it is an explicit go/no-go gate — if the ink dash isn't fun in an empty
grey box, the design stops there before any content is authored.

## Contributing

Design decisions live in the PRD's decisions log (Appendix C), including the ones that were
considered and rejected. If a change contradicts something there, update the log in the same
commit — a decision that quietly reverses without a record is how a design drifts.
