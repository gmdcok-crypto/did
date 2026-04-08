import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '../backend/certs')
const hasCerts = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))
// 로컬 개발 기본: 백엔드 HTTP. HTTPS 백엔드 쓸 때만 VITE_BACKEND_HTTPS=1
const useHttp = process.env.VITE_DEV_HTTP === '1' || process.env.USE_HTTP === '1'
const backendHttps = process.env.VITE_BACKEND_HTTPS === '1'
const backendTarget = backendHttps ? 'https://localhost:8000' : 'http://localhost:8000'

// 백엔드가 HTTPS(자체서명)일 때 프록시가 인증서 검증 통과하도록
const isBackendHttps = backendTarget.startsWith('https://')
const proxyOptions = {
  target: backendTarget,
  changeOrigin: true,
  secure: false,
  ...(isBackendHttps && { agent: new https.Agent({ rejectUnauthorized: false }) }),
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 인증서 있으면 HTTPS 통일; useHttp면 HTTP
    https: !useHttp && hasCerts
      ? {
          key: fs.readFileSync(path.join(certDir, 'key.pem')),
          cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
        }
      : false,
    host: '::',
    proxy: {
      '/api': proxyOptions,
      '/uploads': proxyOptions,
      '/health': proxyOptions,
    },
  },
})
