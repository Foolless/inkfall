import type { World } from './world.js'

/**
 * A stable fingerprint of everything the simulation owns.
 *
 * This exists for one reason: replaying the same input log twice must produce
 * byte-identical state. That property is what speedrun timing, ghost playback
 * and reproducing a bug report from an input log all rest on, and it is also
 * the canary for `Math.random()` or `Date.now()` sneaking into the update loop.
 *
 * Floats are hashed by their exact bit pattern, not rounded — a physics change
 * of one ULP is still a physics change.
 */
export function hashWorld(w: World): string {
  const p = w.player
  const nums: number[] = [
    w.frame,
    w.cleared ? 1 : 0,
    w.respawnTimer,
    w.shells,
    w.pearls[0] ? 1 : 0,
    w.pearls[1] ? 1 : 0,
    w.pearls[2] ? 1 : 0,
    p.x,
    p.y,
    p.vx,
    p.vy,
    p.w,
    p.h,
    p.tier,
    p.ink,
    p.inkTimer,
    p.grounded ? 1 : 0,
    p.facing,
    p.coyote,
    p.jumpBuffer,
    p.dashFrames,
    p.dashCooldown,
    p.iframes,
    p.inWater ? 1 : 0,
    p.alive ? 1 : 0,
    p.prevY,
    p.jumping ? 1 : 0,
    p.stunCloud,
    p.aimY,
    p.aimYFrames,
    p.deaths,
    w.checkpoint?.x ?? -1,
    w.checkpoint?.y ?? -1,
    w.score,
    w.chain,
    w.hitstop,
    w.livesOwed,
  ]

  for (const pick of w.pickups) nums.push(pick.taken ? 1 : 0)
  // Enemies are simulation state: a Drifter one pixel off its sine is a
  // divergence, and this is the test that has to notice.
  for (const e of w.enemies) {
    nums.push(e.alive ? 1 : 0, e.x, e.y, e.vx, e.vy, e.facing, e.clock, e.stun, e.inflated, e.w, e.h)
  }
  for (const c of w.clams) nums.push(c.clock)
  for (const r of w.rocks) nums.push(r.alive ? 1 : 0, r.x, r.y, r.vx, r.vy)
  if (w.boss) nums.push(w.boss.x, w.boss.y, w.boss.hits, w.boss.timer, w.boss.beat, w.boss.facing, w.boss.state.length)
  nums.push(w.bossActive ? 1 : 0)
  for (const h of w.hints) nums.push(h.frames, h.spent ? 1 : 0)
  // Sets and Maps iterate in insertion order, which can differ between two runs
  // that reached the same state by different routes. Sort so the hash reflects
  // the state itself, not the history that produced it.
  for (const t of [...w.collapsed].sort((a, b) => a - b)) nums.push(t)
  for (const [t, f] of [...w.crumbling].sort((a, b) => a[0] - b[0])) nums.push(t, f)
  for (const [t, f] of [...w.respawning].sort((a, b) => a[0] - b[0])) nums.push(t, f)

  return fnv1a(new Uint8Array(new Float64Array(nums).buffer))
}

export function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
