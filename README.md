# INKFALL

A NES-difficulty 2D platformer about a squid descending from a sunlit tide pool to the abyss.

**Status:** Feature-complete. All four phases are built — five worlds, five bosses, five
upgrades, fifteen pearls, a world map, speedrun timers with ghosts, the full sound roster,
and an options screen with real accessibility settings. Gate 1 ✅ passed. Gate 3's first
round failed on the most useful finding available — the game was not finishable — so
**Assist Mode** exists (press **A** on the title): unlimited lives, slower enemies, denser
checkpoints. Gates 2, 3 and 4 remain, and all three need people.

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
npm run verify    # typecheck + lint + 1,173 unit tests + build + bundle size
npm run smoke     # 16 Playwright browser tests
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

On the title: **↑** opens Options, **↓** shows the high scores, **Space** goes to the world
map. On the map, **↑/↓** pick a level — any cleared level can be replayed freely, which is
what makes five of the fifteen pearls reachable at all. Paused, **↓** quits back to the map.

**Options** (PRD §13) carries the accessibility settings first: Assist Mode, Reduce Flashing,
Screen Shake, and World 5's light radius, followed by volumes, the speedrun timer, the PB
ghost, and full key remapping for all eight actions. **A** on the title is still the one-key
shortcut for Assist Mode — lives never run out, enemies and bosses move at three-quarter
speed, and a soft checkpoint lands every 32 tiles. Nothing else changes: hazards still kill,
the budget is still three pips, and the run is stamped `ASSIST` rather than blocked.

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
4. **Meta & Ship** ✅ — the world map and free replay, all fifteen pearls with their gates
   asserted one by one, scoring and a high-score table, frame-accurate timers with splits
   and PB ghosts, the complete SFX roster, screen shake and particles, and full key
   remapping alongside §13's accessibility settings.

## What Phase 4 found

Every finding in this phase was the same shape, and a different shape from Phase 3's. Phase
3's bugs were geometry — a gate that did not gate. Phase 4's were **things written down and
never read back**: state the game maintained and then ignored, or asked for and never
received. None of them crashed.

- **Progress was written and never read.** `unlocked` had been maintained since Phase 2 and
  nothing ever looked at it, so every session started at World 1 however far you had got.
  The world map's cursor is the fix, and it is the game's continue.
- **Every point earned inside a level was thrown away at the exit** — after the HUD had
  spent the level showing them to you.
- **Seven sound cues fired silently**, including every ranged-ink sound, because one `as`
  cast told the compiler the world could only raise sounds the synth knew.
- **Three glyphs were missing**, among them the `↑` in the up-dash hint that Gate 1 asked
  for and the `>` cursor on both new menus.

Six of the eight were invisible to the existing tests, because those asserted what the code
*stored* rather than what it *used*. Each fix came with an assertion of the second kind.

Review of the finished branch turned up five more, all one variant of the same shape: **facts
the game keeps in two places and updates in one**. Assist Mode lives on the run (lives) and on the world (enemy speed and
soft checkpoints), and the options screen set one of them — so turning it on from a pause gave
unlimited lives against classic-speed enemies. The game-over screen added up the run's score
and the unfinished level's; the board entry took only the first. The completion screen timed
the last level and labelled it the descent. A restart reset the level and left the ghost
recorder running, splicing an abandoned attempt onto the run that replaced it. And
`?level=w02-kelp` on a fresh save opened in a room whose first obstacle is a kelp knot only
the Ink Shot cuts — the debug route the README recommends, landing you in a level with no exit.

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
  drawn tiers fit through one, so the "small-only passage" idea in PRD §4.4 and §7.1 had no
  geometry behind it. It is now a `CRACK` tile — solid to everything but a small body — and
  a test proves no crack is ever on the critical path. Phase 3 answered the same question the
  other way in parallel; §16 records how the two were reconciled.
- **A jump pressed during a dash was silently eaten**, because the dash locks for ten frames
  and the jump buffer only held six.
- **The reachability solver is the level designer's editor**, not just a CI check. It caught
  a pearl that was supposed to need a World 5 upgrade and did not.
- **2.7's judgement call went to the fallback in the end.** The synth passed by ear, then the
  scope call went the other way: the soundtrack is the **five chapter themes**, not eleven.

## Contributing

Design decisions live in the PRD's decisions log (Appendix C), including the ones that were
considered and rejected. If a change contradicts something there, update the log in the same
commit — a decision that quietly reverses without a record is how a design drifts.
