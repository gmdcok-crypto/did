import { useState, useEffect, useCallback } from 'react'

function getFullscreenElement() {
  if (typeof document === 'undefined') return null
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null
}

async function requestFullscreenOn(el) {
  const fn = el.requestFullscreen ?? el.webkitRequestFullscreen
  if (!fn) return
  try {
    // 일부 Chromium: 주소줄 등 내비 UI 숨김 시도
    await fn.call(el, { navigationUI: 'hide' })
  } catch {
    await fn.call(el).catch(() => {})
  }
}

async function exitFullscreenDoc() {
  if (typeof document === 'undefined') return
  const fn = document.exitFullscreen ?? document.webkitExitFullscreen
  if (getFullscreenElement() && fn) await fn.call(document).catch(() => {})
}

export default function FullscreenButton() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () => setActive(!!getFullscreenElement())
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    sync()
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggle = useCallback(async () => {
    const el = document.documentElement
    if (getFullscreenElement()) {
      await exitFullscreenDoc()
    } else {
      await requestFullscreenOn(el)
    }
  }, [])

  /** 키오스크: ?fullscreen=1 이면 첫 사용자 입력(클릭/터치)에서 전체화면 시도 */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('fullscreen') !== '1') return
    let done = false
    const tryOnce = () => {
      if (done) return
      done = true
      window.removeEventListener('pointerdown', tryOnce, true)
      window.removeEventListener('click', tryOnce, true)
      requestFullscreenOn(document.documentElement).catch(() => {})
    }
    window.addEventListener('pointerdown', tryOnce, true)
    window.addEventListener('click', tryOnce, true)
    return () => {
      window.removeEventListener('pointerdown', tryOnce, true)
      window.removeEventListener('click', tryOnce, true)
    }
  }, [])

  return (
    <button
      type="button"
      className={`player-fullscreen-btn${active ? ' is-active' : ''}`}
      onClick={toggle}
      title={active ? '전체화면 종료 (Esc)' : '전체화면'}
      aria-pressed={active}
      aria-label={active ? '전체화면 종료' : '전체화면'}
    >
      ⛶
    </button>
  )
}
