// https://nuxt.com/docs/api/configuration/nuxt-config
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css', '~/assets/css/session-mission.css'],
  // GitHub Pages has no Nitro icon API. Bundle Lucide icons into the
  // static client so Settings checkboxes (and toolbar buttons) render
  // without fetching /api/_nuxt_icon or api.iconify.design.
  icon: {
    clientBundle: {
      scan: true,
      icons: [
        'lucide:bug',
        'lucide:check',
        'lucide:download',
        'lucide:minus',
        'lucide:pencil',
        'lucide:play',
        'lucide:settings',
        'lucide:square',
      ],
    },
  },
  // Local/dev servers can enable live SharedArrayBuffer debugging.
  // GitHub Pages cannot set these headers, so production falls back to
  // precomputed step-through traces in usePythonRuntime.
  routeRules: {
    '/**': {
      headers: isolationHeaders,
    },
  },
  vite: {
    server: {
      headers: isolationHeaders,
    },
  },
  typescript: {
    strict: true,
  },
})
