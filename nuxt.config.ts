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
