const js = require('@eslint/js');
const globals = require('globals');

/**
 * Flat ESLint config for PayBatch.
 *  - main.js / preload.js / tests run in Node (CommonJS).
 *  - src/*.js are classic browser scripts (shared global scope); the format
 *    engines also export via module.exports for the Node test suite, so they
 *    get both browser and node globals.
 */
module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'docs/**', 'build/**', 'src/renderer-dist/**'] },

  js.configs.recommended,

  {
    files: ['main.js', 'preload.js', 'test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },

  {
    files: ['vite.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },

  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node }
    }
  },

  // React renderer source: ESM + JSX, browser globals. Without
  // eslint-plugin-react (no ESLint 10 support yet) the base no-unused-vars
  // can't see JSX usage, so it's disabled here — Vite's build is the gate.
  {
    files: ['src/renderer-src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    rules: { 'no-unused-vars': 'off' }
  },

  {
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart']
    }
  }
];
