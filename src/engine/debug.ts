import { DISPLAY } from '../game/constants.js'
import { TIER_NAMES } from '../game/player.js'
import type { World } from '../game/world.js'
import type { Camera } from './camera.js'

/** Rolling frame-time samples, so the graph shows a trend not a spike. */
const SAMPLES = 60

export class DebugOverlay {
  visible = false
  private times: number[] = []

  toggle(): void {
    this.visible = !this.visible
  }

  sample(ms: number): void {
    this.times.push(ms)
    if (this.times.length > SAMPLES) this.times.shift()
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cam: Camera): void {
    if (!this.visible) return
    const p = w.player
    const ox = Math.floor(cam.x)
    const oy = Math.floor(cam.y)

    ctx.strokeStyle = '#00e5cc'
    ctx.lineWidth = 1
    ctx.strokeRect(Math.floor(p.x - ox) + 0.5, Math.floor(p.y - oy) + 0.5, p.w - 1, p.h - 1)

    ctx.fillStyle = 'rgba(5,9,15,0.82)'
    ctx.fillRect(0, DISPLAY.HEIGHT - 46, DISPLAY.WIDTH, 46)

    ctx.font = '7px monospace'
    ctx.fillStyle = '#9cb0b8'
    const state = !p.alive ? 'DEAD' : p.dashFrames > 0 ? 'DASH' : p.inWater ? 'WATER' : p.grounded ? 'GROUND' : p.vy < 0 ? 'RISE' : 'FALL'
    const lines = [
      `frame ${w.frame}  ${state}  tier ${TIER_NAMES[p.tier]}  ink ${p.ink}/${p.inkTimer}`,
      `pos ${p.x.toFixed(2)} ${p.y.toFixed(2)}   vel ${p.vx.toFixed(3)} ${p.vy.toFixed(3)}`,
      `coyote ${p.coyote} buf ${p.jumpBuffer} cd ${p.dashCooldown} ifr ${p.iframes} deaths ${p.deaths}`,
      `avg ${this.avg().toFixed(2)}ms  max ${this.max().toFixed(2)}ms  crumbling ${w.crumbling.size}`,
    ]
    lines.forEach((line, i) => ctx.fillText(line, 4, DISPLAY.HEIGHT - 34 + i * 9))

    const graphX = DISPLAY.WIDTH - SAMPLES - 4
    for (let i = 0; i < this.times.length; i++) {
      const h = Math.min(16, (this.times[i]! / 16.67) * 8)
      ctx.fillStyle = this.times[i]! > 16.67 ? '#ff8367' : '#2c7440'
      ctx.fillRect(graphX + i, DISPLAY.HEIGHT - 44 + (16 - h), 1, h)
    }
  }

  private avg(): number {
    if (this.times.length === 0) return 0
    return this.times.reduce((a, b) => a + b, 0) / this.times.length
  }
  private max(): number {
    return this.times.length === 0 ? 0 : Math.max(...this.times)
  }
}
