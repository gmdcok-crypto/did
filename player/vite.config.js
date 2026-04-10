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

/** 로컬에서 플레이어 포트(5174)로 /admin 을 열면 Vite SPA 폴백으로 플레이어 index만 내려가 CMS 대신 플레이어가 보임 → CMS dev로 리다이렉트 */
function redirectAdminToCmsDev() {
  const cmsOrigin = (process.env.VITE_CMS_DEV_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '')
  return {
    name: 'redirect-admin-to-cms-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || ''
        const pathOnly = raw.split('?')[0] || ''
        if (pathOnly !== '/admin' && !pathOnly.startsWith('/admin/')) {
          next()
          return
        }
        const tail = pathOnly === '/admin' || pathOnly === '/admin/' ? '/' : pathOnly.slice('/admin'.length) || '/'
        const qs = raw.includes('?') ? `?${raw.split('?').slice(1).join('?')}` : ''
        res.writeHead(302, { Location: `${cmsOrigin}${tail}${qs}` })
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    redirectAdminToCmsDev(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 오프라인 시 navigateFallback 은 플레이어 index.html 한 장만 쓰도록: `/admin` 등은 폴백 금지(Railway 같은 단일 도메인에서 /admin 이 플레이어로 보이는 현상 방지)
        navigateFallbackAllowlist: [/^\/$/],
        navigateFallbackDenylist: [
          /^\/admin/,
          /^\/api\//,
          /^\/docs/,
          /^\/redoc/,
          /^\/openapi\.json/,
          /^\/health/,
          /^\/setup-database/,
        ],
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
    // 인증서 없거나 useHttp면 HTTP로 띄워서 로컬 백엔드(http)와 혼합 콘텐츠 차단 방지
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
