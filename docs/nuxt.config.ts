export default defineNuxtConfig({
  modules: [
    "@nuxt/content",
    process.env.NODE_ENV === "development" ? "nuxt-studio" : [],
  ].filter(Boolean),
  css: ["~/assets/css/main.css"],
  routeRules: {
    "/**": {
      ogImage: false,
    },
  },
  studio: {
    route: "/_studio",
  },
  devtools: {
    enabled: false,
  },
  mdc: {
    highlight: {
      theme: {
        default: "github-light",
        dark: "github-dark",
      },
      langs: [
        "js",
        "ts",
        "python",
        "powershell",
        "bash",
        "json",
        "yaml",
        "html",
        "css",
        "vue",
        "sql",
      ],
    },
  },
  assistant: {
    floatingInput: false,
    explainWithAi: false,
  },
  app: {
    head: {
      link: [
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/favicon.svg?v=2",
        },
      ],
    },
  },
});
