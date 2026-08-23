/**
 * Drifter — the jellyfish. World 1. PRD §6.1 #2.
 *
 * Teaches "not everything is stompable — route around it". It floats a fixed
 * sine, ignores terrain entirely, and damages on every side. There is no way to
 * beat one in World 1; the only answer is to spend a pip and go past.
 *
 * Position is computed from the clock rather than integrated, so a Drifter's
 * path is identical on frame 10,000 of a replay as on frame 10. An accumulated
 * sine drifts; a sampled one cannot.
 */

import { ENEMIES } from '../constants.js'
import type { Enemy } from './types.js'

export function updateDrifter(e: Enemy): void {
  // Clock first, so it reads as "frames elapsed": after one whole period the
  // jellyfish is exactly back where it started, not one frame short of it.
  e.clock++

  const next = drifterYAt(e, e.clock)
  // Velocity is derived, not integrated — it exists only so the renderer and
  // the hurt knockback know which way the thing was going.
  e.vy = next - e.y
  e.vx = 0
  e.y = next
}

/** Where a Drifter will be at an arbitrary frame. Used by the level tests. */
export function drifterYAt(e: Enemy, frame: number): number {
  const period = e.period > 0 ? e.period : ENEMIES.DRIFTER_PERIOD
  return e.homeY + Math.sin((frame / period) * Math.PI * 2) * e.amplitude
}
