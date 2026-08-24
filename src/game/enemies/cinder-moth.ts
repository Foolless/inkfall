/**
 * Cinder Moth — the ember dropper. World 4. PRD §6.1 #10.
 *
 * Teaches *a threat that persists after the enemy is gone*. Kill the moth and
 * the embers it already dropped are still burning, and §7.5 B2 hangs ash
 * bridges under its patrol precisely so that the bridge you planned on may not
 * be there when you arrive.
 *
 * It is stompable and it flies a fixed patrol, so it is the easy half of World
 * 4's roster. The difficulty is not the moth; it is what the moth leaves.
 */

import { ENEMIES } from '../constants.js'
import { hasPatrol, type Enemy } from './types.js'

export function updateCinderMoth(e: Enemy, drop: (x: number, y: number) => void): void {
  e.clock++

  // A flat patrol with a small bob. It ignores terrain entirely — a moth that
  // turned at walls would leave its embers somewhere other than over the bridge
  // its designer hung them above.
  e.vx = e.facing * ENEMIES.MOTH_SPEED
  e.x += e.vx
  if (hasPatrol(e)) {
    if (e.x <= e.patrolLo) {
      e.x = e.patrolLo
      e.facing = 1
    } else if (e.x >= e.patrolHi) {
      e.x = e.patrolHi
      e.facing = -1
    }
  }
  e.y = e.homeY + Math.sin((e.clock / 90) * Math.PI * 2) * 3

  const c = ENEMIES.MOTH_DROP_CYCLE
  if (((e.clock % c) + c) % c === 0) drop(e.x + e.w / 2, e.y + e.h)
}
