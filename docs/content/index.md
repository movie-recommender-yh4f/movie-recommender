---
seo:
  title: NextWatch - Developer Docs
  description: Technical documentation for the current NextWatch codebase.
---

::div{.nextwatch-landing}
:landing-mouse-glow

  :::u-page-hero
  #title
  NextWatch

  #description
  Documentation for the current NextWatch codebase, styled to feel like the product it explains.

  #links
    ::::u-button
    ---
    color: primary
    size: xl
    to: /getting-started/introduction
    trailing-icon: i-lucide-arrow-right
    ---
    Start Here
    ::::

    ::::u-button
    ---
    color: neutral
    icon: simple-icons-github
    size: xl
    to: https://github.com/anp-studio/nextwatch
    variant: outline
    ---
    Star on GitHub
    ::::
  :::

  :::div{.nextwatch-card-section}
    ::::div{.nextwatch-feature-grid}
      :::::landing-feature-card
      ---
      eyebrow: "Runtime Setup"
      title: "Getting Started"
      chip: "Install + Configure"
      icon: "i-lucide-rocket"
      to: "/getting-started/installation"
      description: "Environment variables, local installation, project structure, and the practical steps to get NextWatch running."
      ---
      :::::

      :::::landing-feature-card
      ---
      eyebrow: "Recommendation Engine"
      title: "Backend API"
      chip: "Routes + Data Flow"
      icon: "i-lucide-server"
      to: "/api/overview"
      description: "Authenticated routes, recommendation generation, quotas, TMDB ingestion, and the server-side rules behind every result."
      ---
      :::::

      :::::landing-feature-card
      ---
      eyebrow: "Card Experience"
      title: "Frontend"
      chip: "Pages + Composables"
      icon: "i-lucide-layout"
      to: "/frontend/components"
      description: "Pages, composables, and interface structure powering search, watched history, watchlists, and the main recommendation flow."
      ---
      :::::
    ::::
  :::
::
