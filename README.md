# NextWatch

NextWatch is a Nuxt 4 movie recommendation app. It supports authenticated recommendation feeds, watched-history tracking, My List management, onboarding, cached movie metadata, and a separate Docus-powered developer docs site.

## Links

- App: [nextwatch.dev](https://nextwatch.dev)
- Docs: [docs.nextwatch.dev](https://docs.nextwatch.dev)

## Repository Layout

```text
movie-recommender/
├── app/               # NextWatch app (Nuxt 4 full-stack app)
│   ├── app/           # Client code: pages, components, composables, layouts
│   ├── server/        # API routes and server-side utilities
│   ├── public/        # Static assets and web manifest
│   └── test/          # Vitest and Nuxt server route coverage
└── docs/              # Docus documentation site (separate Nuxt app)
```

All development happens in `app/`. The `docs/` site is a separate Nuxt app with its own dependencies and build.

## Overview

NextWatch combines imported TMDB movie data with authenticated user state:

- Watched history is stored in Supabase
- My List is stored in Supabase and updated through RPC helpers
- Recommendation generation builds a taste profile from watched movies and My List
- The server calls one or more configured AI providers through `app/server/utils/recommendations/ai-client.ts`
- Returned candidates are resolved back to TMDB IDs, validated server-side, and cached in Supabase
- Movie detail lookups and search are served through hardened server routes instead of exposing upstream keys to the browser, with Redis-backed miss budgets and negative caching on public detail fetches

## Stack

- Nuxt 4
- Vue 3
- Supabase for auth and application data
- TMDB for movie discovery and metadata import
- OpenAI-compatible AI provider integrations
- Upstash Redis for rate limiting and movie-detail negative caching
- hCaptcha for signup protection
- Vitest and Nuxt test utilities for tests
- Docus for the docs site

## Local Development

### Prerequisites

- Node.js
- npm
- Git
- A Supabase project
- A TMDB API key
- At least one configured AI provider

### App Setup

Run all application commands from `app/`:

```bash
cd app
npm install
```

Create `app/.env` or `app/.env.local` with the runtime configuration below.

### Required Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL | Yes |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key | Yes |
| `NUXT_SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access | Yes |
| `NUXT_TMDB_API_KEY` | TMDB API access | Yes |
| `NUXT_PUBLIC_HCAPTCHA_SITE_KEY` | Signup widget key | Yes |
| `NUXT_HCAPTCHA_SECRET` | Server-side hCaptcha verification | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | Yes |
| `ADMIN_API_TOKEN` | Protects `/api/admin/tmdb-import` | Yes |
| `NUXT_GOOGLE_API_KEY` | Google AI Studio provider key | Yes, unless OpenRouter is configured |
| `NUXT_GOOGLE_MODELS` | Ordered Google model fallback list | No |
| `NUXT_OPENROUTER_API_KEY` | OpenRouter provider key | Yes, unless Google AI Studio is configured |
| `NUXT_OPENROUTER_MODELS` | Ordered OpenRouter model fallback list | No |

At least one AI provider must be configured for recommendation generation to work. If both are configured, the server tries Google AI Studio first and then OpenRouter.

### Run the App

```bash
cd app
npm run dev
```

The app runs at `http://localhost:3000`.

### Run the Docs Site

Use `docs/` only when you are editing or verifying the documentation site:

```bash
cd docs
npm install
npm run dev
```

## Commands

### App Commands

Run these from `app/`:

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm run test
```

### Docs Commands

Run these from `docs/`:

```bash
npm run dev
npm run build
npm run preview
```

## API Surface

The current server routes live under `app/server/api/`.

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/recommend` | Bearer token | Return cached or regenerated TMDB recommendation IDs |
| `GET /api/recommend/quota` | Bearer token | Return the authenticated user's remaining daily recommendation quota |
| `POST /api/auth/signup` | None | Create an account with hCaptcha validation |
| `POST /api/auth/email-exists` | None | Validate an email and return whether it already exists |
| `GET /api/onboarding/status` | Bearer token | Return whether onboarding has been completed |
| `POST /api/onboarding/complete` | Bearer token | Seed watched movies and mark onboarding complete |
| `GET /api/movies/search` | None | Search movies |
| `GET /api/movies/popular` | None | Return a cached popular-movies feed |
| `GET /api/movies/:id` | None | Return cached movie details, negative-cache TMDB 404s in Redis, and charge miss budgets only on uncached upstream fetches |
| `POST /api/movies/metadata` | Bearer token | Hydrate TMDB IDs into lightweight movie cards |
| `GET \| POST \| DELETE /api/watched` | Bearer token | Read and update watched history |
| `GET \| POST \| DELETE /api/mylist` | Bearer token | Read and update My List |
| `POST /api/admin/tmdb-import` | `x-admin-token` | Import the TMDB export into Supabase |

## Recommendation Flow

`GET /api/recommend` is the main protected endpoint:

1. The server authenticates the Supabase user.
2. It loads watched history and My List state.
3. It builds a taste profile from that data.
4. It calls the configured AI provider chain.
5. It resolves candidate titles back to TMDB IDs through Supabase search first, with TMDB fallback when needed.
6. It filters out invalid, duplicate, watched, or disallowed results.
7. It caches the final TMDB ID set in Supabase for reuse.

Important behavior:

- `?refresh=true` forces regeneration
- `?getNew=true` forces regeneration and excludes the previous cached set
- Successful responses return TMDB IDs only; the frontend hydrates details separately

## Data Model

Key Supabase tables and helpers used by the app:

- `movies` for imported TMDB records and cached movie details
- `user_watched_movies` for watched-state rows
- `user_my_list` for saved TMDB IDs
- `recommendations` for cached recommendation TMDB IDs
- `profiles.onboarding_completed_at` for onboarding completion state
- `auth_email_exists` RPC to check duplicate emails
- `append_my_list` and `remove_my_list` RPC helpers for atomic My List updates

## TMDB Import

The movie corpus is populated through `POST /api/admin/tmdb-import`.

Example local trigger:

```bash
curl -X POST http://localhost:3000/api/admin/tmdb-import \
  -H "x-admin-token: <ADMIN_API_TOKEN>"
```

In production, the scheduled GitHub Actions workflow calls this same endpoint with the admin token.

## Rate Limiting

The app currently uses Upstash-backed rate limiting for:

- TMDB-backed requests
- Recommendation generation
- Authenticated movie metadata hydration

`GET /api/movies/:id` also uses Upstash Redis for a 24-hour negative cache of TMDB 404 responses. Positive Supabase cache hits and Redis negative-cache hits stay free, while anonymous uncached misses require the `x-vercel-forwarded-for` header before the durable miss budget is charged.

These limiters live under `app/server/utils/` and are applied server-side before sensitive or high-volume operations.

## Verification and CI

Application verification should be run from `app/`:

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

Production dependency audits can be checked with:

```bash
npm audit --omit=dev
```

The repository also includes GitHub Actions CI for:

- app dependency install
- app production audit
- app typecheck, tests, lint, and build
- docs dependency install
- docs production audit
- docs build

## Important Paths

| What | Path |
|---|---|
| Client pages | `app/app/pages/` |
| Shared components | `app/app/components/` |
| Client composables | `app/app/composables/` |
| API routes | `app/server/api/` |
| Recommendation utilities | `app/server/utils/recommendations/` |
| TMDB utilities | `app/server/utils/tmdb/` |
| Auth utilities | `app/server/utils/auth/` |
| Shared server helpers | `app/server/utils/shared/` |
| Tests | `app/test/` |
| Docs content | `docs/content/` |

## Documentation

The docs site in `docs/` is intended to stay aligned with the live implementation in `app/`. If you change routes, environment variables, tables, workflows, or operational behavior, update the matching docs content rather than adding disconnected notes elsewhere.
