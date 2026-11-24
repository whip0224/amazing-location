import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 👈 把這行裁縫師請回來！
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 👈 啟動裁縫師！
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Amazing Location',
        short_name: '旅遊清單',
        description: '你的專屬旅遊景點收集神器',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api/places/searchText': {
        target: 'https://places.googleapis.com',
        changeOrigin: true,
        rewrite: () => '/v1/places:searchText',
        headers: {
          Referer: 'http://localhost:5173/'
        }
      }
    }
  }
})