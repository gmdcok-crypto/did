import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '../backend/certs')
const hasCerts = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))
// Docker 백엔드(http) 사용 시: VITE_DEV_HTTP=1 로 HTTP 서버로 띄우면 혼합 콘텐츠 방지
const useHttp = process.env.VITE_DEV_HTTP === '1' || process.env.USE_HTTP === '1'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
// 인증서 없거나 useHttp면 HTTP로 띄워서 Docker 백엔드(http)와 혼합 콘텐츠 차단 방지
    https: !useHttp && hasCerts
      ? {
          key: fs.readFileSync(path.join(certDir, 'key.pem')),
          cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
        }
      : false,
    host: '::',
  },
})
