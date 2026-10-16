import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // Le SW se met à jour tout seul : pas de bandeau « nouvelle version »
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Legion4me',
        short_name: 'Legion4me',
        description: 'Interface personnelle pour LLMs locaux via Ollama',
        lang: 'fr',
        // standalone = fenêtre sans barre d'adresse, comme une app native
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#0d0a14',
        theme_color: '#0d0a14',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Précache uniquement le shell applicatif
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 5 Mo : le bundle contient emoji-mart (~400 Ko) et les polices
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // L'API ne doit JAMAIS être interceptée : SSE en streaming, réponses
        // toujours fraîches. Le fallback SPA doit aussi laisser passer /api.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Les images de messages sont immuables — cache long, hors précache.
            // Pas d'ancre `^` : Workbox teste l'URL complète (origine comprise).
            urlPattern: /\/api\/conversations\/[^/]+\/messages\/[^/]+\/images\/\d+$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'message-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Disable compression so SSE chunks aren't buffered
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })
        },
      },
    },
  },
})
