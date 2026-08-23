# INKFALL

A NES-difficulty 2D platformer about a squid descending from a sunlit tide pool to the abyss.

**Status:** design phase. Nothing is built yet — start with the PRD.

📄 **[docs/PRD.md](docs/PRD.md)**

## The short version

Five hand-authored levels, one boss each. You play Nib, a squid whose signature move is an
**eight-directional ink jet dash** costing one of three pips from a slowly-refilling ink meter.
Every jump puzzle and every boss is a question about where you spend those pips.

- One-hit deaths, 3 lives, 2 checkpoints per level, 3 continues. Classic and unforgiving.
- 15 hidden pearls, per-level speedrun timers with ghosts, arcade scoring, five permanent
  ink upgrades that open routes back through earlier worlds.
- Everything authored in code: pixel sprites as TypeScript arrays, chiptune synthesised at
  runtime via Web Audio. No image files, no audio files, no runtime dependencies.

## Intended stack

TypeScript (strict) · Vite · Canvas 2D · Web Audio · Vitest. Zero runtime dependencies.
Ships as a static bundle under 1.5 MB.

## A note on this directory

This is a **standalone project** with no coupling to the `makeluck` app that currently
surrounds it — separate build, separate dependencies, separate deploy. It lives here only
because that is where the working branch is. It should be moved to its own repository
before implementation begins (milestone M1 in the PRD).
