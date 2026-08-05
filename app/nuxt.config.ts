import { createThemeBootstrapScript } from './app/utils/theme'
import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
    '@vueuse/nuxt',
    '@nuxt/eslint',
    '@vercel/speed-insights',
    '@vercel/analytics',
  ],
  alias: {
    '#mdc-configs': fileURLToPath(new URL('./mdc-configs.ts', import.meta.url)),
    '#mdc-imports': fileURLToPath(new URL('./mdc-imports.ts', import.meta.url)),
  },
  css: ['~/assets/css/transitions.css'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'NextWatch',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/pwa-icon.svg' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      script: [
        {
          innerHTML: createThemeBootstrapScript(),
          tagPosition: 'head',
        },
      ],
    },
  },
  runtimeConfig: {
    tmdbApiKey: process.env.NUXT_TMDB_API_KEY ?? '',
    googleApiKey: process.env.NUXT_GOOGLE_API_KEY ?? '',
    googleModels:
      process.env.NUXT_GOOGLE_MODELS ??
      'gemini-flash-lite-latest,gemini-2.5-flash-lite,gemini-2.0-flash-lite',
    openRouterApiKey: process.env.NUXT_OPENROUTER_API_KEY ?? '',
    openRouterModels:
      process.env.NUXT_OPENROUTER_MODELS ??
      'deepseek/deepseek-v4-flash,google/gemini-2.5-flash-lite',
    adminToken: process.env.ADMIN_API_TOKEN ?? '',
    supabaseServiceRoleKey: process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? '',
    hcaptchaSecretKey: process.env.NUXT_HCAPTCHA_SECRET ?? '',
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      hcaptchaSiteKey: process.env.NUXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '',
    },
    upstash: {
      redisUrl: process.env.UPSTASH_REDIS_REST_URL ?? '',
      redisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    },
  },
  vite: {
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@supabase/supabase-js',
        '@hcaptcha/vue3-hcaptcha',
      ],
    },
  },
  routeRules: {
    '/**': {
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "img-src 'self' data: https://image.tmdb.org https://*.supabase.co https://*.ytimg.com",
          "script-src 'self' 'unsafe-inline' https://js.hcaptcha.com https://www.youtube.com https://hcaptcha.com",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' https://*.supabase.co https://hcaptcha.com https://*.hcaptcha.com https://www.youtube.com",
          'frame-src https://*.hcaptcha.com https://www.youtube.com https://www.youtube-nocookie.com',
          "font-src 'self'",
          "form-action 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      },
    },
  },
})
