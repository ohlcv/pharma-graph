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
    files: ['src/**/*.ts', 'scripts/**/*.ts', 'archive/**/*.ts', 'tests/**/*.ts', 'tools/**/*.ts'],
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
        URLSearchParams: 'readonly',
        location: 'readonly',
        performance: 'readonly',
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
        // Web Speech API (TTS) — used by src/ui/speech.ts
        SpeechSynthesis: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        SpeechSynthesisVoice: 'readonly',
        speechSynthesis: 'readonly',
        queueMicrotask: 'readonly',
        // Canvas + ResizeObserver — src/core/spectacle/ 的 overlay 逐帧重绘用
        HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        ResizeObserver: 'readonly',
        getComputedStyle: 'readonly',
        CSSStyleDeclaration: 'readonly',
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

      // no-undef is a core (non-type-aware) rule that predates TypeScript.
      // tsc already rejects undefined identifiers at compile time — and
      // better, it understands `import type`, type-only positions, and
      // ambient declarations, which no-undef cannot. Leaving it on produced
      // 602 false positives (mostly `document`, `process`, `cytoscape`) that
      // had to be suppressed by hand-maintaining a `globals` allowlist.
      'no-undef': 'off',
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
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: false,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
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

  // tools/* — one-off measurement / migration scripts (AGENTS.md §2.2).
  // Two things make the JS-recommended rules wrong here:
  //
  // 1. no-undef — these are plain Node ESM (process, console) and several
  //    generate an HTML page they inject into a headless browser (document,
  //    window, requestAnimationFrame). One file has to be both, so no single
  //    env's globals list is right.
  // 2. no-unused-vars — some of these build a page as a template string and
  //    reference the imported symbols *inside* that string (see
  //    preview-fractal-tree.mjs, which imports generateTree then injects it
  //    into generated HTML). ESLint can't see through the string, so every
  //    such import is a false positive.
  //
  // These scripts are throwaway by design and are not part of the build
  // chain, so a slightly lax config costs nothing. Real logic still gets
  // type-checked where it matters — the src/ and tests/ blocks below.
  {
    files: ['tools/**/*.mjs', 'tools/**/*.cjs', 'tools/**/*.js', 'tools/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
      // Same as the src/ block: `catch {}` with no binding is used
      // deliberately here (dev-server readiness polling swallows connection
      // errors until the deadline).
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
