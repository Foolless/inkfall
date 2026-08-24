import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', '.scratch'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // Build scripts run in Node and report to the terminal.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    // The simulation must never read ambient state: it would break replay
    // determinism, which speedrun timing and ghost playback depend on.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Non-deterministic: breaks replay.' },
        { object: 'Date', property: 'now', message: 'Non-deterministic: breaks replay.' },
        { object: 'performance', property: 'now', message: 'Non-deterministic: breaks replay.' },
      ],
    },
  },
)
