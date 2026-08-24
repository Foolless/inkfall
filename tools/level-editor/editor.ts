import { ENTITY_TYPES, loadLevel, type EntityDef, type LevelDef } from '../../src/content/levels/format.js'
import { fromSource, toSource } from '../../src/content/levels/source.js'
import { ENTITY_CHARS, LEGEND } from '../../src/game/tilemap.js'

/**
 * Level editor. PLAN.md checkpoint 3.1.
 *
 * Hand-typing ASCII grids is fine for five levels and untenable for fifty
 * (PRD §12.7), which is why this exists now rather than at level six. It reads
 * and writes the exact `LevelDef` source format — the round trip is asserted
 * against all five shipped levels in tests/level-source.test.ts, so what comes
 * out of the box is what the game reads in.
 *
 * A browser page in the repo, not a product feature (§1.4). No build step, no
 * framework, no persistence: you paste a level in and you copy one out.
 *
 * **The validator runs on every change.** A ragged row, an unknown glyph, a
 * Snapper buried in the floor — all of them say so under the grid the moment
 * they happen, rather than three screens into a playtest. That is the whole
 * reason the tool is worth more than a text editor.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

/**
 * Editor colours, not game colours.
 *
 * Deliberately *not* the chapter tilesets: a level is authored against what a
 * tile means, and four worlds' worth of near-black basalt would make the one
 * job this view has — telling solid from hazard from current at a glance —
 * harder than reading the ASCII directly.
 */
const TILE_COLOUR: Record<string, string> = {
  '.': '#0b1116',
  '#': '#3a4248',
  '-': '#59646c',
  '~': '#1d3f52',
  '^': '#a8372a',
  c: '#6b5a44',
  '>': '#25505c',
  '<': '#25505c',
  u: '#2a6070',
  d: '#1a3a48',
  '=': '#4a5f6b',
  x: '#4a3f38',
  f: '#5a3a2a',
  k: '#3d7a52',
  m: '#ff6b35',
  h: '#8b2c1f',
  S: '#00e5cc',
  E: '#fdf6ff',
  K: '#ffd9a0',
}

/** What each entity is drawn as. Two letters is enough to tell twenty apart. */
const ENTITY_TAG: Record<string, string> = {
  snapper: 'Sn',
  drifter: 'Dr',
  puffer: 'Pu',
  clam: 'Cl',
  barbTurret: 'Tu',
  whipkelp: 'Wk',
  eel: 'Ee',
  ghostDiver: 'Gh',
  hookline: 'Hk',
  magmaSnail: 'Ms',
  cinderMoth: 'Cm',
  boneShrimp: 'Bs',
  lightless: 'Li',
  shrimpVent: 'Ve',
  bubble: 'Bu',
  rise: 'Ri',
  pressure: 'Pr',
  shell: 'sh',
  pearl: 'PE',
  inkBulb: 'IB',
  inkCore: 'IC',
  deepJet: 'DJ',
}

const BLANK: LevelDef = {
  id: 'new-level',
  name: 'New Level',
  chapter: 'test',
  order: 0,
  tiles: ['S' + '.'.repeat(59), ...Array.from({ length: 22 }, () => '.'.repeat(60)), '#'.repeat(60)],
  entities: [],
}

let level: LevelDef = structuredClone(BLANK)
/** The grid as a mutable array of rows, which is what painting edits. */
let rows: string[] = [...level.tiles]
let entities: EntityDef[] = [...(level.entities ?? [])]
let brush = '#'
/** Null while a tile is selected; an entity type while one is. */
let entityBrush: string | null = null
let zoom = 12
let painting: 0 | 1 | 2 = 0

const canvas = $<HTMLCanvasElement>('grid')
const ctx = canvas.getContext('2d')!
const out = $<HTMLTextAreaElement>('source')
const status = $<HTMLParagraphElement>('status')
const where = $<HTMLSpanElement>('where')

function say(msg: string, bad = false): void {
  status.textContent = msg
  status.style.color = bad ? '#ff8367' : '#69808a'
}

// ── Drawing ─────────────────────────────────────────────────────────────────

function redraw(): void {
  const w = rows[0]?.length ?? 0
  canvas.width = Math.max(1, w * zoom)
  canvas.height = Math.max(1, rows.length * zoom)

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.'
      ctx.fillStyle = TILE_COLOUR[ch] ?? '#ff00ff'
      ctx.fillRect(x * zoom, y * zoom, zoom, zoom)
      // A marker is a hole in the terrain with something standing in it, so it
      // gets its letter drawn on top rather than just a colour.
      if (ch in ENTITY_CHARS && zoom >= 8) {
        ctx.fillStyle = '#05090f'
        ctx.font = `${zoom - 3}px ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, x * zoom + zoom / 2, y * zoom + zoom / 2 + 1)
      }
    }
  }

  // A grid, but only when it would not be noise.
  if (zoom >= 8) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let x = 0; x <= w; x++) line(x * zoom + 0.5, 0, x * zoom + 0.5, canvas.height)
    for (let y = 0; y <= rows.length; y++) line(0, y * zoom + 0.5, canvas.width, y * zoom + 0.5)
    // A heavier line every ten, so a coordinate can be counted off the screen.
    ctx.strokeStyle = 'rgba(0,229,204,0.16)'
    for (let x = 0; x <= w; x += 10) line(x * zoom + 0.5, 0, x * zoom + 0.5, canvas.height)
    for (let y = 0; y <= rows.length; y += 10) line(0, y * zoom + 0.5, canvas.width, y * zoom + 0.5)
  }

  for (const e of entities) drawEntity(e)
  for (const h of level.hints ?? []) {
    ctx.strokeStyle = '#00e5cc'
    ctx.strokeRect(h.tx * zoom + 1.5, h.ty * zoom + 1.5, zoom - 3, zoom - 3)
  }
}

function line(x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function drawEntity(e: EntityDef): void {
  const px = e.x * zoom
  const py = e.y * zoom
  ctx.fillStyle = 'rgba(253,246,255,0.9)'
  ctx.fillRect(px + 1, py + 1, zoom - 2, zoom - 2)
  if (zoom < 10) return
  ctx.fillStyle = '#05090f'
  ctx.font = `${Math.max(7, zoom - 5)}px ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ENTITY_TAG[e.type] ?? '??', px + zoom / 2, py + zoom / 2 + 1)
}

// ── Editing ─────────────────────────────────────────────────────────────────

function cellAt(ev: MouseEvent): { x: number; y: number } | null {
  const r = canvas.getBoundingClientRect()
  const x = Math.floor((ev.clientX - r.left) / zoom)
  const y = Math.floor((ev.clientY - r.top) / zoom)
  if (y < 0 || y >= rows.length || x < 0 || x >= (rows[0]?.length ?? 0)) return null
  return { x, y }
}

function paint(x: number, y: number, erase: boolean): void {
  if (entityBrush !== null) {
    // Entities are a list, not a grid: dropping one where one already is
    // replaces it, which is what a designer means by clicking there twice.
    entities = entities.filter((e) => !(e.x === x && e.y === y))
    if (!erase) entities.push(newEntity(entityBrush, x, y))
    return
  }
  const ch = erase ? '.' : brush
  const row = rows[y]!
  if (row[x] === ch) return
  rows[y] = row.slice(0, x) + ch + row.slice(x + 1)
}

/**
 * A new entity with the fields its type needs and nothing else.
 *
 * The optional fields are left off deliberately: a level file full of
 * `phase: 0` and `radius: 5` is a level file where the values that were
 * actually chosen are hidden among the ones that were not.
 */
function newEntity(type: string, x: number, y: number): EntityDef {
  const base = { type, x, y } as unknown as EntityDef
  if (type === 'pearl') return { ...base, id: nextPearlSlot() } as EntityDef
  if (type === 'rise') return { ...base, fluid: 'flood', top: Math.max(0, y - 8) } as EntityDef
  if (type === 'pressure') return { ...base, w: 10, h: 8 } as EntityDef
  return base
}

/** The lowest pearl slot not already used. Three per level (§8.3). */
function nextPearlSlot(): 0 | 1 | 2 {
  const used = new Set(
    entities.filter((e): e is typeof e & { type: 'pearl' } => e.type === 'pearl').map((p) => p.id),
  )
  return (([0, 1, 2] as const).find((i) => !used.has(i)) ?? 0) as 0 | 1 | 2
}

/** Rebuild the def from the grid and the list, validate it, and show it. */
function sync(): void {
  // The entity list is dropped entirely when it is empty rather than written
  // as `[]`, because that is how the shipped files read and the round trip is
  // only worth anything if the two agree.
  const next: LevelDef = { ...level, tiles: [...rows] }
  delete (next as { entities?: unknown }).entities
  if (entities.length > 0) Object.assign(next, { entities: [...entities] })
  level = next
  out.value = toSource(level, exportName(level.id))
  try {
    const loaded = loadLevel(level)
    const conches = loaded.checkpoints.length
    say(
      `${loaded.map.width}x${loaded.map.height} · ${entities.length} entities · ` +
        `${conches} conch${conches === 1 ? '' : 'es'} · ` +
        `${entities.filter((e) => e.type === 'pearl').length} pearls · ` +
        `${loaded.exit ? 'has an exit' : 'no exit'}`,
    )
  } catch (err) {
    say((err as Error).message, true)
  }
  redraw()
}

/** `w02-kelp` is exported as `kelpForest`, so the name is only a suggestion. */
function exportName(id: string): string {
  const words = id.replace(/^w\d+-/, '').split('-')
  return words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('')
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function chip(label: string, colour: string | null, selected: () => boolean, pick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'chip' + (selected() ? ' on' : '')
  if (colour !== null) {
    const swatch = document.createElement('i')
    swatch.style.background = colour
    b.append(swatch)
  }
  b.append(document.createTextNode(label))
  b.addEventListener('click', () => {
    pick()
    buildBars()
  })
  return b
}

function buildBars(): void {
  const tiles = $<HTMLSpanElement>('tiles')
  tiles.replaceChildren(
    ...Object.keys(LEGEND).map((ch) =>
      chip(ch, TILE_COLOUR[ch] ?? '#f0f', () => entityBrush === null && brush === ch, () => {
        brush = ch
        entityBrush = null
      }),
    ),
  )

  const markers = $<HTMLSpanElement>('markers')
  markers.replaceChildren(
    ...Object.entries(ENTITY_CHARS).map(([ch, kind]) =>
      chip(`${ch} ${kind}`, TILE_COLOUR[ch]!, () => entityBrush === null && brush === ch, () => {
        brush = ch
        entityBrush = null
      }),
    ),
  )

  const list = $<HTMLSpanElement>('entities')
  list.replaceChildren(
    ...ENTITY_TYPES.map((type) =>
      chip(`${ENTITY_TAG[type] ?? '??'} ${type}`, null, () => entityBrush === type, () => {
        entityBrush = type
      }),
    ),
  )
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener('pointerdown', (e) => {
  const cell = cellAt(e)
  if (!cell) return
  painting = e.button === 2 ? 2 : 1
  canvas.setPointerCapture(e.pointerId)
  paint(cell.x, cell.y, painting === 2)
  sync()
})
canvas.addEventListener('pointermove', (e) => {
  const cell = cellAt(e)
  where.textContent = cell ? `${cell.x}, ${cell.y}` : ''
  if (painting === 0 || !cell) return
  // Entities are placed one at a time; dragging a pearl across a room would
  // leave twenty of them behind.
  if (entityBrush !== null) return
  paint(cell.x, cell.y, painting === 2)
  sync()
})
const stop = (): void => {
  painting = 0
}
canvas.addEventListener('pointerup', stop)
canvas.addEventListener('pointercancel', stop)

$('load').addEventListener('click', () => {
  try {
    const parsed = fromSource(out.value)
    level = parsed
    rows = [...parsed.tiles]
    entities = [...(parsed.entities ?? [])]
    $<HTMLInputElement>('width').value = String(rows[0]?.length ?? 0)
    $<HTMLInputElement>('height').value = String(rows.length)
    sync()
    say(`loaded ${parsed.id}`)
  } catch (err) {
    say((err as Error).message, true)
  }
})

$('copy').addEventListener('click', () => {
  out.select()
  void navigator.clipboard?.writeText(out.value).then(
    () => say('copied'),
    () => say('could not reach the clipboard; the text is selected', true),
  )
})

$('resize').addEventListener('click', () => {
  const w = Math.max(4, Number($<HTMLInputElement>('width').value) || 4)
  const h = Math.max(4, Number($<HTMLInputElement>('height').value) || 4)
  // Grown with empty space and cropped from the far edge, so resizing never
  // silently rewrites terrain that is already there.
  rows = Array.from({ length: h }, (_, y) => (rows[y] ?? '.'.repeat(w)).padEnd(w, '.').slice(0, w))
  entities = entities.filter((e) => e.x < w && e.y < h)
  sync()
})

$('zoom').addEventListener('change', (e) => {
  zoom = Math.max(4, Math.min(32, Number((e.target as HTMLInputElement).value) || 12))
  redraw()
})

buildBars()
sync()

// Exposed so the browser smoke test can drive the editor without a mouse.
declare global {
  interface Window {
    __editor?: {
      source: () => string
      load: (src: string) => void
      paint: (x: number, y: number, ch: string) => void
      place: (type: string, x: number, y: number) => void
      status: () => string
    }
  }
}
window.__editor = {
  source: () => out.value,
  load: (src: string) => {
    out.value = src
    $('load').click()
  },
  paint: (x, y, ch) => {
    brush = ch
    entityBrush = null
    paint(x, y, false)
    sync()
  },
  place: (type, x, y) => {
    entityBrush = type
    paint(x, y, false)
    sync()
  },
  status: () => status.textContent ?? '',
}
