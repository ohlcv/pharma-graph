// ESLint flat config for pharma-graph
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**',
      'archive/**',
      'content-manifest.json',
      'coverage/**',
    ],
  },

  js.configs.recommended,

  // Prettier must be last so it overrides formatting rules.
  prettierConfig,

  {
    files: ['src/**/*.ts', 'scripts/**/*.ts', 'archive/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: false, // disable type-aware linting — keeps config lean for now
      },
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        Promise: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        PointerEvent: 'readonly',
        TransitionEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        JSON: 'readonly',
        // Node
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // TypeScript
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off', // lots of ! in cytoscape API
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // Safety net: production code must never import a test file. The
      // test/ directory is fenced off — the only way a `.test.*` path
      // shows up in production import is a mistake.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.test', '**/*.test.*', '**/?(*.)test?(.*)'],
              message:
                'Production code must not import test files. Tests live under tests/{unit,component,e2e}/; see AGENTS.md §2.4.',
            },
          ],
        },
      ],

      // Prettier
      'prettier/prettier': [
        'warn',
        {
          singleQuote: true,
          semi: true,
          trailingComma: 'all',
          printWidth: 100,
          tabWidth: 2,
          endOfLine: 'lf',
        },
      ],
    },
  },

  // Tests can use any, console.log, etc.
  {
    files: ['src/**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Scripts are standalone Node CLIs
  {
    files: ['scripts/**/*.ts', 'archive/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
