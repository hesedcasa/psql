import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import tseslint from 'typescript-eslint'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

const config = [
  includeIgnoreFile(gitignorePath),
  {
    ignores: ['coverage/', 'dist/'],
  },
  ...oclif,
  // Disable type-checked (type-aware) rules for test files. Test fixtures and
  // mocks don't need full type information and shouldn't fail type-aware rules
  // such as no-unsafe-* / no-base-to-string. Mirrors plugin-lib#63.
  {
    files: ['test/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Relax overly-strict rules from eslint-config-oclif@7 across the project.
  {
    rules: {
      // pg and the config layer legitimately use null (not undefined)
      '@typescript-eslint/no-restricted-types': 'off',
    },
  },
  {
    files: ['src/commands/**/*.ts', 'src/base-command.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Commands assert the concrete `*Data` payload type rather than using a
      // bare `!`, which documents the shape being narrowed.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // The auth command factories from @hesed/plugin-lib accept async
      // teardown/test callbacks through void-returning option slots.
      '@typescript-eslint/strict-void-return': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'perfectionist/sort-classes': 'off',
      'require-unicode-regexp': 'off',
      // `skipConfirmation` / `requiresConfirmation` are part of the documented
      // config and module API — renaming them would be a breaking change.
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/consistent-class-member-order': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      // Iterator helpers (`Iterator#toArray()`) are ES2025; the build targets
      // ES2022, so spreading an iterator is still the portable form.
      'unicorn/prefer-iterator-to-array': 'off',
    },
  },
  // Additional relaxations for test files only. These are pure style rules
  // that conflict with common test patterns (mock stubs, mock-tracking
  // booleans, the documented bare `eslint-disable max-params` convention).
  {
    files: ['test/**/*.ts'],
    rules: {
      '@eslint-community/eslint-comments/require-description': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      // The config demands the 'v' flag, which needs an ES2024 target; the
      // build targets ES2022, so 'u' is the strongest flag available.
      'require-unicode-regexp': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-non-function-verb-prefix': 'off',
      'unicorn/prefer-https': 'off',
    },
  },
  prettier,
]

export default config
