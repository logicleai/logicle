import { FlatCompat } from '@eslint/eslintrc'
import path from 'path'
import { fileURLToPath } from 'url'
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import prettierConfig from 'eslint-config-prettier'
import tsParser from '@typescript-eslint/parser'
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'
import eslint from '@eslint/js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default tseslint.config(
  js.configs.recommended,
  eslint.configs.recommended,
  tseslint.configs.recommended,
  //TODO: enable at least strict mode
  //tseslint.configs.strict,
  //tseslint.configs.stylistic,
  prettierConfig,
  i18next.configs['flat/recommended'],
  ...compat.extends('next/core-web-vitals'),
  ...compat.extends('next/typescript'),
  {
    ignores: ['.next/**/*', 'coverage/**/*', 'dist/**/*', '*.js'],
  },
  {
    // Lint all JS/TS files
    files: ['**/*.{js,ts,tsx}'],
    // Use languageOptions instead of env/parserOptions
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
      // Simulate env.browser and env.node by adding their globals:
      globals: {
        //...globals.browser,
        //...globals.node,
      },
    },
    // Define plugins as objects (not as strings)
    plugins: {
      react: reactPlugin,
      '@typescript-eslint': tsPlugin,
    },
    // Settings (e.g. for React version detection)
    settings: {
      react: {
        version: 'detect',
      },
    },
    // Your custom rules remain the same
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  }
)
