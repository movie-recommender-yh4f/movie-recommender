// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      'node_modules',
      '.pnpm-store',
      '.nuxt',
      '.output',
      'dist',
      '.vercel',
      '.netlify',
      '**/*.log',
      '.env',
      '.env.*',
    ],
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'no-console': 'warn',
      'vue/html-self-closing': 'off',
      'no-debugger': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['test/load/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        __ITER: 'readonly',
        __VU: 'readonly',
        open: 'readonly',
      },
    },
  }
)
