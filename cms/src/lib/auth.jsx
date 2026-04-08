import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { API_BASE } from './api'

const AuthContext = createContext(null)

/** 빌드 시 VITE_SKIP_AUTH=1 이면 로그인 화면 없이 기본 계정으로 자동 로그인(테스트용). 운영 배포에서는 넣지 말 것. */
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === '1'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => {
    if (SKIP_AUTH && !localStorage.getItem('token')) return true
    return !!localStorage.getItem('token')
  })
  const skipAuthTried = useRef(false)

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        const detail = e.detail
        const msg = Array.isArray(detail)
          ? (detail[0]?.msg || detail.map((x) => x.msg).join(', '))
          : (detail || '로그인 실패')
        throw new Error(typeof msg === 'string' ? msg : '로그인 실패')
      }
      const data = await res.json()
      localStorage.setItem('token', data.access_token)
      setToken(data.access_token)
      setUser({ email: data.email || email, role: data.role })
      return data
    } catch (err) {
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        throw new Error('서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.')
      }
      throw err
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    if (!token && SKIP_AUTH && !skipAuthTried.current) {
      skipAuthTried.current = true
      const email = import.meta.env.VITE_SKIP_AUTH_EMAIL || 'admin@example.com'
      const password = import.meta.env.VITE_SKIP_AUTH_PASSWORD || 'admin123'
      login(email, password)
        .catch(() => setLoading(false))
      return
    }
    if (!token) {
      setLoading(false)
      return
    }
    const onUnauthorized = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
          return Promise.reject(new Error('Unauthorized'))
        }
        if (!r.ok) return Promise.reject(new Error('Request failed'))
        return r.json()
      })
      .then(setUser)
      .catch((err) => {
        if (err?.message === 'Unauthorized') return
        setUser(null)
      })
      .finally(() => setLoading(false))
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [token])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
