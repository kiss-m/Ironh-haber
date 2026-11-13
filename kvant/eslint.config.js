import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Relative imports carry their file extension everywhere ("./day.ts", "./App.tsx"). Vite does
 * not need it, but Node does, and `node scripts/x.ts` runs shared/ and scripts/ without a
 * bundler. One rule for the whole repo is easier to keep than two.
 */
const extensionlessRelativeImport = {
  regex: '^\\.{1,2}/(?:.*/)?[^./]+$',
  message: 'Write the file extension on relative imports: "./day.ts", "./App.tsx".',
};

/**
 * src/core and shared/ are pure TypeScript (docs/SPEC.md section 0): no React, DOM or Dexie, and
 * no dependency on the app's other layers. tsconfig.core.json backs this up by compiling both
 * folders without DOM and Node types.
 */
const impureModule = {
  group: [
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    'react-router',
    'react-router/*',
    'dexie',
    'dexie-react-hooks',
    'zustand',
    'zustand/*',
    'motion',
    'motion/*',
    'lucide-react',
    'virtual:*',
    'node:*',
  ],
  message: 'src/core and shared/ are pure TypeScript: no React, DOM, Dexie or Node APIs.',
};

const appLayer = {
  regex: '/(?:app|components|data|features|i18n|styles)/',
  message: 'src/core and shared/ must not depend on the app layers.',
};

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage', 'node_modules']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-restricted-imports': ['error', { patterns: [extensionlessRelativeImport] }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Numbers in template strings are routine in UI and in validation messages.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  // The browser app.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Pure code. Tests are exempt: they may build fixtures however they like.
  {
    files: ['src/core/**/*.ts', 'shared/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        { patterns: [extensionlessRelativeImport, impureModule, appLayer] },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'caches',
          'fetch',
          'location',
          'performance',
          'process',
        ].map((name) => ({
          name,
          message: 'src/core and shared/ are pure: pass what you need in as an argument.',
        })),
      ],
      // Determinism: the clock and the randomness are injected.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Take the current time as a parameter (`now: Date`).',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Take the current time as a parameter (`now: Date`).',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Take the random source as a parameter (`rng: () => number`).',
        },
      ],
    },
  },

  // Tests index into fixtures they have just built, so non-null assertions are fair there.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  // Code that runs in Node.
  {
    files: ['scripts/**/*.ts', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  // Plain JavaScript config files are linted without type information.
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Last: switch off every rule that would fight Prettier.
  prettier,
]);
