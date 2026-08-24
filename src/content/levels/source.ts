/**
 * A `LevelDef` to and from the TypeScript literal it is authored as.
 *
 * The sprite format has had this since Phase 1 (`sprites/format.ts`) and for
 * the same reason: an editor is only trustworthy if what it writes is *exactly*
 * what the game reads. Round-tripping is asserted in tests/level-source.test.ts
 * against all five shipped levels, so a level edited in the tool and pasted
 * back is the level that was already there plus the edit.
 *
 * ## Why regexes rather than an evaluator
 *
 * Because the alternative is running arbitrary text pasted into a text box, and
 * because the grammar this has to read is one this repo authors and nothing
 * else does: string, number, and a two-number array. A parser that accepted
 * more would only be able to accept things the level format cannot express.
 *
 * Everything here throws rather than guessing. The tool's job is to say "line
 * 40 is ragged", not to load something almost right.
 */

import { loadLevel, type EntityDef, type HintDef, type LevelDef } from './format.js'

export class LevelSourceError extends Error {}

/** Values a level literal can hold. Deliberately no deeper than this. */
type Literal = string | number | readonly [number, number]

/**
 * Serialise to the exact shape the level files are written in.
 *
 * Field order is fixed rather than following the object's own key order, so two
 * levels that differ only in how they were constructed serialise identically —
 * which is what makes the round-trip test meaningful.
 */
export function toSource(def: LevelDef, exportAs = 'level'): string {
  const lines: string[] = [`export const ${exportAs}: LevelDef = {`]
  lines.push(`  id: '${def.id}',`)
  lines.push(`  name: '${escape(def.name)}',`)
  lines.push(`  chapter: '${def.chapter}',`)
  lines.push(`  order: ${def.order},`)
  if (def.par !== undefined) lines.push(`  par: ${def.par},`)

  if (def.hints && def.hints.length > 0) {
    lines.push('  hints: [')
    for (const h of def.hints) lines.push(`    ${record(h as unknown as Record<string, Literal>)},`)
    lines.push('  ],')
  }

  lines.push('  tiles: [')
  for (const row of def.tiles) lines.push(`    '${row}',`)
  lines.push('  ],')

  if (def.entities && def.entities.length > 0) {
    lines.push('  entities: [')
    for (const e of def.entities) lines.push(`    ${record(e as unknown as Record<string, Literal>)},`)
    lines.push('  ],')
  }

  if (def.boss !== undefined) lines.push(`  boss: '${def.boss}',`)
  lines.push('}')
  return lines.join('\n') + '\n'
}

/**
 * Read a level back out of its source.
 *
 * The result is put through `loadLevel` before it is returned, so a paste that
 * would not load is rejected here rather than three screens later.
 */
export function fromSource(src: string): LevelDef {
  const id = str(src, 'id')
  const name = str(src, 'name')
  const chapter = str(src, 'chapter')
  if (id === null || name === null || chapter === null) {
    throw new LevelSourceError('source is missing id, name or chapter')
  }

  const order = num(src, 'order')
  if (order === null) throw new LevelSourceError('source is missing order')

  const tiles = block(src, 'tiles')
  if (tiles === null) throw new LevelSourceError('source has no tiles')
  const rows = [...tiles.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
  if (rows.length === 0) throw new LevelSourceError('the tiles array is empty')

  const def: LevelDef = {
    id,
    name,
    chapter,
    order,
    tiles: rows,
  }

  const par = num(src, 'par')
  if (par !== null) Object.assign(def, { par })

  const hints = block(src, 'hints')
  if (hints !== null) {
    Object.assign(def, { hints: records(hints).map((r) => r as unknown as HintDef) })
  }

  const entities = block(src, 'entities')
  if (entities !== null) {
    Object.assign(def, { entities: records(entities).map((r) => r as unknown as EntityDef) })
  }

  const boss = str(src, 'boss')
  if (boss !== null) Object.assign(def, { boss })

  // Structural validation only. A level pasted into the editor mid-edit is
  // routinely not yet a *campaign* level — it may have one conch and no pearls
  // — and refusing to load it would make the tool unusable for the job it
  // exists to do.
  loadLevel(def)
  return def
}

// ── The small grammar this reads ────────────────────────────────────────────

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Undo a TypeScript string escape.
 *
 * `\uXXXX` matters more than it looks: World 1's up-dash prompt is written as
 * `'HOLD \u2191 + X TO DASH UP'`, and a parser that took those six characters
 * literally would round-trip the only instruction in that room into nonsense.
 * Scanned left to right rather than replaced pattern by pattern, so a literal
 * backslash before a `u` stays a literal backslash.
 */
function unescape(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i]
      continue
    }
    const next = s[++i]
    if (next === 'u') {
      const hex = s.slice(i + 1, i + 5)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16))
        i += 4
        continue
      }
    }
    out += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '')
  }
  return out
}

function str(src: string, key: string): string | null {
  const m = new RegExp(`(?:^|[,{\\s])${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(src)
  return m ? unescape(m[1]!) : null
}

function num(src: string, key: string): number | null {
  const m = new RegExp(`(?:^|[,{\\s])${key}:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(src)
  return m ? Number(m[1]) : null
}

/**
 * The text between `key: [` and its matching `]`.
 *
 * Counted rather than matched with a regex, because `entities` contains nested
 * brackets — a snapper's patrol is `[10, 16]` — and a lazy `\[(.*?)\]` stops at
 * the first one it meets.
 */
function block(src: string, key: string): string | null {
  const open = new RegExp(`(?:^|[,{\\s])${key}:\\s*\\[`).exec(src)
  if (!open) return null
  const start = open.index + open[0].length
  let depth = 1
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return src.slice(start, i)
    }
  }
  throw new LevelSourceError(`the ${key} array is never closed`)
}

/** Each `{ ... }` in a block, as a plain object. */
function records(block: string): Record<string, Literal>[] {
  return [...block.matchAll(/\{([^{}]*)\}/g)].map((m) => fields(m[1]!))
}

function fields(body: string): Record<string, Literal> {
  const out: Record<string, Literal> = {}
  // Split on commas that are not inside quotes or brackets. A hint's text may
  // contain anything at all, including a comma, which is why this is a scan
  // rather than a `split(',')`.
  for (const [, key, raw] of body.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*('(?:[^'\\]|\\.)*'|\[[^\]]*\]|[^,]+)/g)) {
    out[key!] = value(raw!.trim())
  }
  return out
}

function value(raw: string): Literal {
  if (raw.startsWith("'")) return unescape(raw.slice(1, -1))
  if (raw.startsWith('[')) {
    const parts = raw
      .slice(1, -1)
      .split(',')
      .map((p) => Number(p.trim()))
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
      throw new LevelSourceError(`${raw} is not a pair of numbers`)
    }
    return [parts[0]!, parts[1]!] as const
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new LevelSourceError(`${raw} is not a value a level can hold`)
  return n
}

/** One entity or hint, as a single line. Keys in their authored order. */
function record(fields: Record<string, Literal>): string {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${literal(v)}`)
  return `{ ${parts.join(', ')} }`
}

function literal(v: Literal): string {
  if (typeof v === 'string') return `'${escape(v)}'`
  if (typeof v === 'number') return String(v)
  return `[${v[0]}, ${v[1]}]`
}
