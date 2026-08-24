import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// GitHub Pages serves a project site from /<repo>/, so every asset URL needs
// that prefix or the deployed page 404s on its own bundle. Local dev and the
// preview server run from '/', hence the env switch.
const base = process.env.GITHUB_PAGES === 'true' ? '/inkfall/' : '/'

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: here('index.html'),
        spriteEditor: here('tools/sprite-editor/index.html'),
        levelEditor: here('tools/level-editor/index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/game/**', 'src/engine/loop.ts', 'src/engine/input.ts', 'src/content/**'],
      // Rendering is covered by the browser smoke test and human eyes; pixel
      // diffing a canvas produces failures nobody can act on.
      exclude: ['src/engine/renderer.ts', 'src/engine/debug.ts', 'src/main.ts'],
    },
  },
})
