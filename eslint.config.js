// ESLint flat config — covers CLI runtime (Node ESM) and React web frontend.
// Keep rules minimal: recommended + a small set of "real-bug" rules. Style is
// owned by Prettier (eslint-config-prettier disables conflicting rules).

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'web/node_modules/**',
      'docker/web-dist/**',
      'web/dist/**',
      'test-results/**',
      'web/test-results/**',
      '**/playwright-report/**',
    ],
  },

  // Node / CLI sources
  {
    files: ['bin/**/*.js', 'lib/**/*.js', 'tests/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-useless-catch': 'off',
    },
  },

  // Playwright e2e — callbacks inside page.evaluate(...) execute in the browser
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // React web sources
  {
    files: ['web/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react },
    settings: { react: { version: '18.3' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // '// ' prefixes in headers/labels are intentional terminal-style UI text.
      'react/jsx-no-comment-textnodes': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Vitest tests for the web app
  {
    files: ['web/src/**/__tests__/**/*.{js,jsx}', 'web/**/*.test.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, vi: 'readonly' },
    },
  },

  prettier,
];
