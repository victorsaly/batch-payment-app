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
  { ignores: ['dist/**', 'node_modules/**', 'docs/**', 'build/**'] },

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
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node }
    }
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
