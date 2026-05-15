import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Use existing public/manifest.json instead of generating one
      manifest: false,
      includeAssets: ['images/favicon.ico', 'images/icon.png', 'images/apple-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Don't intercept Convex API calls — they need real-time WebSocket
        navigateFallbackDenylist: [/^\/api\//, /\.convex\.(cloud|site)/],
        runtimeCaching: [
          {
            // Skip caching dynamic Convex traffic — always fetch live
            urlPattern: ({ url }) => url.hostname.endsWith('convex.cloud') || url.hostname.endsWith('convex.site'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false, // Avoid SW conflicts with Vite HMR in dev
      },
    }),
  ],
})
