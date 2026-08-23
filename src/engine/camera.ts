import { DISPLAY } from '../game/constants.js'
import { approach } from '../game/player.js'
import { pixelHeight, pixelWidth, type TileMap } from '../game/tilemap.js'

export interface Camera {
  x: number
  y: number
  lookahead: number
}

export function createCamera(): Camera {
  return { x: 0, y: 0, lookahead: 0 }
}

export interface CameraTarget {
  x: number
  y: number
  w: number
  h: number
  facing: 1 | -1
  grounded: boolean
}

/**
 * Horizontal lookahead, vertical dead zone.
 *
 * Leading the camera in the direction of travel is what keeps the front edge of
 * the screen from being a wall of unknown. The vertical dead zone plus a harder
 * snap when grounded stops every jump from heaving the whole view up and down.
 */
export function updateCamera(cam: Camera, target: CameraTarget, map: TileMap): void {
  const easeStep = DISPLAY.CAMERA_LOOKAHEAD / DISPLAY.CAMERA_EASE_FRAMES
  cam.lookahead = approach(cam.lookahead, target.facing * DISPLAY.CAMERA_LOOKAHEAD, easeStep)

  const cx = target.x + target.w / 2
  cam.x = cx + cam.lookahead - DISPLAY.WIDTH / 2

  const cy = target.y + target.h / 2
  const centre = cam.y + DISPLAY.HEIGHT / 2
  const slack = DISPLAY.CAMERA_DEADZONE_Y / 2
  if (cy < centre - slack) cam.y = cy + slack - DISPLAY.HEIGHT / 2
  else if (cy > centre + slack) cam.y = cy - slack - DISPLAY.HEIGHT / 2
  if (target.grounded) cam.y = approach(cam.y, cy - DISPLAY.HEIGHT / 2, 2)

  cam.x = clamp(cam.x, 0, Math.max(0, pixelWidth(map) - DISPLAY.WIDTH))
  cam.y = clamp(cam.y, 0, Math.max(0, pixelHeight(map) - DISPLAY.HEIGHT))
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
