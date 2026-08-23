# INKFALL — Development Plan

**Four phases. Every phase ends with a playable build at a public URL.**

Companion to [PRD.md](PRD.md), which says *what* the game is. This says how it gets built,
in what order, and how we know each piece actually works.

**Status:** Phase 1 complete and deployed — Gate 1 run once, one finding fixed, awaiting a re-test
✅ Phase 2 built — awaiting Gate 2
**Last updated:** 2026-08-23

---

## How this plan works

Five rules that shape everything below.

**1. Every phase deploys.** Not "could deploy" — actually deploys, to a real URL you can send
someone. The pipeline gets built in checkpoint 1.1 when there is nothing to break, not in
Phase 4 when everything can.

**2. Every checkpoint is provable.** Each one names the test that proves it. "Done" means the
test is green and on `main`, not that the code exists. A checkpoint with no test is a
checkpoint that will silently break three weeks later.

**3. Main is always green and always deployable.** Trunk-based, small PRs, CI on every push.
If a checkpoint takes more than a couple of days, it was too big — split it.

**4. Gates are human, tests are machines.** Automated tests prove the game *works*. Only a
person can tell you it's *fun*. Each phase ends with a gate that a machine cannot pass for
you, and Gate 1 has real teeth: it can stop the project.

**5. Test the simulation, not the pixels.** The deterministic core — physics, collision,
tiers, ink, score, saves, level parsing — gets heavy unit coverage. Rendering gets a browser
smoke test and human eyes. Chasing coverage through draw calls is wasted effort.

---

## The four phases

| Phase | What it produces | Exit gate | Rough effort |
|---|---|---|---|
| **1 · Engine & Feel** ✅ | A deployable grey box where Nib moves perfectly and nothing else exists | **Go / no-go.** 3 people say the grey box alone is fun — *round 1 done, one fix applied, re-testing* | 8–12 days |
| **2 · One Real Level** ✅ | World 1 complete: art, enemies, boss, HUD, saves, audio | A stranger finishes L1 unassisted in under 20 min — *pending* | 12–18 days |
| **3 · All Five Levels** | The whole game, completable start to finish | Full-game clear; every level provably completable at the Spent tier | 20–30 days |
| **4 · Meta & Ship** | Pearls, scoring, speedrun timers, full audio, polish, accessibility | ≥ 60% of testers reach World 3; bundle ≤ 1.5 MB | 15–22 days |

**Total: roughly 55–80 focused days**, solo. That is *focused* days, not calendar days —
scale to your actual availability. The estimates assume the PRD is not relitigated mid-build;
every reopened design decision costs more than the code it changes.

**The long pole is art authoring**, not engine code. ~455 hand-authored sprite frames is the
single biggest line item in the project, which is why building a sprite editor is a Phase 1
checkpoint rather than an afterthought.

---

# Phase 1 · Engine & Feel ✅

> **Goal:** prove the ink dash is fun before a single sprite or enemy exists.

**Built.** All nine checkpoints are green on `main`: 164 unit tests, 4 browser
smoke tests, 98% statement coverage of the simulation core, 11 kB gzipped.
Gate 1 is the remaining step, and it needs three humans.

### What the tests changed

The feel guarantees earned their keep on day one. Four constants from the PRD
did not survive contact with them:

| Constant | PRD | Now | Why |
|---|---|---|---|
| `JUMP_IMPULSE` | −4.60 | **−6.60** | Cleared 1.6 tiles against a stated guarantee of 3 |
| `DASH_SPEED` | 5.20 | **5.60** | The 7-tile guarantee missed by half a tile |
| `DASH_LOCK_FRAMES` | 8 | **10** | Same |
| `DASH_CARRYOVER` | 0.60 | **0.72** | Same |
| `GROUND_FRICTION` | 0.22 | **0.24** | Stopped in exactly 12 frames — no margin at all |

Two engine bugs surfaced the same way. The dash was delivering one frame fewer
of full-speed travel than `DASH_LOCK_FRAMES` claimed, because carryover was
applied before the move rather than after it. And a current tile drawn inside a
pool was not water, so Nib switched to land gravity and sank through an updraft
he should have ridden — currents now count as fluid, which is the honest model
for a game set entirely underwater.

One finding is a level-design constraint rather than a bug: guarantee 2 holds
for a dash taken within **±6 frames of the apex**, not for one taken straight
off the ground, because a horizontal dash zeroes vertical velocity and forfeits
the remaining airtime. Level design may lean on the window, not the instant.

This phase deliberately produces something ugly. Grey boxes, no art, no enemies, no sound.
If the movement is not fun with nothing in it, no amount of content will save it — and this
is the cheapest possible moment to find that out.

### Gate 1, round one

**Verdict: "needs a double jump or dash upwards, rest is fine."**

The build already had an up-dash — `↑` + `X`, reaching nearly eight tiles. The
finding was **discoverability, not capability**, which is the more useful result
of the two: a mechanic the player cannot find does not exist, and no amount of
tuning fixes a control nobody tries.

Three changes, in descending order of how much each would have prevented it:

1. **The grey box now gates on it, ten seconds in.** A five-tile face with no way
   around, with recovery ground beneath so a miss costs a retry rather than a
   life. Geometry teaches; it was previously buried at the far end of the level,
   where a player would quit before ever meeting it.
2. **One text prompt** — `HOLD ↑ + X TO DASH UP` — shown once on approach, for
   180 frames, never again. The PRD allows exactly this and nothing more.
3. **Vertical aim is buffered six frames**, so `↑` released just before `X` still
   dashes up. Those two keys essentially never land on the same frame from a real
   keyboard, and a one-frame gap silently produced a horizontal dash.

Building the gate surfaced a level-design rule worth more than the fix: **a
diagonal dash delivers only ~71% of its speed per axis.** A player moving right
holds Right, so their up-dash is really an up-right dash reaching ~6.3 tiles, not
7.9. The gate was six tiles and unclearable without releasing Right first —
punishing the player for holding the direction they were travelling in. Vertical
gates are now authored against the diagonal figure, and that is in the PRD.

### Checkpoints

| # | Checkpoint | Proven by |
|---|---|---|
| **1.1** | **Project boots and deploys.** Vite + TS strict + Vitest. Canvas at 320×180, integer-scaled, letterboxed. CI runs typecheck, lint, tests, bundle size. GitHub Pages deploys from `main`. | CI green on an empty suite; a grey canvas is live at the public URL |
| **1.2** | **The game loop.** Fixed 60 Hz accumulator, clamped, render decoupled and non-interpolating. Frame counter. Debug overlay on `F1`. | **Determinism test**: the same input log replayed twice yields byte-identical world state |
| **1.3** | **Collision.** Swept AABB against a tilemap, X then Y, 8 px max sub-step. `SOLID`, `ONEWAY`, `WATER`, `HAZARD`, `CRUMBLE`, `CURRENT`, `SLICK`. | **Tunnelling test**: nothing passes through a 1-tile wall at `DASH_SPEED` or `TERMINAL_FALL`, from any angle |
| **1.4** | **Nib walks and jumps.** Accel, friction, air control, variable jump height, coyote time, jump buffering. | **Feel guarantees 1, 4, 5** as executable assertions (see below) |
| **1.5** | **The ink dash.** 8 directions, 3-pip meter, refill rates, dash lock and carryover, cooldown, i-frames. | Meter unit tests; **feel guarantees 2 and 3** |
| **1.6** | **Tiers.** Spent / Full / Charged, hit → drop a tier, Ink Bulb and Ink Core, the shrink stun, respawn-at-Full. | Tier transition table tested exhaustively, including "an Ink Core while Spent promotes to Full, not Charged" |
| **1.7** | **Water and currents.** Buoyancy, swim stroke, entry damping, force zones. | Physics unit tests per constant |
| **1.8** | **The grey box.** A hand-built test level exercising every mechanic: gaps at each guarantee distance, a water section, a current, one-way platforms, crumbling tiles. Deployed. | Playable at the public URL |
| **1.9** | **Sprite editor.** A browser page in the repo that reads and writes the TypeScript sprite-array format. | A sprite round-trips through it unchanged |

### The feel guarantees, as tests

These are the five invariants from PRD §4.3, and they are the most valuable tests in the
project — they turn "the jump feels wrong now" into a red CI run.

```ts
test('a full-run jump clears 4 tiles horizontally and 3 vertically', () => {
  const w = worldWith(flatGround());
  accelerateToRunSpeed(w);
  press(w, 'jump');
  const arc = simulateUntilGrounded(w);
  expect(arc.maxHorizontalDistance).toBeGreaterThanOrEqual(4 * TILE);
  expect(arc.maxHeight).toBeGreaterThanOrEqual(3 * TILE);
});

test('standing jump plus one horizontal dash clears 7 tiles', () => { /* … */ });
test('jump plus up-dash reaches 6 tiles', () => { /* … */ });

test('Nib stops from run speed within 12 frames', () => {
  const w = worldWith(flatGround());
  accelerateToRunSpeed(w);
  release(w, 'right');
  expect(framesUntilStopped(w)).toBeLessThanOrEqual(12);
});

test('jump leaves the ground on the very next frame — no wind-up, ever', () => {
  const w = worldWith(flatGround());
  press(w, 'jump');
  step(w);
  expect(w.player.grounded).toBe(false);
});
```

Guarantees 1, 4 and 5 must hold at **all three tiers**; 2 and 3 assume a 3-pip budget, so
they are asserted for Full and Charged only.

### 🚦 Gate 1 — the go / no-go

**Three people play the grey box for ten minutes each, with no explanation beyond the
controls.** Watch, don't coach.

Pass if all three keep playing past the point you'd have stopped them, and at least two
describe the dash in their own words as something they enjoyed doing.

**If it fails, stop.** Do not proceed to Phase 2 and hope content fixes it. Re-tune the
constants in Appendix A and re-run the gate — the feel-guarantee tests make retuning cheap and
safe. If two rounds of tuning don't pass it, the ink dash is the wrong core mechanic, and the
PRD's rejected alternatives (tentacle grapple, suction cling) are on the table. Failing here
costs ten days. Failing at Phase 4 costs eighty.

**Deliverable:** a deployed grey box, and an honest answer to whether this game is worth building.

---

# Phase 2 · One Real Level ✅

> **Goal:** World 1 end to end, in final art, with everything a shipped game needs — for one
> level. This proves the *whole pipeline*, not just the engine.

Building one level completely, rather than five levels partially, is what surfaces the
expensive unknowns: how long a sprite really takes, whether the synth sounds acceptable,
whether the save system holds. Better to learn all of that once than five times.

**Built.** All ten checkpoints are green: 521 unit tests, 8 browser smoke tests, 29 kB
gzipped. Gate 2 is the remaining step, and it needs a stranger.

### What Phase 2 surfaced

The tests earned their keep again, and so did looking at the screen.

| Found | Where | Why it mattered |
|---|---|---|
| **The jump cut was eating stomp bounces** | `player.ts` | Releasing jump clamped *any* rise, so every bounce was −1.80 instead of the specified −4.60: a third of the promised height, and just low enough that a bounce chain could not physically reach the next enemy. It read as a level-design problem until something measured it. |
| **Landing between two crabs stomped one and was bitten by the other** | `combat.ts` | The first stomp reverses `vy`, so the second enemy in the same landing read as a walk into its flank. Contacts now resolve against one snapshot of how Nib arrived, and a landing beats a touch for the whole frame. |
| **A one-tile gap does not exclude Full Nib** | PRD §4.4, §7.1 | 16px tiles against a 12×14 hitbox: *both* tiers fit. The design's small-only passages cannot be built at these numbers. W1 ships without one; PRD §16 lays out the three ways forward. |
| **A straight-line reachability check can never land on a thin slab** | `reach.ts` | The line to any one-tile platform passes through the platform. Paths are now checked as an L — rise, then travel. |
| **Pearl 3 was reachable without Deep Jet** | World 1 C1 | Which would have made the backtracking engine decorative. The gap is now over a bed of urchins with no footing, at fifteen tiles. |
| **The boss arena was anchored to the map, not the floor** | `world.ts` | The King spawned inside the sand and the locked camera pointed at bedrock. The floor probe also scanned downward, which finds a platform, not a floor. |

**One thing merged rather than built.** Gate 1's round-one fix added a hint
system to `LevelDef` at the same time Phase 2 independently added one as an
entity type. Two implementations of one idea is exactly what the authoring-split
rule exists to prevent, so the trunk's won: hints are a `hints: HintDef[]` field
anchored to a tile with a radius, not entities. A key prompt is a caption on a
room, and a caption has no box to collide with. World 1 carries two — the dash
at A1's gap and the up-dash at A2's first ledge — and Gate 1's finding is why
the second one exists at all.

Two deviations from the PRD, both recorded in its decisions log:

- **A1's first gap is five tiles, not six.** Six is dx 7 — exactly feel guarantee 2, and only
  for a dash taken within six frames of the apex. Apex timing on the first required action in
  the game is how a player concludes the dash is broken. Five is still flatly unjumpable.
- **The grid owns geometry; the entity list owns actors.** §12.5 sketched checkpoints in both
  places. Two authorities for one fact is how a level ends up with three conches in the grid
  and two in the list.

### Checkpoints

| # | Checkpoint | Proven by |
|---|---|---|
| **2.1** | **Sprite pipeline.** Packed nibble arrays, palette-indexed blitting, animation state machine. Nib's full set at all three tiers. | Decode snapshot tests; visual check in the sprite editor |
| **2.2** | **Level format and loader.** `LevelDef` with stable string ids, ASCII grid + entity list, a parser that throws loudly on bad input. | Parser unit tests, including every malformed-input case |
| **2.3** | **Enemies: Snapper, Drifter, Puffer.** Patrol, ledge-turn, sine float, inflate cycle. Stomp, stomp chain, ink refund. | Per-enemy behaviour tests; stomp-chain scoring test |
| **2.4** | **Hazards.** Urchins, collapsing sand, crush clams. | Instant-death-at-any-tier test |
| **2.5** | **HUD and game state.** Lives, ink pips carrying tier state, shells, pause, death and respawn, checkpoints, continues, game over. | State machine tests; "respawn restores Full, never Charged or Spent" |
| **2.6** | **Save system.** Versioned `localStorage`, string-keyed, migration path, corrupt-blob fallback to `.bak`. | Schema tests at 100%, including a deliberately corrupted blob |
| **2.7** | **Audio spike.** The APU (2 pulse, triangle, noise), the dash SFX, one world theme. Gesture-gated start. | **Judgement call:** if the synth sounds bad here, fall back to fewer, simpler tracks now — not in Phase 4 |
| **2.8** | **World 1, all sections.** A1 through C3, per the PRD beat sheet. Ink Bulb taught in A4. | **Reachability test**: provably completable at the Spent tier |
| **2.9** | **The Hermit King.** Three phases, fixed-camera arena, boss door and level exit. | Boss phase-transition tests |
| **2.10** | **Title screen and level clear.** Enough shell to start, play, finish and restart without touching the console. | Browser smoke test drives the full loop |

Every checkpoint above is ✅ except one judgement call: **2.7 asks whether the synth sounds
acceptable, and that decision has not been made.** The APU, the tracker and World 1's theme
are built and everything checkable is checked — pitch, tempo, note length, harmonic
structure, a real AudioContext starting on a real keypress. Whether it *sounds good* needs
ears, and it must be answered before Phase 4 commits to eleven tracks.

### 🚦 Gate 2

**Hand the URL to someone who has never seen it.** No instructions at all.

Pass if they finish World 1 unassisted in under 20 minutes, and their deaths are attributable
to mistakes rather than to not understanding what the game wanted. Ask one question afterward:
*"was there any moment you didn't know what to do?"* Any answer naming a specific room is a
level-design bug, and it gets fixed before Phase 3.

**Deliverable:** a genuinely complete one-level game, online.

---

# Phase 3 · All Five Levels

> **Goal:** the full descent, completable start to finish. Content production at scale.

This is the longest phase and the most mechanical. Phases 1 and 2 built the machine; this
phase feeds it. The main risk is not difficulty — it's throughput and drift.

### Checkpoints

| # | Checkpoint | Proven by |
|---|---|---|
| **3.1** | **Level editor.** Extends the sprite editor: paint tiles, place entities, export `LevelDef`. | A Phase 2 level round-trips through it byte-identically |
| **3.2** | **Upgrade system.** Ink Shot, Cling, Ink Bomb, Heat Shell, Deep Jet. Persisted, and gating what they should. | Per-upgrade tests; "no upgrade changes hit count" asserted |
| **3.3** | **World 2 — Kelp Forest.** Currents, bubble streams. Barb Turret, Whipkelp, Eel. The Kelp Warden. | Reachability at Spent tier, with and without each upgrade |
| **3.4** | **World 3 — Sunken Ship.** Cling traversal, Hookline riding, the rising flood. Ghost Diver. The Drowned Captain. | Reachability; flood-timer test |
| **3.5** | **World 4 — Volcanic Vents.** Rising magma, superheated water, ash collapse. Magma Snail, Cinder Moth. The Vent Lord. | Reachability; magma-rise rate test |
| **3.6** | **World 5 — The Abyss.** Darkness and light radius, pressure crush, Deep Jet acquisition. Lightless, Bone Shrimp. | Reachability; pressure-timer test |
| **3.7** | **The Kraken.** Three phases, no checkpoint, ~3 minutes. | Phase-transition tests; a scripted no-damage clear |
| **3.8** | **Chapter structure.** Tilesets, palettes and music owned by chapters, not levels — the constraint that makes 50 levels possible later. | No level defines its own tileset |

### Watch for drift

Three things go wrong in a long content phase, and all three are caught by a rule rather than
by vigilance:

- **Mechanic soup.** Every level must still teach → test → complicate. If a section doesn't
  serve the world's new mechanic, cut it.
- **Silent tier assumptions.** The easiest bug to introduce here is a section that only works
  at 3 pips. The Spent-tier reachability test in CI is the whole defence — never skip it to
  land a level.
- **Roster creep.** 12 enemies is the budget. A new enemy needs a lesson no existing one
  teaches, written into the PRD before it's built.

### 🚦 Gate 3

**Play the entire game start to finish yourself, in one sitting, on a fresh save.** Then have
one other person do the same.

Pass when the game is completable by both, every level passes reachability in CI, and the
difficulty curve has the saw-tooth shape from the PRD — each world opening easier than the
previous boss and closing harder. Instrument deaths per section during this run; that data
drives Phase 4's tuning.

**Deliverable:** the complete five-level game, online, content-locked.

---

# Phase 4 · Meta & Ship

> **Goal:** the systems that make people come back, and the quality that makes it worth
> sharing.

### Checkpoints

| # | Checkpoint | Proven by |
|---|---|---|
| **4.1** | **Pearls and backtracking.** All 15 placed, persistent, tracked. Free replay of cleared levels from the world map. | **All 15 collectible** — asserted by the reachability solver given each pearl's stated upgrade and tier |
| **4.2** | **Scoring.** Shells, stomp chains, Charged-dash kills, clear bonuses, no-damage and no-death bonuses. Local high-score table. | Score arithmetic at 100% coverage |
| **4.3** | **Speedrun timers.** Frame-accurate per-level and full-run, PBs per character, splits, optional ghost. | Timer rule tests: boss fights counted, menus excluded, deaths don't stop the clock |
| **4.4** | **World map.** Data-driven, scrollable, showing pearls, best times, lock state. | Renders correctly from an arbitrary node list, not five hard-coded ones |
| **4.5** | **Full audio.** 11 tracks, ~26 SFX, independent volumes, one-key mute. | Manual; every cue also has a visual counterpart |
| **4.6** | **Juice.** Hitstop, screen shake, ink trails, silt, shrink burst, the count-up score tally. | Manual — this is 60% of the game's feel and none of it is testable |
| **4.7** | **Options and accessibility.** Key remapping, screen-shake and flash sliders, light-radius slider, Assist Mode. | A11y checklist; every hazard legible in greyscale |
| **4.8** | **Performance and size.** ≤ 8 ms frame time, zero allocations in the update loop, ≤ 1.5 MB gzipped. | CI bundle assertion; a 5-minute session with no dropped frames |
| **4.9** | **Playtest and tune.** Three external playtests. Apply the tightening ladder if it reads soft. | ≥ 60% of testers who start W1 reach W3 |

### The tuning ladder

Phase 4 is where the PRD's biggest open risk resolves: three tiers may make the game too
soft. If Gate 4 playtests read as easy, tighten **in this order**, re-testing between each:

1. Fewer or better-hidden Ink Cores — this is the primary dial
2. Fewer Ink Bulbs
3. Remove the Spent-tier jump bonus
4. Drop to 2 continues

**Do not start by buffing enemies.** The enemies are what make the levels legible; making them
faster or tankier trades readability for difficulty, which is the exact opposite of the
honest-difficulty pillar.

### 🚦 Gate 4 — ship

Pass when: five external testers, ≥ 60% reach World 3, bundle under budget, no console errors
in a full playthrough, accessibility checklist complete, and the game runs at 60 fps on a
mid-range laptop.

**Deliverable:** INKFALL 1.0, public.

---

## Testing strategy

### The shape of it

```
        ▲  Human gates ······· 4 gates, one per phase. Not automatable.
       ╱ ╲
      ╱   ╲   Browser smoke ·· ~5 Playwright specs. Does it load, run, save?
     ╱─────╲
    ╱       ╲  Integration ···· Determinism replay. Level reachability.
   ╱─────────╲                  Save migration. ~20 specs.
  ╱           ╲
 ╱─────────────╲ Unit ·········· Physics, collision, tiers, ink, score,
╱_______________╲                parser, timers. ~150 specs. The bedrock.
```

Roughly **70% of test effort on the simulation core, 20% integration, 10% browser**. Zero on
rendering internals — a browser smoke test plus your eyes covers it, and pixel-diffing a
canvas produces tests that fail for reasons nobody can act on.

### What gets tested where

| Layer | Tool | Target | Runs |
|---|---|---|---|
| Physics, collision, ink, tiers | Vitest | 90% | Every push, < 5 s |
| Score, timers, save schema | Vitest | 100% | Every push |
| Level parser | Vitest | 100%, including malformed input | Every push |
| Determinism replay | Vitest | Byte-identical state across two replays | Every push |
| Level reachability | Vitest | Every level, at the Spent tier | Every push, < 30 s |
| Browser smoke | Playwright | Load → title → play → save → reload | Every push, < 60 s |
| Feel | Humans | The four gates | Once per phase |

### The four load-bearing tests

Most of the suite is routine. These four carry disproportionate weight:

**Determinism replay.** A recorded input log, replayed twice, must produce byte-identical
world state. This protects speedrun timing, ghost playback, and your ability to reproduce any
bug report from an input log. It is also an early warning for accidental `Math.random()`,
`Date.now()`, or frame-rate-dependent physics creeping into the update loop.

**Spent-tier reachability.** An automated solver walks each level and proves it completable
with a 2-pip budget. Because a player can always arrive at any section Spent, a section that
requires 3 pips is a genuine unfairness bug — and it is invisible to a developer who always
plays at Full.

**The feel guarantees.** Five assertions that turn subjective regression into a red CI run.
Their real value is permission: you can retune constants aggressively because the tests tell
you the moment you've broken the jump.

**Save migration with a corrupt blob.** The one failure that destroys a player's progress
irrecoverably. Test the fallback, test the `.bak` copy, and never let the key be cleared
automatically.

### Rules

- **A bug fix starts with a failing test.** Reproduce first, then fix. The test is what stops
  it coming back.
- **No skipped or quarantined tests.** A test that can't pass is a bug or a bad test; decide
  which and act. Skipping is how a suite dies.
- **CI must stay under two minutes**, or people stop waiting for it.

---

## Continuous integration & hosting

### CI — every push to `main` and every PR

```yaml
# .github/workflows/ci.yml — set up in checkpoint 1.1
- typecheck      tsc --noEmit
- lint           eslint
- test           vitest run --coverage
- build          vite build
- size           assert dist/ gzipped ≤ 1.5 MB
- smoke          playwright test
```

The bundle-size assertion belongs in CI from day one. Size regressions are gradual and
invisible until they're expensive; a hard limit that fails the build is the only thing that
actually holds.

### Hosting

INKFALL is a **pure static bundle with no backend** — all state is `localStorage`, there is no
API, no database, and no runtime cost. Any static host works.

**Recommended: GitHub Pages**, deployed by Actions from `main`. The repo is already on GitHub,
it's free, and there's no new account. Two gotchas:

- A project page serves from `https://foolless.github.io/inkfall/`, so Vite needs
  `base: '/inkfall/'` or every asset 404s. Set this in checkpoint 1.1 — discovering it later
  means debugging a blank page.
- Pages has no PR preview deploys. You get one live URL, from `main`.

**Upgrade path: Cloudflare Pages or Netlify**, if you later want per-PR preview URLs (genuinely
useful for playtest feedback — "try this build" beats "pull this branch") or a custom domain.
Both deploy the same `dist/` with no code changes.

**Browser support:** latest two versions of Chrome, Firefox, Safari, Edge. Nothing here needs
a polyfill. The one platform rule that bites is **audio autoplay** — the audio context can only
start after a user gesture, which is why the title screen's "Press Space" exists.

---

## After 1.0

Deliberately out of scope for these four phases, in the order they'd likely happen:

1. **Unlockable characters** — Octo, Cuttle, Nautilus. The PRD's Phase 2. Each is a movement
   retuning that changes how all five levels play, and each needs alternate routes authored
   where its limitations close a path. Highest replay value per unit of work.
2. **Levels 6–50.** The scaling constraints in PRD §12.7 are already respected, and the level
   editor already exists, so this is content work. Chapters of 5–6 levels each.
3. **Gamepad support.** Deliberately cut from v1 to keep tuning focused on one input model;
   genuinely nice for a precision platformer, and cheap to add once the feel is settled.

---

## Quick reference

| | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| **Produces** | Grey box | World 1 | All 5 worlds | 1.0 |
| **Checkpoints** | 9 | 10 | 8 | 9 |
| **Gate** | Is it fun? | Can a stranger finish it? | Is it completable? | Is it ready? |
| **Can it kill the project?** | **Yes** | No | No | No |
| **Effort** | 8–12 d | 12–18 d | 20–30 d | 15–22 d |
