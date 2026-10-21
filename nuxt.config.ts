// Nuxt runs as a pure client-side SPA so the generated output can be loaded
// as a Chrome extension page (chrome_url_overrides.newtab).
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,

  app: {
    // Chrome refuses to load extensions containing files or folders that start
    // with "_", so Nuxt's default "/_nuxt/" assets folder has to be renamed.
    buildAssetsDir: '/assets/',
    head: {
      // Look like the browser's own new tab: default title and the browser's logo.
      title: 'New Tab',
      htmlAttrs: { lang: 'en', style: 'background:#0a0a0b;color-scheme:dark' },
      bodyAttrs: { style: 'background:#0a0a0b;margin:0' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        {
          // The extension "_favicon" endpoint returns the icon the browser itself uses
          // for a page; chrome://version carries the product logo, so this shows the
          // Chrome logo in Chrome and the lion in Brave. (chrome://newtab can't be used:
          // it resolves to this extension's own icon because the extension overrides it.)
          rel: 'icon',
          href: '/_favicon/?pageUrl=chrome%3A%2F%2Fversion%2F&size=32',
        },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  experimental: {
    // The app manifest is fetched from /_nuxt/builds at runtime; not needed here.
    appManifest: false,
    // An inline <script type="importmap"> would be blocked by the extension CSP.
    entryImportMap: false,
  },

  vite: {
    build: {
      sourcemap: false,
    },
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              // Content hashes can start with "_", which Chrome rejects in extension
              // file names, so every JS file gets a letter prefix.
              entryFileNames: 'assets/e-[hash].js',
              chunkFileNames: 'assets/c-[hash].js',
            },
          },
        },
      },
    },
  },
})
