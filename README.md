# INKFALL

A NES-difficulty 2D platformer about a squid descending from a sunlit tide pool to the abyss.

**Status:** Phase 3 built — all five worlds, five bosses, five upgrades, start to finish on
one save. Gate 1 ✅ passed. Gate 3 round one failed on the most useful finding available —
the game was not finishable — so **Assist Mode** is built (unlimited lives, slower enemies,
denser checkpoints). Press **A** on the title. Gates 2 and 3 still need people.

📄 **[docs/PRD.md](docs/PRD.md)** — what the game is
🛠️ **[docs/PLAN.md](docs/PLAN.md)** — how it gets built: four phases, checkpoints, testing, hosting

## The short version

You play Nib, a squid whose signature move is an **eight-directional ink jet dash** costing
one of three pips from a slowly-refilling ink meter. Every jump puzzle and every boss is a
question about where you spend those pips.

- **Five hand-authored levels**, one boss each — Tide Pools, Kelp Forest, Sunken Ship,
  Volcanic Vents, and the Abyss. Roughly 25 minutes for a clean run.
- **Three tiers, Mario-style.** A hit blows Nib's ink out and drops him from Full (3 pips)
  to Spent (2 pips, and a little more jump); another kills. A rare **Ink Core** promotes
  him to Charged, where the dash itself kills what it passes through. The ink meter *is* the
  health bar.
- Sparse checkpoints, 3 lives, 3 continues — or **Assist Mode**, which is off by default,
  one key away, and never hidden in a menu. The difficulty lives in the distance between
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

## Running it

```bash
npm install
npm run dev       # World 1, at http://localhost:5173
npm run verify    # typecheck + lint + 923 unit tests + build + bundle size
npm run smoke     # 12 Playwright browser tests
```

`npm run dev` also serves the sprite editor at `/tools/sprite-editor/` and the level editor
at `/tools/level-editor/`, which paints the ASCII grid and writes the exact `LevelDef`
literal the level files are authored as. `?level=w03-ship` starts anywhere in the campaign,
and `?level=greybox` reaches the Phase 1 proving ground.

**Arrows/WASD** move, **Space** jumps, **Shift** runs, **X** is the ink dash — *hold a
direction to aim it*, including **↑** for the up-dash and **↑+→** for diagonals. **C** fires
an ink bolt once World 1 is cleared, and **↓+C** throws an ink bomb once World 3 is: one key
for ranged ink, because the game deliberately fits on one hand. **Esc** pauses, **M** mutes,
**R** restarts, **F1** opens the debug overlay (hitboxes, velocity, frame-time graph).

**A** on the title screen toggles **Assist Mode** (PRD §13.1): lives never run out, enemies
and bosses move at three-quarter speed, and a soft checkpoint lands every 32 tiles of new
ground. Nothing else changes — hazards still kill, the ink budget is still three pips, and
the run is stamped `ASSIST` rather than blocked. It persists to the save.

## Building it

[PLAN.md](docs/PLAN.md) breaks the work into four phases, each ending with a playable build
at a public URL and a gate that a machine can't pass for you:

1. **Engine & Feel** ✅ — a deployable grey box where Nib moves perfectly and nothing else
   exists. Its gate is a genuine go/no-go: if the ink dash isn't fun with no content around
   it, the project stops there rather than at Phase 4.
2. **One Real Level** ✅ — World 1 complete, proving the whole pipeline once instead of five
   times. Art, three enemies, three hazards, the Hermit King, a HUD, saves, a runtime
   chiptune synth, and a solver that proves the level finishable on two pips.
3. **All Five Levels** ✅ — the full descent, completable start to finish. Four more worlds,
   nine more enemies, four more bosses, the five ink upgrades, and a level editor that
   round-trips every shipped level byte for byte.
4. **Meta & Ship** — pearls, scoring, speedrun timers, audio, polish, accessibility. Two of
   its checkpoints are already spent: Assist Mode (4.7) because Gate 3 needed it, and the
   soundtrack (4.5) cut from eleven tracks to five.

## What Phase 3 found

- **Cling ends vertical gating.** Any rock face is a ladder once it is grippable, so from
  World 3 on, only horizontal distance over a void gates anything. World 5's third pearl is a
  one-tile island fifteen tiles clear of every wall, because a three-pip fall carries
  fourteen — and the solver caught the two earlier versions that weren't.
- **A four-pip pearl is the only kind Deep Jet can gate.** Spent + Deep Jet and Full without
  it reach exactly the same places, so any gate sized for three pips is already open to a
  player who never found the upgrade.
- **Completability needs a loadout, not an empty pair of hands.** World 2's first room is a
  kelp knot only an Ink Shot opens, and everyone who gets there earned one. The loadout is
  derived from the campaign order rather than authored per level, so adding an upgrade
  re-checks every later world for free.
- **The one-tile gap is settled**: the claim is dropped for v1 (PRD §16), and the tier
  difference lives entirely in the pip budget.
- **The solver cannot answer the gate's question.** Reachability proves a level is *possible*
  on two pips. Whether a person can do it three lives at a time is a different question, and
  Gate 3 answered it "no". Assist Mode is the response, and the two runs it makes possible —
  assisted for completion data, classic for where the curve is wrong — are what round two is.
- **The up-arrow had no glyph.** World 1's `HOLD ↑ + X TO DASH UP` — the entire Gate 1 fix for
  nobody finding the up-dash — had been drawing a missing-character box since Phase 2, and so
  had World 4's ink-bomb prompt. The font coverage test walked a hand-written list of strings
  rather than the hints themselves; it now walks every hint in every shipped level.

## What Phase 2 found

Four things worth knowing before touching this code, all written up in
[PLAN.md](docs/PLAN.md):

- **The variable-jump cut was silently clamping stomp bounces** to a third of their
  specified height, which made bounce chains physically impossible and looked like a
  level-design problem.
- **A one-tile gap does not exclude Full Nib.** With 16px tiles and a 12×14 hitbox, both
  drawn tiers fit through one — so the "small-only passage" idea in PRD §4.4 and §7.1 has no
  geometry behind it. §16 laid out three ways forward; Phase 3 took the cheap one.
- **The reachability solver is the level designer's editor**, not just a CI check. It caught
  a pearl that was supposed to need a World 5 upgrade and did not.
- **2.7's judgement call is answered.** Somebody listened, and the answer was the fallback the
  checkpoint names: the soundtrack is the **five chapter themes**, not eleven tracks.

## Contributing

Design decisions live in the PRD's decisions log (Appendix C), including the ones that were
considered and rejected. If a change contradicts something there, update the log in the same
commit — a decision that quietly reverses without a record is how a design drifts.
