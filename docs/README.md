# NextWatch Docs

This directory contains the Docus site for the current NextWatch codebase.

## Commands

Run these from `docs/`:

```bash
npm install
npm run dev
npm run build
npm run preview
```

The docs site runs separately from the main app. The app lives in `../app` and has its own dependencies, environment variables, and dev server.

## What Lives Here

- `content/` - Markdown pages for developer documentation
- `public/` - Static assets served by the docs site
- `nuxt.config.ts` - Docs-specific Nuxt configuration

## Scope

Keep these docs aligned with the live implementation in `../app`. If a route, table, environment variable, or setup step changes in the app, update the corresponding docs here instead of adding parallel notes elsewhere.
