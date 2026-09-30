import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // 在這裡呼叫 VitePWA 並設定你的 App 資訊
    VitePWA({
      registerType: 'autoUpdate', // 自動更新 PWA 版本
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Amazing Location',
        short_name: '旅遊清單',
        description: '你的專屬旅遊景點收集神器',
        theme_color: '#2563eb', // 對應我們 UI 的藍色 (blue-600)
        background_color: '#ffffff',
        display: 'standalone', // 讓它在手機上開啟時沒有瀏覽器網址列，完全像個原生 App
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
            purpose: 'any maskable' // 讓 Android 系統可以自動把圖示裁切成圓角
          }
        ]
      }
    })
  ],
})