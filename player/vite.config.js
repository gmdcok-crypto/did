import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '../backend/certs')
const hasCerts = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))
// 로컬 개발 기본: 백엔드 HTTP. HTTPS 백엔드 쓸 때만 VITE_BACKEND_HTTPS=1
const useHttp = process.env.VITE_DEV_HTTP === '1' || process.env.USE_HTTP === '1'
const backendHttps = process.env.VITE_BACKEND_HTTPS === '1'
const backendTarget = backendHttps ? 'https://127.0.0.1:8000' : 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // 스케줄은 캐시하지 않음: NetworkFirst(5초 타임아웃) 시 옛 JSON이 계속 나와 기기 삭제/재등록이 막힘
          {
            urlPattern: /\/api\/player\/schedule/,
            handler: 'NetworkOnly',
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
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
