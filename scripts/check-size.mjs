import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bundle-size gate.
 *
 * Size regressions are gradual and invisible until they are expensive. A hard
 * limit that fails the build is the only thing that actually holds, which is
 * why this runs in CI from the first commit rather than being added in Phase 4.
 */
const LIMIT = 1.5 * 1024 * 1024

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

let total = 0
const rows = []
for (const file of walk('dist')) {
  const gz = gzipSync(readFileSync(file)).length
  total += gz
  rows.push([file, gz])
}

rows.sort((a, b) => b[1] - a[1])
const kb = (n) => `${(n / 1024).toFixed(1)} kB`
for (const [file, gz] of rows.slice(0, 12)) console.log(`  ${kb(gz).padStart(10)}  ${file}`)

console.log(`\n  total gzipped: ${kb(total)} / ${kb(LIMIT)} (${((total / LIMIT) * 100).toFixed(1)}%)`)
if (total > LIMIT) {
  console.error(`\nFAIL: bundle is ${kb(total - LIMIT)} over budget.`)
  process.exit(1)
}
