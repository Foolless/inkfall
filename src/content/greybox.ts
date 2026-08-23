import type { LevelDef } from '../game/world.js'

/**
 * The Phase 1 grey box.
 *
 * Not a level -- a proving ground. Every mechanic appears once, at the exact
 * distances the feel guarantees promise, so a human can check by hand what the
 * tests check by assertion:
 *
 *   A  x10-13    4-tile gap          guarantee 1, run jump
 *   A  x22       3-tile step up      guarantee 1, jump height
 *   B  x34       5-tile face         guarantee 3, jump + UP-DASH -- mandatory
 *   C  x48-54    7-tile gap          guarantee 2, jump + one dash
 *   D  x68-80    one-way platforms   pass up through, land on top
 *   E  x84-92    crumbling bridge    24 frames of footing over spikes
 *   F  x96-108   water + updraft     buoyancy, entry damping, a current
 *   G  x121-130  leftward current    a force to dash against, over solid ground
 *   H  x138-144  slick run-out       the stopping-distance guarantee, felt
 *
 * Section B moved here from the far end after the Gate 1 playtest, which found
 * the dash reads as horizontal-only: nobody discovers eight directions from a
 * corridor that never asks for the other seven. It is now the third thing the
 * level teaches, it cannot be walked around, and it carries the single text
 * prompt the PRD allows. The floor at x28-33 sits beneath it so a missed
 * up-dash costs a retry, not a life -- the mechanic is the lesson, not the
 * punishment.
 *
 * The face is five tiles, not the six that guarantee 3 promises. Six is only
 * reachable with a *pure* vertical dash, and a player moving rightward holds
 * Right, which makes the dash diagonal and halves its vertical component. A
 * gate that punishes holding the direction you are travelling in teaches the
 * wrong lesson; five clears comfortably on an up-right dash and is still far
 * beyond the 3.2 tiles a jump alone reaches.
 *
 * Section G sits over ground rather than a pit on purpose: the point is to feel
 * the current, and dying to it would teach nothing the spikes have not already.
 *
 * Legend: . empty  # solid  - one-way  ~ water  ^ hazard  c crumble
 *         > < u d currents  = slick  S start  E exit  K checkpoint
 *         b Ink Bulb  o Ink Core
 */
export const greybox: LevelDef = {
  id: 'greybox',
  name: 'Grey Box',
  chapter: 'test',
  order: 0,
  hints: [{ tx: 31, ty: 12, text: 'HOLD \u2191 + X  TO DASH UP', radius: 6 }],
  tiles: [
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.........................................................................................................................................................',
    '.......................................................###########.........------........................................................................',
    '..................................##############.......###########..............................~~~~~~~~~~~~~............................................',
    '..................................##############.......###########..............................~~~~~~o~~uu~~............................................',
    '......................######......##############.......###########..------......................~~~~~~~~~uu~~............<<<<<<<<<<......................',
    '......................######......##############.......###########..............................~~~~~~~~~uu~~............<<<<<<<<<<......................',
    '..S...................######..b...##############.......###########.............K................~~~~~~~~~uu~~..K.........<<<<<<<<<<.................E....',
    '##########....##################################.......#############################ccccccccc###~~~~~~~~~uu~~#############################=======########',
    '##########....##################################.......#############################.........#############################################=======########',
    '##########....##################################.......#############################.........#############################################=======########',
    '##########....##################################.......#############################^^^^^^^^^#############################################=======########',
  ],
}
