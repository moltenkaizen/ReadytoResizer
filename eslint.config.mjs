import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import figma from '@figma/eslint-plugin-figma-plugins';

export default tseslint.config(
  {
    // code.js is build output; the test file and this config run in Node
    // and aren't part of the plugin surface the TS rules target
    ignores: ['code.js', 'test/**', 'eslint.config.mjs'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      figma.flatConfigs.recommended,
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
