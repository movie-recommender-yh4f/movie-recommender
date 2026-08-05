import privacyMarkdown from '../../content/legal/privacy.md?raw'
import termsMarkdown from '../../content/legal/terms.md?raw'
import tmdbMarkdown from '../../content/legal/tmdb.md?raw'

export interface LegalPageLink {
  description: string
  href: string
  label: string
}

export interface AboutFeatureItem {
  description: string
  title: string
}

export interface AboutTechnologyItem {
  detail: string
  name: string
}

export interface AboutActionLink {
  href: string
  isExternal?: boolean
  label: string
  supportingText: string
}

export const ABOUT_ROUTE = '/about'
export const PRIVACY_ROUTE = '/privacy'
export const TERMS_ROUTE = '/terms'
export const TMDB_ROUTE = '/about/tmdb'

export const TMDB_ATTRIBUTION_STATEMENT =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.'

export const LEGAL_PAGE_LINKS: LegalPageLink[] = [
  {
    label: 'About NextWatch',
    href: ABOUT_ROUTE,
    description: 'Project overview, open-source context, TMDB attribution, and links.',
  },
  {
    label: 'Privacy Policy',
    href: PRIVACY_ROUTE,
    description: 'Markdown-backed policy page you can edit later.',
  },
  {
    label: 'Terms of Service',
    href: TERMS_ROUTE,
    description: 'Markdown-backed terms page you can edit later.',
  },
]

export const ABOUT_FEATURES: AboutFeatureItem[] = [
  {
    title: 'Personal recommendation feed',
    description: 'Recommendations adapt to your watched history and saved list.',
  },
  {
    title: 'Watched and watchlist tracking',
    description: 'Keep a clean record of what you have finished and what you want next.',
  },
  {
    title: 'Guided onboarding',
    description: 'New accounts can seed preferences quickly before the first recommendation run.',
  },
  {
    title: 'Server-side movie data layer',
    description: 'Search, details, and recommendation hydration stay behind app routes.',
  },
]

export const ABOUT_TECHNOLOGIES: AboutTechnologyItem[] = [
  {
    name: 'Nuxt 4 + Vue 3',
    detail: 'Application framework and UI runtime.',
  },
  {
    name: 'Supabase',
    detail: 'Authentication plus user data such as watched history and My List.',
  },
  {
    name: 'TMDB',
    detail: 'Movie discovery, metadata, imagery, trailers, cast, crew, and related details.',
  },
  {
    name: 'OpenAI-compatible AI providers',
    detail: 'Recommendation generation through the configured provider chain.',
  },
  {
    name: 'Upstash Redis  + hCaptcha',
    detail: 'Rate limiting, negative caching, and signup protection.',
  },
  {
    name: 'Vercel',
    detail: 'Provides hosting, deployments, and infrastructure for the NextWatch application.',
  },
]

export const ABOUT_ACTION_LINKS: AboutActionLink[] = [
  {
    label: 'GitHub Repository',
    href: 'https://github.com/anp-studio/nextwatch',
    supportingText: 'Browse the codebase, open issues, or contribute improvements.',
    isExternal: true,
  },
  {
    label: 'Project Docs',
    href: 'https://docs.nextwatch.dev',
    supportingText: 'Developer documentation for the app and its supporting systems.',
    isExternal: true,
  },
]

export const LEGAL_PAGE_MARKDOWN = {
  privacy: privacyMarkdown,
  terms: termsMarkdown,
  tmdb: tmdbMarkdown,
} as const

export type LegalPageSlug = keyof typeof LEGAL_PAGE_MARKDOWN
