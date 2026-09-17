// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
  {
    // Module boundary: core/ is the engine every other layer depends on, never
    // the reverse. cli/, github/, and fix/ are additive layers built on top of
    // it in later phases — if core/ ever imports one of them, that boundary
    // has silently broken.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cli/*', '**/cli', '**/github/*', '**/github', '**/fix/*', '**/fix'],
              message:
                'core/ must not depend on cli/, github/, or fix/ — those are additive layers built on top of core, not the other way around.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'test/fixtures/**'],
  },
];
