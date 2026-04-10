import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FullscreenButton from './FullscreenButton'
import { ErrorBoundary } from './ErrorBoundary'
import './style.css'

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
        <FullscreenButton />
      </ErrorBoundary>
    </React.StrictMode>,
  )
} else {
  document.body.innerHTML = '<div style="padding:2rem;background:#000;color:#fff;">root 요소를 찾을 수 없습니다.</div>'
}
