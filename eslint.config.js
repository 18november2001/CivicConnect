'use strict';

/**
 * Static analysis configuration for CivicConnect.
 *
 * Rules are selected for correctness and for the failure modes this codebase
 * is actually exposed to, rather than for style. The lifecycle and messaging
 * code is asynchronous and transactional, so an unhandled promise or a value
 * silently discarded from an executor is a defect class worth failing a build
 * over. Formatting preferences are deliberately excluded: a gate that fires on
 * indentation becomes a gate the team learns to dismiss.
 *
 * This configuration found DEF-005 on its first run.
 */

module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly'
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'error',
      'no-async-promise-executor': 'error',
      'no-return-await': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-shadow': 'error',
      'no-throw-literal': 'error'
    }
  }
];
