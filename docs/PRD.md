# INKFALL — Product Requirements Document

**Working title:** INKFALL
**Genre:** 2D side-scrolling action platformer
**Player character:** Nib, a squid
**Scope:** 5 levels, one boss each
**Status:** Draft v1.3 — Phase 1 built; constants retuned against the feel-guarantee tests
**Scope:** v1 ships **5 levels**. The architecture must not foreclose ~50 (§12.7).
**Owner:** richard.andrew.young@gmail.com
**Last updated:** 2026-08-23

---

## 1. Overview

INKFALL is a NES-difficulty precision platformer about a small squid descending from a sunlit tide pool to the crushing dark of the abyss. It plays like *Super Mario Bros. 3* — run, jump, stomp, tight air control — but the squid's signature move, an **eight-directional ink jet dash**, turns every gap into a puzzle about where you spend your three pips of ink.

It is built as a **standalone project**: its own repository, its own build, zero coupling to any existing app. It ships as a single static bundle that runs in a desktop browser.

### 1.1 Vision statement

> A squid should not move like a plumber. Nib has no legs — he has thrust. The whole game is about managing a finite, recharging burst of motion in a world that wants you dead.

### 1.2 Design pillars

| Pillar | What it means | What it rules out |
|---|---|---|
| **Ink is the whole game** | Every jump puzzle, every enemy, every boss is authored around the 3-pip ink meter. If a section would play identically without ink, it gets cut. | Generic "hold right and jump" corridors. |
| **Honest difficulty** | Deaths are always the player's fault and always readable in hindsight. Telegraphs are generous; consequences are not. | Blind drops, off-screen projectiles, unavoidable damage. |
| **Handmade, in code** | Every sprite, tile, palette, note, and level is authored as data in the repo. No asset pipeline, no binary blobs, no licensing questions. | Sourced sprite sheets, audio files, third-party engines. |
| **Descent** | Each world is darker, heavier, and more hostile than the last. Progression is felt, not just numbered. | Interchangeable levels in arbitrary order. |
| **Mastery has a ceiling** | Finishing is hard. Finishing fast, unhurt, with every pearl, as every character — that's the long tail. | One-and-done content. |

### 1.3 Goals

- G1 — A player who finishes all five levels should have died 20–50 times and never once felt cheated.
- G2 — Movement should feel good in a **grey box with no enemies**. If the vertical slice isn't fun with nothing in it, the physics are wrong.
- G3 — Complete run time: **20–30 minutes** for a competent player who already knows the levels; **2–4 hours** for a first-timer including deaths.
- G4 — Total download under **1.5 MB**, cold load under **1 second**, locked 60 fps on integrated graphics.
- G5 — Every one of the 15 pearls should be findable without a guide, but not on a first pass.

### 1.4 Non-goals

- ❌ Mobile / touch support. Precision platforming on a touch D-pad is bad, and supporting it would compromise the tuning. Desktop keyboard only.
- ❌ Online leaderboards, accounts, or any backend. Everything is `localStorage`.
- ❌ A *player-facing* level editor, mod support, or user-generated content. (An **internal** authoring tool is required, not optional — see §12.7.)
- ❌ Story cutscenes or dialogue trees. Narrative is environmental.
- ❌ Procedural generation. Every level is hand-authored, at 5 levels and at 50.
- ❌ Building levels 6–50 in v1. The five levels are the deliverable; §12.7 is only about not painting ourselves into a corner.
- ❌ Monetization of any kind.

### 1.5 Success criteria

| Metric | Target | How measured |
|---|---|---|
| Vertical slice fun | 3 of 3 playtesters ask to keep playing after the grey box | Playtest notes |
| Frame stability | 0 dropped frames over a 5-min session, mid-range laptop | In-engine frame log |
| Readability | 0 deaths attributed to "I couldn't see it" in playtest | Post-death survey |
| Completion | ≥ 60% of playtesters who start World 1 reach World 3 | Local telemetry counter |
| Bundle size | ≤ 1.5 MB gzipped | CI check |

---

## 2. Audience & platform

**Primary audience:** adults who grew up on NES/SNES platformers and want something short, hard, and finished — not a 40-hour roguelike.

**Secondary audience:** speedrunners. The game is authored with routing in mind (see §8.4).

**Platform:** desktop browser, latest two versions of Chrome, Firefox, Safari, Edge. Minimum window 960×540; the canvas integer-scales and letterboxes beyond that.

**Input:** keyboard only. See §5.

---

## 3. The character

**Nib** — a young reef squid, roughly a hand-span long, deep violet with a paler underside and two oversized eyes. Eight limbs, none of which touch the ground much. He is not a hero; he's descending because something took his siblings and the current only goes one way.

Nib does not talk. His personality is entirely in his animation: he *hovers* rather than stands, his mantle pulses when he's idle, and his eyes track the nearest threat.

---

## 4. Core gameplay

### 4.1 The ink system

The single most important system in the game.

- Nib has an **ink meter of 3 pips**, drawn as three teardrops beside his portrait in the HUD. (2 pips while **Spent** — see §4.4. The meter *is* the health bar.)
- **Ink Dash** costs 1 pip: an instantaneous burst in one of **8 directions**, usable in mid-air, once per direction-press. Not a double jump — a *directional* burst that overrides current velocity.
- Pips refill on a timer: **1 pip per 45 frames (0.75 s)** while grounded, **1 per 20 frames (0.33 s)** while in water, **0 while airborne over a pit**. Airborne refill is deliberately disabled so hang-time can't be farmed.
- **Stomping an enemy instantly refunds 1 pip**, capped at max. This is the core of chained aerial traversal: bounce → dash → bounce.
- Running out of ink mid-air is a designed failure state. The HUD flashes the empty meter and Nib's mantle goes pale.

**Why this and not a double jump:** a double jump is a resource you either have or don't. Three pips with a slow refill is a *budget*, so a room can ask "you have 3 pips and 5 gaps — where do you spend them?" That question is the game.

### 4.2 Movement state machine

```
                ┌─────────┐
      land ────▶│ GROUND  │◀──── land
                └────┬────┘
             jump /  │  \ walk off ledge
            ┌────────┘   └────────┐
            ▼                     ▼
       ┌─────────┐           ┌─────────┐
       │  RISE   │──apex────▶│  FALL   │
       └────┬────┘           └────┬────┘
            │  dash              │  dash
            └────────┬───────────┘
                     ▼
                ┌─────────┐  8 frames locked
                │  DASH   │──────────────┐
                └─────────┘              │
                     │ hit wall/ceiling  │
                     ▼                   ▼
                ┌─────────┐         ┌─────────┐
                │  BONK   │        │  FALL   │
                └─────────┘         └─────────┘

  Orthogonal states: WATER (replaces GROUND/RISE/FALL physics),
  CLING (World 2 upgrade), HURT (90 i-frames + knockback),
  DEAD (locked, 90-frame animation, then respawn).

  Size tier, orthogonal to all of the above:

    ┌──────────┐  hit  ┌──────────┐  hit  ┌──────────┐  hit  ┌────────┐
    │ CHARGED  │──────▶│   FULL   │──────▶│  SPENT   │──────▶│  DEAD  │
    │ 3 pips   │       │ 3 pips   │       │ 2 pips   │       └────────┘
    │ dash KILLS│      │ 12×14 box│       │ 10×10 box│
    └──────────┘       └──────────┘◀──────└──────────┘
         ▲                              Ink Bulb
         └──── Ink Core ────────────────────┘
```

### 4.3 Physics constants

All values in **pixels per frame** at a fixed **60 Hz** timestep. These are the starting point for tuning, not gospel — but they are what the vertical slice ships with, and any change must be re-validated against the grey box (G2).

#### Land

| Constant | Value | Note |
|---|---|---|
| `GRAVITY` | 0.42 | Applied every frame while airborne |
| `TERMINAL_FALL` | 6.00 | |
| `WALK_ACCEL` | 0.18 | |
| `WALK_MAX` | 1.60 | |
| `RUN_MAX` | 2.60 | While Run held |
| `RUN_ACCEL` | 0.24 | |
| `GROUND_FRICTION` | 0.24 | Applied on no input. *(was 0.22 — stopped in exactly 12 frames, no margin)* |
| `AIR_ACCEL` | 0.10 | Meaningful air control, Mario-3-like |
| `AIR_DRAG` | 0.04 | |
| `JUMP_IMPULSE` | −6.60 | ≈ 3.2 tiles high. *(was −4.60, which cleared only 1.6 tiles against a stated guarantee of 3)* |
| `JUMP_CUT` | −1.80 | On jump release, `vy = max(vy, JUMP_CUT)` |
| `COYOTE_FRAMES` | 6 | Jump allowed after leaving ledge |
| `JUMP_BUFFER_FRAMES` | 6 | Jump pressed before landing still fires |
| `STOMP_BOUNCE` | −4.60 | Rescaled against the new jump impulse |
| `STOMP_BOUNCE_HELD` | −6.20 | If jump held on contact |

#### Ink dash

| Constant | Value | Note |
|---|---|---|
| `DASH_SPEED` | 5.60 | Land. *(was 5.20 — the 7-tile guarantee missed by half a tile)* |
| `DASH_SPEED_WATER` | 6.40 | Water is Nib's element |
| `DASH_LOCK_FRAMES` | 10 | Velocity locked, gravity suspended. *(was 8)* |
| `DASH_CARRYOVER` | 0.72 | Fraction of dash velocity retained on release. *(was 0.60)* |
| `DASH_COOLDOWN` | 10 | Frames before another dash may start |
| `DASH_COST` | 1 pip | |
| `INK_MAX` | 3 pips | |
| `INK_REFILL_GROUND` | 45 frames/pip | |
| `INK_REFILL_WATER` | 20 frames/pip | |
| `INK_REFILL_AIR` | ∞ | Disabled by design |
| `DASH_IFRAMES` | 4 | Brief invulnerability at dash start — enough to punch through a jellyfish, not enough to tank a spike |

#### Water

| Constant | Value | Note |
|---|---|---|
| `GRAVITY_WATER` | 0.14 | Buoyant sink |
| `TERMINAL_FALL_WATER` | 2.20 | |
| `SWIM_STROKE` | −1.90 | Per jump press, no hold |
| `SWIM_MAX_X` | 1.80 | |
| `WATER_ENTRY_DAMP` | 0.40 | Vertical velocity multiplier on entry — no cannonballing through a pool |
| `CURRENT_FORCE` | 0.06–0.30 | Per-tile authored, pushes on an axis |

#### Tier deltas

Only these values change across the three tiers. Everything not listed — accelerations, friction, dash speed, dash lock, coyote and buffer windows — is identical, so the game never feels like three different games.

| Constant | Spent | **Full** *(baseline)* | Charged | Note |
|---|---|---|---|---|
| Sprite / hitbox | 12×12 / **10×10** | 16×16 / 12×14 | 16×16 / 12×14 | Only Spent fits a 1-tile gap |
| `INK_MAX` | **2** | 3 | 3 | Charged adds no pips — that's Deep Jet's job (§8.5) |
| `GRAVITY` | **0.40** | 0.42 | 0.42 | |
| `JUMP_IMPULSE` | **−6.80** | −6.60 | −6.60 | Small is not strictly worse |
| `RUN_MAX` | **2.70** | 2.60 | 2.60 | |
| Crumble tile hold | **36f** | 24f | 24f | Less weight on the sand |
| Dash damage | none | none | **kills unarmored** | See §4.4 |

**Feel guarantees 1, 4 and 5 hold in all three tiers.** Guarantees 2 and 3 are stated for a 3-pip budget, so they hold for Full and Charged but not Spent — which is exactly why no section may *require* three pips (§12.8).

#### Feel guarantees

These are the invariants tuning must preserve. If a constant change breaks one, the change is wrong.

1. A full-run jump clears **4 tiles horizontal, 3 tiles vertical**.
2. A standing jump + one horizontal dash clears **7 tiles horizontal**, for any dash taken within **±6 frames of the apex**. A dash taken immediately off the ground falls short, because a horizontal dash zeroes vertical velocity and forfeits the remaining airtime — level design may rely on the window, not on the instant.
3. A jump + upward dash reaches **6 tiles vertical**.
4. Nib comes to a full stop from run speed in **≤ 12 frames**.
5. Time from jump press to leaving the ground is **1 frame**. No wind-up, ever.

### 4.4 Damage & size tiers

Nib has **no health bar, because the ink meter is the health bar.** He exists in three tiers, Mario-style, and getting hit drops him one tier by literally blowing his ink out.

| Tier | Size | Ink | Dash | On hit |
|---|---|---|---|---|
| **Charged** | 16×16 sprite, 12×14 hitbox | 3 pips | **Kills what it passes through** | → **Full** |
| **Full** | 16×16 sprite, 12×14 hitbox | 3 pips | Traversal only | → **Spent** |
| **Spent** | 12×12 sprite, 10×10 hitbox | 2 pips | Traversal only | → **death** |

**Why the tier and the resource are the same thing.** A separate hit-points bar would sit beside the ink system; this *is* the ink system. Getting hit costs you the exact currency the level is asking you to budget, so a mistake tightens the next jump instead of merely ticking a counter down. It also means the game needs **no new HUD element** — the pips themselves carry the tier (§11.2), and the player reads their own health in the place they are already looking mid-air.

**Charged — the fire-flower tier.** Granted by an **Ink Core**: a dense black knot of concentrated ink. While Charged, Nib's dash becomes a weapon:

- It **kills any unarmored enemy it passes through** (armored ones — Barb Turret, Magma Snail's face — still resist).
- It **breaks cracked terrain** without an Ink Bomb.
- The trail lingers **20 frames as damaging ink**, so a dash through a Bone Shrimp swarm clears a lane behind you.
- Nib renders darker and denser with a hard sheen; the ink trail is opaque black instead of translucent.

Charged deliberately grants **no extra pips** — pip count is Deep Jet's territory (§8.5), and keeping the two orthogonal means a Charged player and a Deep Jet player have learned different things. It makes the dash you already use *more*, rather than adding a button.

**Ink Cores are rare.** 1–2 per level from World 3 onward; in Worlds 1–2 they exist **only as hidden secrets**. This is the counterweight to a third tier absorbing difficulty (§15) — Charged is a reward you find, not a state you're expected to be in.

**Taking a hit at any tier above Spent:**
- Nib expels an ink cloud, drops one tier, and takes 8 px of knockback away from the source.
- **90 frames of invulnerability**, flickering — enough to walk out of a bad spot.
- The expelled cloud **stuns every enemy within 2 tiles for 30 frames**. This is deliberate: it makes the classic Mario failure of being hit twice in half a second essentially impossible, and it is thematically exact.

**Taking a hit while Spent:** death → 90-frame animation (Nib deflates, ink clouds out, the body drifts up) → respawn at the last checkpoint, lives −1.

**The two pickups:**

| Pickup | Effect | Density | If collected at that tier already |
|---|---|---|---|
| **Ink Bulb** | Spent → Full | 4–6 per level, one within ~15 s after each checkpoint, plus hidden | Refills the meter, scores 1,000 |
| **Ink Core** | Full → Charged <small>(Spent → Full)</small> | 1–2 per level from W3; hidden-only in W1–2 | Refills the meter, scores 2,000 |

An Ink Core collected while Spent promotes only one tier, to Full — you cannot skip a rung.

**Respawning always restores Full** — never Charged, never Spent. Mario respawns you small; we do not. A section authored for a 3-pip budget is not honestly completable on 2, so respawning Spent would hand the player an unfair room through no new mistake of their own — a direct violation of the honest-difficulty pillar. Respawning *Charged* would be the opposite error, handing back a reward the player earned once. Checkpoints are already sparse; that is where the difficulty lives.

**What ignores tiers entirely.** Pits, crushing, magma, Hookline contact, urchin spikes, and the World 5 pressure crush are **instant death at any size**, exactly as in Mario. Enemy contact and enemy projectiles cost a tier. This split is what keeps the world's hazards readable: geometry kills, creatures cost.

**Being small is not purely worse.** Spent Nib fits through **1-tile gaps** that Full Nib cannot, jumps marginally higher, and sits on collapsing sand 50% longer. Levels use this for optional shortcuts, one pearl (§7.6), and speedrun routing — a runner may choose to stay Spent through a section.

No fall damage — there is no killing height. **Invulnerability after respawn:** 60 frames.

### 4.5 Lives, checkpoints, continues

| Rule | Value |
|---|---|
| Starting lives | 3 |
| Extra life | Every 100 **shells** collected; also 1 per hidden **pearl** |
| Ink Bulbs per level | 4–6, one within ~15 s after each checkpoint |
| Ink Cores per level | 1–2 from W3; hidden-only in W1–2 |
| Checkpoints per level | **2** (roughly ⅓ and ⅔ through) — sparse, NES-style |
| Boss checkpoint | 1, immediately before the boss door |
| Game Over | Lives exhausted → Game Over screen |
| Continues | 3 per session. A continue restarts the **current level** at its start with 3 lives and shells reset to 0. |
| Out of continues | Back to title. Level unlocks and collectibles persist. |

Checkpoints are **conch shells** on posts. Passing one plays a rising two-note jingle and the conch lights.

---

## 5. Controls

Keyboard only. Both arrow keys and WASD are always live; there is no "choose a scheme" prompt.

| Action | Primary | Alternate |
|---|---|---|
| Move | ← → | A D |
| Look up / aim up | ↑ | W |
| Crouch / aim down / enter pipe-analog | ↓ | S |
| Jump / swim stroke | **Space** | Z |
| Run (hold) | **Shift** | — |
| **Ink Dash** | **X** | / |
| Ink Shot (W2 upgrade) | **C** | . |
| Pause | Esc | Enter |
| Skip cutscene / confirm | Space | Enter |

**Dash aiming:** the dash fires in the direction of currently-held movement keys at the moment X is pressed, resolved to 8 directions. **No held direction = dash in Nib's facing direction, horizontally.** Diagonals require two keys held.

**Remapping:** full key remapping is available in Options and persists to `localStorage`. Required for accessibility (§13).

---

## 6. Enemies & hazards

### 6.1 Enemy roster

Each enemy exists to teach or test one thing. If two enemies test the same thing, one gets cut.

| # | Name | World | Behaviour | Stomp? | Ink? | Teaches |
|---|---|---|---|---|---|---|
| 1 | **Snapper** | 1 | Crab. Walks a platform, turns at ledges and walls. 0.6 px/f. | ✅ | ✅ | Baseline stomp timing |
| 2 | **Drifter** | 1 | Jellyfish. Sine-wave float, ignores terrain. Contact damage on all sides. | ❌ | ✅ (Ink Shot) | Not everything is stompable — route around it |
| 3 | **Puffer** | 1 | Inflates to a spike ball when Nib is within 3 tiles; deflates after 90 frames. Stompable **only while deflated**. | ⚠️ conditional | ✅ | Patience; reading state before committing |
| 4 | **Barb Turret** | 2 | Barnacle fixed to wall/ceiling. Fires a barb every 100 frames along one axis. Telegraph: 20-frame flare. | ❌ (armored) | ❌ | Timing windows in a corridor |
| 5 | **Whipkelp** | 2 | Anchored kelp stalk that lashes across a 4-tile arc on a 120-frame cycle. Destructible at the base. | ❌ | ✅ base only | Attacking the right part of a thing |
| 6 | **Eel** | 2, 5 | Sits in a wall socket. Lunges 5 tiles when Nib crosses its line. 40-frame telegraph (glow + hiss), 3.2 px/f lunge, 90-frame retreat. | ❌ | ⚠️ stuns only | Baiting and punishing |
| 7 | **Ghost Diver** | 3 | Drowned diver. Drifts toward Nib at 0.5 px/f **through solid walls**. Cannot be killed or stunned. Despawns at room exit. | ❌ | ❌ | Pressure — you cannot solve this, only leave |
| 8 | **Hookline** | 3, 5 | Fishing hook descends from the ceiling on a chain, sweeps horizontally, retracts. Instant death on contact. Can be **ridden** if you land on the hook's flat top. | ❌ | ❌ | Hazard-as-platform |
| 9 | **Magma Snail** | 4 | Armored front and top. Vulnerable only to ink on its **exposed rear**. Slow, 0.3 px/f, blocks corridors. | ❌ | ⚠️ rear only | Positioning; ink as a key, not a weapon |
| 10 | **Cinder Moth** | 4 | Flies a fixed patrol, drops a burning ember every 90 frames that lands and burns for 60 frames. | ✅ | ✅ | Threat that persists after the enemy is gone |
| 11 | **Bone Shrimp** | 5 | Swarms of 4–8, 1.4 px/f, weak, spawn from vents until the vent is inked shut. | ✅ | ✅ | Crowd management, resource drain |
| 12 | **Lightless** | 5 | Anglerfish. Invisible except for its lure. Charges at 4.0 px/f when Nib enters the lure's light radius. | ❌ | ✅ (lure is the hitbox) | Everything you've learned, in the dark |

### 6.2 Hazards

**Hazards are instant death at any size tier** (§4.4) — geometry kills, creatures cost. The one exception is the ember dropped by a Cinder Moth, which is an enemy projectile and costs a tier.

| Hazard | Worlds | Behaviour |
|---|---|---|
| **Urchin spikes** | all | Static instant death. Always drawn on a contrasting tile so they read at a glance. |
| **Crush clam** | 1, 3 | Opens 90 frames, slams in 6. Instant death in the mouth; the shell is a platform when closed. |
| **Collapsing sand** | 1, 4 | Crumbles 24 frames after Nib lands. Respawns 180 frames later. Visible cracks as a timer. |
| **Current** | 2, 5 | Directional force zone, drawn with drifting particles — never invisible. **Current tiles count as fluid**: a current inside a pool still floats you rather than silently switching Nib to land gravity. The whole game is underwater, so every current in it is a water current. |
| **Bubble stream** | 2, 3 | Rising bubbles act as one-frame-of-contact platforms with `−1.2` upward carry. Pop after 1 use. |
| **Rising magma** | 4 | Room-scale timer. Rises at 0.25 px/f. Instant death. One-way vertical pressure. |
| **Pressure crush** | 5 | The abyss itself. In two rooms, staying still for > 180 frames triggers a closing vignette and then death. Move or die. |
| **Darkness** | 5 | Only a 5-tile radius around Nib is lit, plus lures and vents. |

### 6.3 Bosses

Every boss is a **3-hit, 3-phase** fight in a single fixed-camera arena. No health bars for the player to read — damage is communicated by the boss visibly breaking.

| World | Boss | Arena | Pattern |
|---|---|---|---|
| 1 | **The Hermit King** | Tide pool bowl, 3 platforms | P1: charges wall to wall, exposing his soft back after each bonk. P2: adds thrown rocks in arcs. P3: charges faster, spawns two Snappers. **Hit:** stomp the exposed back. |
| 2 | **The Kelp Warden** | Vertical shaft, currents | A knot of kelp at the top; four Whipkelp arms lash the shaft. **Hit:** ink each arm's base, then dash into the exposed core. P3 adds a downward current you must dash against. |
| 3 | **The Drowned Captain** | Ship's wheel room, tilting floor | Ghost that phases through the arena; his **lantern** is the hitbox and it stays corporeal. Floor tilts on a 200-frame cycle, sliding Nib. P3: lantern splits into three, one real. **Hit:** ink the true lantern. |
| 4 | **The Vent Lord** | Circular vent chamber, rising magma | Magma worm that surfaces from one of five vents, telegraphed 45 frames by rumble + particles. **Hit:** stomp the head in the 30-frame window while it's cresting. Magma rises one tile per hit — the arena shrinks as you win. |
| 5 | **The Kraken** | Full-screen, dark, 3 stages | P1: two tentacles sweep, ink the suckers. P2: the beak lunges from the dark; dash-dodge and stomp the beak. P3: all eight tentacles + Bone Shrimp + the eye opens. **Hit:** dash into the eye at the apex of a Hookline ride. Three hits, no checkpoint, ~3 minutes. |

---

## 7. Level design

Five levels, one per world. Target **3–5 minutes** each for a clean run, **8–15 minutes** including a first-time player's deaths.

### 7.1 Structure of a level

```
[ START ]──▶ Section A ──▶ ◆CP1 ──▶ Section B ──▶ ◆CP2 ──▶ Section C ──▶ ◆CP3 ──▶ [ BOSS ] ──▶ [ EXIT ]
             teach            test           complicate            gauntlet
```

- **Section A — teach.** The world's new mechanic is introduced in a safe room where failure costs nothing. No enemies on the first screen. Ever.
- **Section B — test.** The mechanic under time or space pressure, with one enemy type layered in.
- **Section C — complicate.** The new mechanic combined with a mechanic from a previous world.
- **Boss.** Uses the mechanic as its solution.

Each level hides **3 pearls**. Roughly: one findable by curiosity (look up, go left), one requiring a hard optional route, one **requiring an upgrade from a later world** (see §8.5).

**Pickups and small-only passages.** Every level places 4–6 Ink Bulbs (§4.4), at least one shortly after each checkpoint and at least one hidden, plus **1–2 Ink Cores** from World 3 onward (hidden-only in Worlds 1–2). Every level also contains **1–2 one-tile passages that only Spent Nib fits through** — optional shortcuts and speedrun routes, never mandatory, with exactly one pearl behind one in the whole game (W5 ②). A player who never gets hit never needs them; a player who does gets handed a small consolation.

**Where Ink Cores go.** Never immediately before a boss door — a Charged run at a boss trivialises a fight built around a 30-frame window. They go **before a long gauntlet section**, so the reward is spent on traversal and crowds rather than on the encounter the level was built to test.

### 7.2 Level 1 — The Tide Pools

**Palette:** warm sun-bleached coral, turquoise shallows, cream sand.
**New mechanic:** the ink dash itself.
**Enemies:** Snapper, Drifter, Puffer. **Hazards:** urchins, collapsing sand, crush clam.

| Beat | Content |
|---|---|
| A1 | Empty sunlit shelf. One 6-tile gap that is **impossible to jump** — the game's first lesson is that jumping alone is not enough. Dash prompt appears once. |
| A2 | Three ascending ledges requiring up-dash. Shells laid on the correct arc as a breadcrumb trail. |
| A3 | First Snapper, alone, on flat ground. First stomp. Ink pip refunds visibly. |
| A4 | **Ink Bulb taught before it is needed.** A Snapper on a ledge is positioned so most players take their first hit here and shrink; a bulb sits in plain sight 4 tiles on. Players who don't get hit collect it as points and learn what it looks like anyway. |
| ◆CP1 | Conch on a rock. |
| B1 | Tide pool — first water. Swim controls introduced with no threat present. Buoyancy taught by a single vertical shaft. |
| B2 | Drifters over a pit. Not stompable. The only route is dash-past, spending 2 pips with 1 in reserve. |
| B3 | Puffers on a narrow shelf; read the inflate cycle or die. |
| ◆CP2 | |
| C1 | Collapsing sand bridge over urchins. 24-frame footing. Run, don't think. |
| C2 | Crush clam corridor: three clams on offset cycles. Closed shells are the only footing. |
| C3 | Long dash gauntlet: 4 gaps, 3 pips, one Snapper mid-way whose stomp refunds the pip you need. **This is the level's thesis statement.** |
| ◆CP3 | Boss door. |
| BOSS | The Hermit King. |

**Pearls:** ① above the A2 ledges, reachable by an up-dash from the top step. ② behind a false wall in the B1 pool, hinted by a bubble stream going nowhere. ③ across a 12-tile gap in C1 — **requires Deep Jet (W5)**.

### 7.3 Level 2 — The Kelp Forest

**Palette:** deep greens, olive, filtered god-rays, black silhouette kelp in the foreground.
**New mechanic:** **currents** + the **Ink Shot** (unlocked at the end of W1 — the player arrives already holding it).
**Enemies:** Barb Turret, Whipkelp, Eel, Drifter. **Hazards:** currents, bubble streams.

| Beat | Content |
|---|---|
| A1 | Vertical kelp shaft, gentle updraft. Ink Shot taught on a lone destructible kelp knot. |
| A2 | Current maze — three chambers with perpendicular flows. Dash is the only way to cross a strong current. |
| B1 | Barb Turret corridor: two turrets on offset cycles, 5 tiles apart. Pure timing. |
| B2 | Whipkelp grove — four stalks over a pit. Shoot the bases or thread the arcs. Both routes are viable; the shooting route is slower and safer. |
| ◆CP2 | |
| C1 | Eel channel: three sockets in a flooded tunnel. Bait, retreat, pass during the 90-frame retract. |
| C2 | Bubble ladder up a strong downdraft. Bubbles pop after one use; a mistimed jump means falling the whole shaft. |
| C3 | Combined: current + turret + drifters in one 3-screen ascent. |
| BOSS | The Kelp Warden. |

**Pearls:** ① at the bottom of the A2 current maze, against the flow. ② inside a kelp knot only destroyable by Ink Shot, off the main path in B2. ③ behind a cracked wall in C1 — **requires Ink Bomb (W3)**.

### 7.4 Level 3 — The Sunken Ship

**Palette:** rotting brown wood, verdigris brass, cold blue-grey water, one warm lantern amber.
**New mechanic:** **Cling** (W2 upgrade) + hazard-as-platform (Hookline).
**Enemies:** Ghost Diver, Hookline, Snapper, Barb Turret. **Hazards:** crush clams, bubble streams, flooding.

| Beat | Content |
|---|---|
| A1 | The hull breach. Cling taught on a single wall with no threat. 60 frames of grip, then you slide. |
| A2 | Cargo hold: a shaft of stacked crates, cling-and-dash upward. |
| B1 | First Ghost Diver. It comes through the wall. There is no fight — the room's exit is 8 tiles away and it takes exactly long enough to be terrifying. |
| B2 | Deck: three Hooklines sweeping. Ride the flat tops across a 20-tile gap. |
| ◆CP2 | |
| C1 | **The flood.** The captain's quarters fill with water at 0.2 px/f. Water rises, so does the player. Swim physics under a hard timer, two Ghost Divers phasing through. |
| C2 | Brass corridor: cling-only ceiling traverse over urchins, Barb Turrets firing along the floor. |
| C3 | The powder magazine — cracked walls, crush clams, and a Ghost Diver that follows you into the boss door. |
| BOSS | The Drowned Captain. |

**Pearls:** ① in a crate at the bottom of the A2 shaft, requires descending against progress. ② visible in the flooded room C1 — grabbing it costs you the rising-water lead. ③ in the powder magazine behind heat-fused debris — **requires Heat Shell (W4)**.

### 7.5 Level 4 — The Volcanic Vents

**Palette:** black basalt, magma orange, sulphur yellow, heavy red rim-light. High contrast, low mid-tones.
**New mechanic:** **rising magma** (one-way vertical pressure) + **Ink Bomb** (W3 upgrade).
**Enemies:** Magma Snail, Cinder Moth, Snapper, Eel. **Hazards:** rising magma, collapsing sand (ash), superheated water.

| Beat | Content |
|---|---|
| A1 | Vent field. Ink Bomb taught on a cracked basalt wall. Radial blast; 1 pip, 20-frame fuse. |
| A2 | First Magma Snail — blocks a corridor with its armored face. The only answer is to get behind it. |
| B1 | **First magma rise.** A 4-screen vertical climb with the floor of the world following you at 0.25 px/f. No enemies — the magma is the enemy. |
| B2 | Cinder Moth patrol over ash bridges. Embers set the ash alight; the bridge you planned on may not be there. |
| ◆CP2 | |
| C1 | Superheated water pools — swimmable for 90 frames before a scald timer kills you. Cross in stages, surfacing to reset. |
| C2 | Snail-and-bomb puzzle: use an Ink Bomb to open a wall, a Snail's own body as a platform, and a Moth's ember to light a fuse. |
| C3 | Second magma rise, this one with Eels in the walls and two mandatory Ink Bomb walls. Fastest ascent in the game. |
| BOSS | The Vent Lord. |

**Pearls:** ① off the side of the B1 climb — costs you ~3 seconds of magma lead. ② inside a Snail's shell, requiring you to kill one in a specific spot. ③ under a permanent magma pool at the bottom of C1 — **requires Heat Shell (W4, earned on this level's completion)**, so this is the first pearl a player is likely to realise they must come *back* for.

### 7.6 Level 5 — The Abyss

**Palette:** near-black, bioluminescent cyan and magenta accents, no ambient light. The most restrained palette in the game — often 3 colours on screen.
**New mechanic:** **darkness** + **pressure crush** + **Deep Jet** (2-charge dash, earned mid-level).
**Enemies:** Lightless, Bone Shrimp, Eel, Hookline. **Hazards:** darkness, pressure, currents.

| Beat | Content |
|---|---|
| A1 | The lightless drop. A 6-screen descent with a 5-tile light radius. Slow, quiet, no enemies. The scariest room in the game is empty. |
| A2 | First Lightless. Only its lure is visible. Enter the light, get charged. |
| B1 | Vent chamber: Bone Shrimp swarms pour out until each vent is inked shut. Pure resource drain — 3 pips against 6 vents means routing, not fighting. |
| B2 | **Deep Jet acquired** — a bioluminescent nodule grants a 2nd dash charge (`INK_MAX` → 4, `DASH_COOLDOWN` → 6). The remaining rooms are built for it and are impossible without it. |
| ◆CP2 | |
| C1 | **Pressure room.** Standing still > 180 frames kills. A horizontal chase with Hooklines and no safe ledge. |
| C2 | The Lightless gallery — five of them in a large dark room with one safe path lit only by their own lures. |
| C3 | Final ascent to the Kraken's shelf: every mechanic in the game, in sequence, in 90 seconds. Current, magma-analog (cold vent), cling, bomb, hookline, dash chain. |
| ◆CP3 | Boss door. The only checkpoint of the last third. |
| BOSS | The Kraken. |

**Pearls:** ① in the A1 descent, in total darkness, findable only by the sound cue (§10.3). ② in the B1 vent chamber, behind the last vent, **through a 1-tile crack that only Spent Nib fits through** — in the abyss, on 2 pips, which means most players must deliberately take a hit to reach it. The only pearl in the game gated on being small. ③ in C2, inside a Lightless's own light radius — you have to walk into the thing that kills you.

### 7.7 Difficulty curve

```
Difficulty
  ▲
  │                                              ╱▔▔● Kraken
  │                                        ╱▔▔╲╱
  │                              ╱▔▔●─────╯  W5
  │                        ╱▔▔╲╱   W4
  │              ╱▔▔●─────╯
  │        ╱▔▔╲╱   W3
  │  ╱▔▔●─╯
  │╱  W2
  ●─────────────────────────────────────────────────▶
  W1                                            time
   ▲ Each ● is a boss. Note the dip after every boss —
     the next world's Section A always eases off before
     climbing higher than the last peak.
```

The **saw-tooth is mandatory**. A monotonic ramp exhausts the player. Every world opens easier than the previous world's boss and closes harder.

---

## 8. Progression & meta systems

### 8.1 Shells (currency & score)

- **Shells** are the coin analog — small spiral shells scattered along optimal routes. They are a *breadcrumb system first, score second*: shell placement teaches the intended path.
- 100 shells = 1 extra life. Shells reset on continue.

### 8.2 Score & local high scores

| Source | Points |
|---|---|
| Shell | 10 |
| Enemy stomped | 100 |
| Enemy inked | 50 |
| Stomp chain (per link, no ground contact) | 100 → 200 → 400 → 800 → 1000 (cap) |
| Pearl | 5,000 |
| Level clear | 1,000 + (remaining time in seconds × 50) |
| Enemy killed by a Charged dash | 150 <small>(a Charged dash-through chain counts as a stomp chain)</small> |
| Ink Bulb / Ink Core collected at that tier already | 1,000 / 2,000 |
| No-damage level clear <small>(never dropped a tier)</small> | 5,000 |
| No-death level clear | 10,000 |
| Boss defeated | 5,000 |

- Local high-score table: top 10 runs, `{ score, character, date, levelsCleared, deaths }`, in `localStorage`.
- Score is displayed in the HUD and on the level-clear screen with an itemised tally that counts up (with a sound per tick — it is 60% of the reward).

### 8.3 Pearls (collectibles)

- **3 per level, 15 total.** Persistent across runs — once found, always found.
- Tracked on the **world map**: each level node shows `○○○` filling in as `●`.
- Each pearl grants **1 extra life** on the run in which it's first collected.
- **All 15 pearls** unlocks the character **Octo** (§8.6) and the true ending: an epilogue screen showing what happened to Nib's siblings.

### 8.4 Speedrun timer

- **Per-level** and **full-run** timers, frame-accurate, stored as personal bests per character.
- Optional always-on HUD display (Options → Timer: Off / Level / Run / Both).
- Timing rules, stated explicitly in Options so the community doesn't have to guess:
  - Level timer starts on the first frame Nib is controllable, stops on contact with the level-exit trigger.
  - **Boss fights are inside the level timer.** The clock does not stop at the boss door, and it does not stop for the boss's intro animation — a boss is part of the level and is routable like anything else.
  - Run timer is the **sum of level timers** — menus, deaths, and load are excluded. (This makes routing, not menuing, the skill.)
  - Deaths do not stop the level timer.
- A **ghost** of the player's personal best for the current level renders as a translucent silhouette. Off by default.
- Splits shown on the level-clear screen: `−2.31` in green, `+4.02` in red.

### 8.5 Ink upgrades

One permanent upgrade per world, granted on world clear (except Deep Jet, found mid-level 5). Upgrades are **the backtracking engine**: each unlocks pearls in earlier worlds.

| Upgrade | Earned | Effect | Unlocks pearls in |
|---|---|---|---|
| **Ink Shot** | Clear W1 | Ranged ink bolt. 1 pip. Kills Drifter/Whipkelp/Bone Shrimp, stuns Eel 90f, breaks kelp knots. `speed 4.0, arc gravity 0.12`. | W1 (none), W2 ② |
| **Cling** | Clear W2 | Grip any wall for 60 frames, then slide at 1.2 px/f. Re-grip costs 1 pip. | W3 ①, W1 ② (alternate route) |
| **Ink Bomb** | Clear W3 | Lobbed charge, 20-frame fuse, 3-tile radius. 1 pip. Breaks cracked terrain, kills anything unarmored. | W2 ③, W4 ② |
| **Heat Shell** | Clear W4 | A hardened ink layer. **Immunity to heat**: superheated water, Cinder Moth embers, and magma splash no longer harm Nib, and he survives standing in magma itself for 90 frames. Also lets him pass heat-fused debris. | W3 ③, W4 ③ |
| **Deep Jet** | Mid-W5 | `INK_MAX` 3 → 4, `DASH_COOLDOWN` 10 → 6, `DASH_SPEED` +0.6. | W1 ③, W5 ①②③ |

**Design note — upgrades and tiers are different currencies.** Heat Shell used to absorb a hit; the tier system (§4.4) does that job now, so Heat Shell is a **pure traversal upgrade**. The rule that falls out of it: **no permanent upgrade ever changes how many hits Nib can take, and no tier is ever permanent.** Upgrades are things you keep and route with; tiers are things you find and lose. Deep Jet owns pip count, Charged owns dash damage, and the two never overlap — a player who has both has learned two separate lessons.

### 8.6 Unlockable characters *(Phase 2)*

Specced now, built in the phase after the base game ships. Each is a **movement re-tuning**, not a skin — they change how the same 5 levels play, which is where the replay value actually lives.

| Character | Unlock condition | Differences |
|---|---|---|
| **Nib** (squid) | Default | The baseline all levels are tuned against. |
| **Octo** (octopus) | Collect all 15 pearls | `INK_MAX` 4, `WALK_MAX` 1.3, `JUMP_IMPULSE` −4.1, **native Cling with no pip cost and no 60-frame limit**. Slower and floatier; trades speed for total wall control. Trivialises some vertical rooms, struggles in every current. |
| **Cuttle** (cuttlefish) | Beat the game in under 25 minutes | Hold Jump at fall apex to **glide** at `TERMINAL_FALL 1.4`. `DASH_SPEED` 4.2 (weaker), `INK_MAX` 2. A control character — long, precise, low-power. |
| **Nautilus** | Beat the game without dying | **Four tiers** — his shell cracks through two visible stages before he is exposed — but he **cannot reach Charged**: an Ink Core is only points to him. `GRAVITY` 0.52, and **cannot dash upward**, only the six non-upward directions. He never shrinks small enough for a 1-tile gap either, so every small-only shortcut is closed. The tank: more hits, no offense, fewer routes. |

Rules:
- Character select on the title screen once any is unlocked; the choice persists.
- **Separate high scores and speedrun PBs per character.** A run's character is stamped on its leaderboard row.
- **Every level must be completable by every character.** This is a hard constraint on Phase 2 and will require alternate routes in at least W2 (currents vs. Octo) and W5 (up-dash vs. Nautilus). Levels get patched, not characters nerfed.
- No character is strictly better. If playtest shows one dominating, retune rather than gate.

### 8.7 Save data

Single `localStorage` key, versioned, with a migration path.

Every level is keyed by a **stable string id**, never an array index — 50 levels will be reordered, renamed and inserted between, and an index-keyed save would silently attribute one level's records to another. Unknown ids are preserved on load, not dropped, so an older build never destroys a newer build's progress.

```jsonc
// key: "inkfall.save.v1"
{
  "version": 1,
  "progress": {
    "cleared": ["w01-tidepools", "w02-kelp"],   // stable ids, order-independent
    "unlocked": ["w01-tidepools", "w02-kelp", "w03-ship"],
    "upgrades": ["inkShot", "cling"],
    "pearls": { "w01-tidepools": [true, true, false],
                "w02-kelp":      [false, false, false] },
    "trueEndingSeen": false
  },
  "characters": {
    "unlocked": ["nib"],
    "selected": "nib"
  },
  "records": {
    "highScores": [ { "score": 84300, "character": "nib", "date": "2026-08-23",
                      "levelsCleared": 5, "deaths": 41 } ],
    "bestTimes": {
      "nib": { "w01-tidepools": 187.42, "w02-kelp": 244.10, "fullRun": null }
    }
  },
  "settings": {
    "keybinds": { "jump": ["Space", "KeyZ"], "dash": ["KeyX", "Slash"] },
    "timerDisplay": "off",        // off | level | run | both
    "ghost": false,
    "screenShake": 1.0,           // 0.0 .. 1.0
    "flashReduction": false,
    "musicVolume": 0.7,
    "sfxVolume": 0.9,
    "assistMode": false
  }
}
```

Corrupt or unparseable save → fall back to defaults and show a single non-blocking toast. **Never** clear the key automatically; write the corrupt blob to `inkfall.save.v1.bak` first.

---

## 9. Art direction

### 9.1 Rules

- **Everything is authored in code.** Sprites are palette-indexed arrays in TypeScript. No PNGs, no sprite sheets, no external assets, no build-time image processing.
- **Internal resolution: 320 × 180.** Integer-scaled to the window (×2, ×3, ×4…) with letterboxing. Never non-integer scaled — pixel shimmer is unacceptable.
- **Tile size: 16 × 16.** The camera shows 20 × 11.25 tiles.
- **Palette discipline (NES-inspired, not NES-bound):** a global 48-colour master palette. Each world draws from a **12-colour sub-palette**; each sprite uses **at most 4** (3 + transparent). This constraint is what will make the game look coherent rather than like a hobby project.
- **All rendering snaps to integer pixels.** Camera position, entity position, and particle position are floored at draw time. Sub-pixel motion is preserved in state, never in presentation.

### 9.2 Sprite budget

| Subject | Cell | Frames |
|---|---|---|
| Nib — idle | 16×16 | 2 (mantle pulse, 30f each) |
| Nib — walk/scud | 16×16 | 4 |
| Nib — rise / fall | 16×16 | 1 + 1 |
| Nib — dash | 16×16 | 2 + a 3-frame ink-trail particle |
| Nib — swim | 16×16 | 4 |
| Nib — cling | 16×16 | 2 |
| Nib — hurt / death | 16×16 | 1 + 6 |
| **Spent Nib — full set** | 12×12 | **~16** (idle, walk, rise, fall, dash, swim, cling, death) |
| **Charged Nib** | 16×16 | **~6** — a recolour of the Full set (darker, hard sheen) with a unique dash and idle pulse, not a full redraw |
| **Shrink transition** | 16×16 | 4, plus the ink-cloud burst |
| Ink Bulb / Ink Core | 16×16 | 3 + 4 (pulse) |
| Each standard enemy | 16×16 | 2–4 |
| Puffer / Magma Snail | 24×16 | 4–6 |
| Bosses | 48×48 to 128×96 | 8–16 |
| Tiles per world | 16×16 | ~24 |
| UI glyphs & font | 8×8 | full ASCII |

**Total estimate: ~455 sprite frames.** At ~256 bytes each as packed nibble arrays, well under 200 KB uncompressed. The Spent-tier set is the largest single addition; it is drawn from the same 4-colour sub-palette as Full Nib, one shade paler. Charged is a palette swap plus a handful of unique frames — a third tier costs far less art than a third character.

### 9.3 World palettes

| World | Mood | Key colours |
|---|---|---|
| 1 Tide Pools | Warm, open, safe | `#f4e4c1` sand, `#4fc3d9` shallow, `#e8825a` coral, `#2a7f8f` shade |
| 2 Kelp Forest | Filtered, close | `#1e4d3a` kelp, `#7fb069` frond, `#0d2a1f` silhouette, `#c8e6a0` god-ray |
| 3 Sunken Ship | Cold, decayed, one warm point | `#5a4632` wood, `#4a8f7b` verdigris, `#2c3e50` water, `#ffb347` lantern |
| 4 Volcanic Vents | Violent, high-contrast | `#1a1a1a` basalt, `#ff6b35` magma, `#ffd23f` sulphur, `#8b2c1f` rock |
| 5 The Abyss | Near-monochrome, alien | `#050508` void, `#00e5cc` bio-cyan, `#e040fb` bio-magenta, `#1a1a2e` shape |

### 9.4 Camera

- Horizontal: **lookahead** — the camera leads Nib by 32 px in his facing direction, easing over 20 frames. Prevents the "wall of unknown" on the leading edge.
- Vertical: a **dead zone** of 48 px; the camera only follows vertically outside it, and snaps harder when grounded to avoid seasickness on jumps.
- Boss arenas and pressure rooms lock the camera.
- **Screen shake** on boss hits, magma rise, and Kraken phases. Amplitude scales with the `screenShake` setting, which can be set to 0.

### 9.5 Feel & juice

Non-negotiable, because they cost little and carry most of the game's feel:

- Ink dash leaves a 6-frame fading ink trail and a 4-particle burst at origin.
- Landing from > 4 tiles kicks up 3 dust/silt particles.
- Stomping freezes the frame for **3 frames** (hitstop) and squashes the enemy sprite vertically before the death animation.
- Collecting a shell pops the sprite up 4 px and fades over 12 frames.
- Death ink-clouds the screen from Nib's position, holds 30 frames, then wipes.
- **Shrinking** is 4 frames of hitstop, a radial ink burst, and the 90 i-frames rendered as a 4-frame flicker. Growing from an Ink Bulb reverses it with a rising two-note sting.
- Taking the last pip flashes the meter and desaturates Nib's mantle by 30%.

---

## 10. Audio

### 10.1 Rules

**All audio is synthesised at runtime via the Web Audio API.** No audio files. The synth emulates a 4-channel NES APU: 2 pulse (12.5/25/50/75% duty), 1 triangle, 1 noise. Music is authored as tracker-style data in TypeScript.

This keeps the bundle tiny, avoids licensing entirely, and produces a sound that matches the art.

### 10.2 Music

| Track | Length | Character |
|---|---|---|
| Title | 40 s loop | Slow, curious, single melody over a triangle bass |
| World 1 | 60 s loop | Bright, bouncy, major key — the only genuinely happy track |
| World 2 | 70 s loop | Modal, drifting, syncopated bass |
| World 3 | 70 s loop | Waltz in 3/4, minor, a broken music-box motif |
| World 4 | 60 s loop | Fast, driving, heavy noise-channel percussion |
| World 5 | 90 s loop | Sparse, arrhythmic, mostly triangle and silence |
| Boss | 50 s loop | Shared across W1–4, transposed up a step each world |
| Kraken | 100 s loop | 3 sections that hard-switch on phase change |
| Level clear | 6 s | |
| Game over | 5 s | |
| True ending | 45 s | World 1's melody, slowed, in a minor key |

### 10.3 SFX

Jump · swim stroke · **ink dash (the game's signature sound — a wet pressurised burst)** · dash into wall (bonk) · stomp · enemy death · ink shot · ink bomb · cling grip · cling slip · **shrink (a descending wet gasp)** · **grow from Ink Bulb (rising two-note sting)** · **Ink Core (a low resonant thud, the only bass-heavy SFX in the game)** · **charged dash (the dash sound an octave lower, with noise-channel grit)** · shell pickup (pitch rises with combo) · **pearl (a distinct 3-note chime audible from 6 tiles away, even off-screen — this is a gameplay mechanic, not decoration)** · checkpoint · hurt/death · boss hit · boss death · magma rumble · pressure warning (a heartbeat that quickens) · menu move/confirm/back.

### 10.4 Audio policy

- Audio context is created only after the first user gesture (browser autoplay policy). The title screen's "Press Space" doubles as that gesture.
- Music and SFX volumes are independent, persisted, and both reachable from the pause menu.
- Muting must be a single keystroke (`M`) at any time.

---

## 11. UI / UX

### 11.1 Screens

```
  ┌─────────┐   ┌────────────┐   ┌───────────┐   ┌────────────┐
  │  TITLE  │──▶│ WORLD MAP  │──▶│   LEVEL   │──▶│LEVEL CLEAR │
  └────┬────┘   └─────┬──────┘   └─────┬─────┘   └──────┬─────┘
       │              │                │  ▲             │
       ▼              ▼                ▼  │             ▼
  ┌─────────┐   ┌────────────┐   ┌───────────┐   ┌────────────┐
  │ OPTIONS │   │CHARACTER   │   │   PAUSE   │   │ GAME OVER  │
  │ SCORES  │   │SELECT (P2) │   └───────────┘   └────────────┘
  └─────────┘   └────────────┘
```

- **Title** — logo, `PRESS SPACE`, then Start / Continue / Scores / Options. Attract mode after 30 s idle: a recorded demo of a World 1 section.
- **World map** — nodes on a vertical descent line, drawn as a cross-section of the ocean. Locked nodes are dark. Each node shows pearls `●●○`, best time, and the world name. This is where progression is *felt*. **Any cleared level can be replayed freely** — this is required, not optional, because five of the fifteen pearls are gated behind upgrades from later worlds (§8.5) and would otherwise be unreachable. Replaying a cleared level never re-locks anything and never costs a continue; it starts a fresh score and can set a new personal best.
  - The map is **data-driven and vertically scrollable from day one**, not five hard-coded nodes — see §12.7.
- **Pause** — Resume / Restart Level / Options / Quit to Map. Restart requires a confirm.
- **Level clear** — itemised score tally that counts up, split vs. PB, pearls found this level.
- **Game over** — score, continues remaining, Continue / Quit.

### 11.2 HUD

Minimal, top strip, 16 px tall, never overlapping playfield geometry:

```
 ┌──────────────────────────────────────────────────────────────┐
 │ 🦑×3   ●●○         ⬤ 042        SCORE 12,340      ◇◇○   1:47 │
 │ lives  ink pips    shells        score            pearls  time│
 └──────────────────────────────────────────────────────────────┘
```

- The ink meter is the largest HUD element and sits closest to the playfield — it is the thing the player must read mid-air. **It doubles as the health display**, so tier costs no extra HUD real estate and is read where the player is already looking:
  - **Spent** — the third pip slot draws as a broken outline: `● ● ⊘`
  - **Full** — three ordinary teardrops: `● ● ●`
  - **Charged** — the same three, hardened: filled black with a bright rim, faintly pulsing: `◆ ◆ ◆`
- Timer only renders if enabled in Options.
- HUD fades to 40% opacity when Nib is within 24 px of it.

### 11.3 Onboarding

No tutorial screens, no text boxes. Everything is taught by level geometry (§7.1). The **only** text prompts in the entire game are one-time key hints on first encounter — `[X] INK DASH`, `[C] INK SHOT` — rendered small, near Nib, for 180 frames, once ever.

---

## 12. Technical architecture

### 12.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict: true` | |
| Build | Vite | Fastest dev loop, trivial static output |
| Rendering | Canvas 2D | Sufficient for 320×180 at 60 fps; WebGL is unjustified complexity here |
| Audio | Web Audio API | |
| Runtime deps | **Zero** | A design pillar, not an accident |
| Dev deps | vite, typescript, vitest, eslint, prettier | |
| Hosting | Any static host | The build output is HTML + one JS bundle |

### 12.2 Module layout

```
inkfall/
├── index.html
├── package.json
├── vite.config.ts
├── docs/
│   └── PRD.md
└── src/
    ├── main.ts                 # bootstrap, canvas setup, scale
    ├── engine/
    │   ├── loop.ts             # fixed-timestep accumulator
    │   ├── input.ts            # keyboard state, buffering, remap
    │   ├── renderer.ts         # palette blit, integer snap, letterbox
    │   ├── sprite.ts           # packed sprite decode + draw
    │   ├── audio/
    │   │   ├── apu.ts          # pulse/triangle/noise voices
    │   │   ├── tracker.ts      # pattern playback
    │   │   └── sfx.ts
    │   ├── camera.ts
    │   ├── particles.ts
    │   └── save.ts             # localStorage schema + migration
    ├── game/
    │   ├── state.ts            # screen state machine
    │   ├── physics.ts          # constants (§4.3), integration
    │   ├── collision.ts        # swept AABB vs tilemap
    │   ├── player.ts           # Nib state machine, ink meter
    │   ├── enemies/            # one file per enemy
    │   ├── bosses/             # one file per boss
    │   ├── hazards.ts
    │   ├── pickups.ts
    │   └── score.ts
    ├── content/
    │   ├── palettes.ts
    │   ├── sprites/            # pixel data
    │   ├── chapters/           # tileset + palette + music, shared by N levels
    │   ├── levels/
    │   │   ├── format.ts       # ASCII grid parser + legend
    │   │   ├── index.ts        # id -> LevelDef registry, the map reads this
    │   │   ├── w01-tidepools.ts … w05-abyss.ts
    │   └── music/
    └── ui/
        ├── hud.ts
        ├── title.ts
        ├── worldmap.ts
        ├── pause.ts
        └── options.ts
```

### 12.3 The game loop

Fixed timestep, decoupled render. **Non-negotiable** — variable-timestep physics makes a precision platformer non-deterministic, which breaks speedrun timing, ghost replay, and reproducible bug reports.

```ts
const STEP = 1000 / 60;
let accumulator = 0, previous = performance.now();

function frame(now: number) {
  accumulator += Math.min(now - previous, 250); // clamp: never spiral on tab-restore
  previous = now;
  while (accumulator >= STEP) {
    input.beginStep();
    world.update();          // exactly one 60 Hz tick
    accumulator -= STEP;
    frameCounter++;
  }
  renderer.draw(world);      // no interpolation — pixel art snaps to integers
  requestAnimationFrame(frame);
}
```

Rendering does **not** interpolate. At 320×180, sub-pixel interpolation produces visible shimmer that is worse than the 60 Hz judder it fixes.

### 12.4 Collision

- **Swept AABB against the tilemap**, resolved on X then Y, with a maximum sub-step of 8 px per axis per frame to guarantee no tunnelling at `DASH_SPEED` or `TERMINAL_FALL`.
- Tile types: `EMPTY`, `SOLID`, `ONEWAY` (pass from below, land from above), `WATER`, `HAZARD`, `CRUMBLE`, `CURRENT(dir, force)`, `ICE`-analog (`SLICK`, algae).
- **Hitboxes are smaller than sprites.** Nib's sprite is 16×16; his hitbox is **12×14**, centred, with a **2 px forgiveness inset** on hazard collisions only. Enemy hurtboxes are 2 px smaller than their sprites; enemy *hitboxes* (the stompable top) extend 2 px above. Together this is what makes the game feel fair. Debug overlay (`F1`) draws all boxes.
- Entity-vs-entity is simple AABB — entity counts are low enough that no spatial partition is needed.

### 12.5 Level format

Levels are **ASCII grids in TypeScript** — readable in a diff, editable in any editor, no tooling required.

```ts
export const tidepools: LevelDef = {
  id: "w01-tidepools",        // stable forever — save data keys on this
  name: "The Tide Pools",
  chapter: "shallows",        // chapter owns palette, tileset and music
  order: 10,                  // sparse, so levels can be inserted between
  // legend: '.' empty  '#' solid  '-' oneway  '~' water  '^' hazard
  //         'c' crumble '>' current-right  'S' start  'E' exit  'K' checkpoint
  tiles: [
    "....................................",
    "..........................#####.....",
    "....S.....................#...#.....",
    "..#####......^^^......--..#...#..E..",
    "..#####################..######.....",
  ],
  entities: [
    { type: "snapper", x: 12, y: 3, patrol: [10, 16] },
    { type: "drifter", x: 22, y: 2, amplitude: 3, period: 120 },
    { type: "pearl",   x: 27, y: 2, id: 0 },
    { type: "inkBulb", x: 16, y: 3 },
    { type: "shell",   x: 8,  y: 3 },
  ],
  checkpoints: [{ x: 14, y: 3 }, { x: 26, y: 3 }],
  boss: "hermitKing",
};
```

Coordinates in the `entities` array are **tile coordinates**, not pixels. A parser in `format.ts` validates on load and throws loudly in dev on an unknown legend character or an out-of-bounds entity.

**One concept, one home.** The grid carries *geometry* — terrain plus the three markers that are positions in the world: `S` start, `E` exit, `K` checkpoint. The `entities` array carries everything that *acts or is collected*: enemies, hazards with state, shells, pearls, Ink Bulbs, Ink Cores. Nothing may be authored in both. The sketch above showed checkpoints as a separate array as well as a legend character; that was two authorities for one fact, and a level with three conches in the grid and two in the list is a bug nobody would find. There is no `checkpoints:` field.

Validation runs at two levels, because a physics fixture is a grid but not a level:

- `loadLevel` — structural. Rejects ragged rows, unknown glyphs, two starts, entities outside the grid or buried in solid tiles, backwards patrol ranges, duplicate pearl slots, a non-positive Drifter period.
- `loadCampaignLevel` — the rules a *shipped* level must also satisfy: it can be finished (an exit or a boss), it has exactly two conches plus one at the boss door, exactly three pearls, and an Ink Bulb count inside §4.5's range.

### 12.6 Performance budget

| Budget | Limit |
|---|---|
| Frame time | ≤ 8 ms at 60 Hz (50% headroom) |
| Active entities | ≤ 64 |
| Particles | ≤ 256, pooled, zero allocation in steady state |
| Bundle (gzipped) | ≤ 1.5 MB |
| Cold load to title | ≤ 1 s on a 10 Mbps connection |
| GC pressure | **Zero allocations in the update loop.** All entities and particles pooled and reused. |

`F1` opens a debug overlay: frame time graph, entity count, hitboxes, tile grid, Nib's velocity and state.

### 12.7 Designing for 50 levels

v1 ships five levels. The long-term target is roughly **50**. Nothing below is built in v1 — these are the constraints v1 must respect so that scaling later is content work rather than a rewrite. Each one is cheap now and expensive to retrofit.

| Constraint | v1 rule | What it prevents at 50 |
|---|---|---|
| **Stable string ids** | Levels are `"w01-tidepools"`, never index `1`. Save data, records and map nodes key on the id. | Reordering or inserting a level silently reassigning another level's pearls and PBs. |
| **No per-level code** | Level-specific behaviour goes through the typed `entities` list. If a level needs something new, it becomes a reusable entity type, never a bespoke module. | 50 one-off level modules, each its own bug surface. |
| **Chapters own tilesets, music and palettes — not levels** | v1's five levels are five chapters of one level each. The 50-level shape is ~8–10 chapters of 5–6 levels sharing a tileset. | 50 tilesets and 50 tracks: an unbuildable art and audio budget, and a bundle far past 1.5 MB. |
| **Data-driven, scrollable world map** | Built to render an arbitrary node list from day one, even while there are only five. | Rewriting the progression UI the first time a sixth level exists. |
| **Forward-compatible saves** | Unknown level ids are preserved, not dropped. Schema is versioned with a migration path. | An older build wiping a newer build's progress. |
| **Sublinear enemy roster** | 12 enemies for 5 levels. 50 levels needs roughly 30, not 120 — reuse in new combinations is the design, per §6.1's "one enemy, one lesson". | Roster bloat that dilutes every enemy's identity. |
| **CI reachability budget** | The completability test (§12.8) runs all levels in under 30 s at 5 levels, and must stay under 2 min at 50. | A validation suite too slow to run, therefore not run. |

**The authoring tool is the real bottleneck.** Hand-typing ASCII grids is fine for five levels and untenable for fifty. The in-repo sprite editor already planned as a risk mitigation (§15) must be extended in M6 to a **level editor that reads and writes the exact `LevelDef` format** — a browser page in the repo, not a product feature (§1.4). Without it, levels 6–50 are not a scope question, they are an impossibility.

**Explicitly deferred to a future version:** overworld branching, per-chapter bosses versus per-level bosses, whether 50 levels keeps 3 pearls each (150 is too many — likely 3 per chapter), and how the run timer's full-run category works across 50 levels.

### 12.8 Testing

| Layer | Tool | Coverage target |
|---|---|---|
| Physics & collision units | Vitest | 90% — swept AABB, one-way tiles, water entry, dash carryover, and every §4.3 feel guarantee asserted as a test |
| Save schema & migration | Vitest | 100% — including corrupt-blob fallback |
| Level validation | Vitest | Every level parses; every level is provably completable by an automated reachability check **at the Spent tier** — a section that requires 3 pips is a bug, since a player can always arrive Spent; every pearl reachable given its stated upgrade and tier. Runs across all levels in CI, budgeted per §12.7. |
| Score & timer logic | Vitest | 100% |
| Determinism | Vitest | A recorded input sequence replayed twice produces byte-identical world state. This test protects speedrun timing and ghosts. |
| Feel | Human playtest | Not automatable. 3 testers per milestone. |

CI runs typecheck, lint, tests, and a bundle-size assertion on every push.

---

## 13. Accessibility

The game is deliberately hard. Difficulty is a design choice; *inaccessibility* is a bug.

| Need | Provision |
|---|---|
| Motor | Full key remapping. All actions on single keys — **no chords, no holds longer than 60 frames** required to complete the game. |
| Vision — colour | Every hazard is distinguished by **shape and animation**, never colour alone. Urchins have spikes, magma bubbles, currents drift. Tested in greyscale. |
| Vision — contrast | World 5's darkness has a `Light Radius` slider (5 / 7 / 10 tiles). Using it disables leaderboard submission but nothing else. |
| Photosensitivity | `Reduce Flashing` option: caps flash frequency at 3 Hz, removes the death-screen ink flash, disables boss-hit strobe. |
| Vestibular | `Screen Shake` slider, 0–100%, and a `Camera Lookahead` toggle. |
| Cognitive / pacing | **Assist Mode** — infinite continues, checkpoint density doubled, and a 25% enemy speed reduction. Off by default, plainly labelled, and it **stamps runs as `ASSIST` on the local leaderboard rather than blocking them.** This preserves the Classic NES default for everyone who wants it while making the game finishable by someone who can't clear a 3-life gauntlet. |
| Audio | Every audio cue has a visual counterpart. The pearl chime pairs with a faint screen-edge shimmer; the pressure heartbeat pairs with a vignette. |

---

## 14. Milestones

| # | Milestone | Deliverable | Exit criteria |
|---|---|---|---|
| **M0** | **PRD** ✅ | This document | Design locked and reviewed |
| **M1** | Engine skeleton | Loop, input, renderer, collision, grey-box level | 60 fps stable; determinism test green |
| **M2** | **Vertical slice** | Nib fully tuned, ink meter, 1 enemy, World 1 Section A in final art | **G2 met: three testers say the grey box alone is fun.** This is the go/no-go gate. |
| **M3** | World 1 complete | All L1 sections, 3 enemies, Hermit King, HUD, save | A tester finishes L1 unassisted in < 20 min |
| **M4** | Worlds 2–3 | Currents, cling, Ink Shot/Bomb, 5 more enemies, 2 bosses | Both levels pass reachability tests |
| **M5** | Worlds 4–5 | Magma, darkness, pressure, Deep Jet, Kraken | Full game completable start to finish |
| **M6** | Meta systems + **level editor** | Pearls, score, high scores, speedrun timer + ghost, world map with free replay, upgrades & backtracking — plus the in-repo level editor (§12.7), which is what makes levels 6–50 possible at all | All 15 pearls collectible; PBs persist; a level round-trips through the editor unchanged |
| **M7** | Audio & polish | 11 music tracks, full SFX set, all juice from §9.5, options, accessibility | Bundle ≤ 1.5 MB; a11y checklist complete |
| **M8** | Playtest & tune | 3 full external playtests, difficulty curve pass | Completion rate ≥ 60% to World 3 |
| **M9** | *Phase 2* — Characters | Octo, Cuttle, Nautilus + per-character records + alternate routes | Every character clears every level |

M1–M8 is the ship. M9 follows.

---

## 15. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Three tiers make the game too soft**, and the Classic NES promise doesn't land | High | **High** | The most likely failure mode of the v1.2 damage model. The difficulty budget lives in the **sparse checkpoints and the 3 continues**, not the hit count. Ink Core rarity is the primary dial. If M3 playtest reads as easy, tighten in this order: (1) fewer or better-hidden Ink Cores, (2) fewer Ink Bulbs, (3) remove the Spent-tier jump bonus, (4) drop to 2 continues. Do **not** first reach for enemy buffs — the enemies are what make the levels legible. |
| **The Charged dash trivialises encounters** it wasn't meant to | Medium | Medium | Charged is authored around traversal and crowds, never placed before a boss door (§7.1). If it still flattens rooms, cut the lingering trail before cutting the dash-through kill — the kill is the reason the tier is fun. |
| **Level authoring throughput** blocks the path from 5 levels to 50 | High <small>(later)</small> | High | Not a v1 risk, but a v1 *decision* risk. The §12.7 constraints and the M6 level editor are the whole mitigation. Skipping them makes 50 levels a rewrite instead of content work. |
| **The ink-cloud stun trivialises crowds** — players farm hits to clear rooms | Medium | Medium | The 30-frame stun is tuned to prevent double-hits, not to be a weapon. If it becomes a strategy, cut the radius to 1 tile before cutting the duration; the anti-double-hit property is the part that must survive. |
| **Ink dash isn't fun** | Fatal | Low | M2 is an explicit go/no-go gate for exactly this. If the grey box isn't fun, stop and re-tune before any content is authored. |
| **Code-drawn pixel art takes longer than expected** | Medium | **High** | Authoring ~420 frames by hand in arrays is slow. Mitigation: build a tiny in-repo sprite editor page in M1 that reads/writes the TS array format directly. Half a day that saves a week. |
| **Runtime chiptune synth sounds bad** | Medium | Medium | Prototype the APU in M1 with one melody before committing to 11 tracks. Fallback: fewer, longer, simpler tracks. |
| **Difficulty curve is wrong** but only visible late | Medium | Medium | Playtest at every milestone, not only M8. Instrument deaths per section locally from M3 onward. |
| **World 5 darkness is unreadable** rather than atmospheric | Medium | Medium | Light-radius slider exists already (§13). Test on a laptop screen at 50% brightness, not a calibrated monitor. |
| **Scope creep into 5 worlds × 4 stages** | High | Medium | Five levels is the scope. Extra ideas go in a `ideas.md`, not in the build. |
| **Phase-2 characters break level completability** | Medium | High | The hard constraint in §8.6 plus the automated reachability test, extended per character. |

---

## 16. Open questions

### Resolved in v1.2

| # | Question | Decision |
|---|---|---|
| 1 | Should there be a third tier? | **Yes.** Spent → Full → **Charged**, granted by a rare Ink Core, turning the dash into a weapon (§4.4). Charged grants no extra pips, keeping it orthogonal to Deep Jet. |
| 2 | Is 5 levels enough game? | **v1 ships 5.** The long-term target is ~50; §12.7 is the set of constraints that keeps that a content problem rather than a rewrite. |
| 3 | Free replay of cleared levels? | **Yes, free replay from the world map** — required, since five pearls are gated behind later-world upgrades. |
| 4 | Does the run timer include boss fights? | **Yes.** The clock does not stop at the boss door or for the intro animation (§8.4). |
| 5 | The name | **INKFALL**, confirmed. No longer a working title. |
| 6 | Repository | **Done.** Lives at [github.com/Foolless/inkfall](https://github.com/Foolless/inkfall), with the design history preserved. |

### Still open

1. **Ink Core density is the difficulty dial and is unvalidated.** Specced at 1–2 per level from W3, hidden-only in W1–2. This is the single number most likely to move after M3 playtest, and §15 lists it as the first thing to tighten.
2. **Does a Charged dash break the boss fights?** Ink Cores are deliberately never placed before a boss door, but a player can carry one in from earlier. If a Charged dash lets someone skip a boss phase, the fix is the boss's armor, not the tier.
3. **Do 50 levels keep 3 pearls each?** 150 pearls is too many. Likely 3 per *chapter*, which would change §8.3 — deferred, but it affects the save schema, so it is worth deciding before the schema hits v2.
4. **How does the full-run speedrun category work across 50 levels?** A single 50-level sum is not a category anyone will run. Per-chapter runs are the likely answer. Deferred to whenever level 6 exists.

---

## Appendix A — Tuning quick-reference

Every number a designer touches, in one place. Changing any of these requires re-running the feel-guarantee tests (§4.3).

```ts
export const PHYSICS = {
  GRAVITY: 0.42, TERMINAL_FALL: 6.0,
  WALK_ACCEL: 0.18, WALK_MAX: 1.6, RUN_ACCEL: 0.24, RUN_MAX: 2.6,
  GROUND_FRICTION: 0.24, AIR_ACCEL: 0.10, AIR_DRAG: 0.04,
  JUMP_IMPULSE: -6.6, JUMP_CUT: -1.8,
  COYOTE_FRAMES: 6, JUMP_BUFFER_FRAMES: 6,
  STOMP_BOUNCE: -4.6, STOMP_BOUNCE_HELD: -6.2,
} as const;

export const INK = {
  MAX: 3, DASH_COST: 1,
  DASH_SPEED: 5.6, DASH_SPEED_WATER: 6.4,
  DASH_LOCK_FRAMES: 10, DASH_CARRYOVER: 0.72,
  DASH_COOLDOWN: 10, DASH_IFRAMES: 4,
  REFILL_GROUND: 45, REFILL_WATER: 20, REFILL_AIR: Infinity,
  STOMP_REFUND: 1,
} as const;

export const WATER = {
  GRAVITY: 0.14, TERMINAL_FALL: 2.2,
  SWIM_STROKE: -1.9, SWIM_MAX_X: 1.8, ENTRY_DAMP: 0.4,
} as const;

// Tiers — only these values differ; everything else is shared.
// Order matters: a hit steps one index down, a pickup one index up.
export const TIERS = [
  { id: "spent",   inkMax: 2, box: [10,10], gravity: 0.40, jump: -6.80, runMax: 2.70, crumbleHold: 36, dashKills: false },
  { id: "full",    inkMax: 3, box: [12,14], gravity: 0.42, jump: -6.60, runMax: 2.60, crumbleHold: 24, dashKills: false },
  { id: "charged", inkMax: 3, box: [12,14], gravity: 0.42, jump: -6.60, runMax: 2.60, crumbleHold: 24, dashKills: true  },
] as const;

export const CHARGED = {
  DASH_TRAIL_FRAMES: 20,   // lingering damaging ink behind a charged dash
  BREAKS_CRACKED: true,
  KILL_SCORE: 150,
} as const;

export const RULES = {
  START_LIVES: 3, CONTINUES: 3,
  SHELLS_PER_LIFE: 100,
  CHECKPOINTS_PER_LEVEL: 2,
  INK_BULBS_PER_LEVEL: [4, 6],
  INK_CORES_PER_LEVEL: [1, 2],   // from W3; hidden-only in W1-2
  RESPAWN_IFRAMES: 60,
  HURT_IFRAMES: 90,            // on shrink — long enough to walk out of a bad spot
  HURT_KNOCKBACK: 8,           // px, away from the source
  SHRINK_STUN_FRAMES: 30,      // expelled ink cloud stuns enemies...
  SHRINK_STUN_RADIUS: 2,       // ...within this many tiles
  RESPAWN_TIER: "full",        // never Spent, never Charged — see §4.4
  DEATH_ANIM_FRAMES: 90,
} as const;

export const DISPLAY = {
  WIDTH: 320, HEIGHT: 180, TILE: 16,
  CAMERA_LOOKAHEAD: 32, CAMERA_EASE_FRAMES: 20, CAMERA_DEADZONE_Y: 48,
  HITSTOP_FRAMES: 3,
} as const;
```

## Appendix B — Content inventory

| Asset class | Count |
|---|---|
| Levels | 5 |
| Bosses | 5 |
| Enemy types | 12 |
| Hazard types | 8 |
| Upgrades | 5 |
| Pearls | 15 |
| Characters (incl. Phase 2) | 4 |
| Music tracks | 11 |
| SFX | ~24 |
| Sprite frames | ~455 |
| Tiers | 3 (4 for Nautilus) |
| Ink Bulbs / Ink Cores | 20–30 / 5–8 |
| Tiles | ~120 (5 worlds × ~24) |
| Screens | 8 |

## Appendix C — Decisions log

| Decision | Chosen | Rejected | Rationale |
|---|---|---|---|
| Where it lives | Standalone project | Route in the Lucky app; Phaser; single HTML file | Clean separation; zero deps is a pillar |
| Signature move | 8-way ink jet dash | Tentacle grapple; swim/float switch; suction cling | A *budget* of bursts creates better puzzles than a binary ability |
| Art | Code-drawn pixel art | Vector; emoji/CSS; sourced sprite sheets | No pipeline, no licensing, authentic era feel |
| Difficulty | Classic NES | Kid-friendly; selectable modes; speedrun-focused | Honest, short, memorable — with Assist Mode as the accessibility valve |
| Damage model | Three tiers, Mario-style *(v1.2; was one-hit death in v1.0, two tiers in v1.1)* | One-hit death; a health bar | The tier and the ink budget are the **same resource**, so a hit tightens the next jump instead of ticking a counter. Difficulty moves into sparse checkpoints, where it belongs. |
| Ink capacity when small | 2 pips | 3 pips regardless of size | If being small cost nothing but a hitbox, the tier would be free. Losing a pip is the cost that makes an Ink Bulb worth crossing a room for. |
| What Charged grants | A **damaging dash** | More pips; more speed; armor | Pips belong to Deep Jet — keeping them orthogonal means Charged and Deep Jet teach different things. Making the dash *more* beats adding a button. |
| Level authoring split | Grid owns geometry, `entities` owns actors | Checkpoints and pickups in both; everything in one list | Found in Phase 2: §12.5 sketched checkpoints as a legend character *and* an array. Two authorities for one fact is how a level ends up with three conches in the grid and two in the list. Terrain markers are positions, so they stay in the grid; anything that moves, ticks or is collected goes in the typed list. |
| Currents are fluid | A current tile floats you | A separate "dry current" tile type | Found in Phase 1: a current drawn over water replaces the water glyph, so Nib sank through an updraft he should have ridden. The game is underwater; the simple rule is the correct one. |
| v1 scope | 5 levels, architected for ~50 | Building toward 50 now; ignoring 50 entirely | Five is the deliverable. §12.7 is a set of cheap constraints, not scope — retrofitting stable ids and chapter-owned tilesets later is a rewrite. |
| Worlds | Ocean descent | Fish-out-of-water; Mario mapping; ink surrealism | Descent gives an emotional arc a level list can't |
| Input | Keyboard only | Gamepad; touch; all three | Tuning focus; touch would compromise precision |
| Meta | Pearls + score + speedrun + upgrades + characters | Any single one | They reinforce each other: upgrades enable pearls, pearls unlock characters, characters reset the speedrun |
