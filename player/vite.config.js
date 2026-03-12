import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '../backend/certs')
const hasCerts = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))
// Docker 백엔드(http) 사용 시: VITE_DEV_HTTP=1 로 HTTP 서버로 띄우면 혼합 콘텐츠 방지
const useHttp = process.env.VITE_DEV_HTTP === '1' || process.env.USE_HTTP === '1'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/player\/schedule/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'schedule-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            urlPattern: /\/uploads\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'uploads-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /\.(?:mp4|webm|jpg|jpeg|png|gif|webp)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'media-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    // 인증서 없거나 useHttp면 HTTP로 띄워서 Docker 백엔드(http)와 혼합 콘텐츠 차단 방지
    https: !useHttp && hasCerts
      ? {
          key: fs.readFileSync(path.join(certDir, 'key.pem')),
          cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
        }
      : false,
    host: '::',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: (useHttp || !hasCerts) ? 'http://127.0.0.1:8000' : 'https://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: (useHttp || !hasCerts) ? 'http://127.0.0.1:8000' : 'https://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
