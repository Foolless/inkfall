/**
 * Boss dispatch. One file per boss, per PRD §12.2.
 *
 * Five bosses will live behind this, and each is a state machine over frame
 * counters. Keeping the registry keyed by the id a level declares means adding
 * the Kelp Warden is a new file and a new entry, never a change to the world.
 */

import type { Box } from '../collision.js'
import { spawnHermitKing, updateHermitKing, type Boss, type BossStepContext } from './hermit-king.js'

export function spawnBoss(id: string, arena: Box): Boss {
  switch (id) {
    case 'hermitKing':
      return spawnHermitKing(arena)
    default:
      throw new Error(`unknown boss ${JSON.stringify(id)}`)
  }
}

export function updateBoss(ctx: BossStepContext, b: Boss): void {
  switch (b.id) {
    case 'hermitKing':
      updateHermitKing(ctx, b)
      return
    default:
      throw new Error(`unknown boss ${JSON.stringify(b.id)}`)
  }
}

export * from './hermit-king.js'
