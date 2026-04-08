import { createContext, useContext, useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:8000/api')

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('token'))

  useEffect(() => {
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
        throw new Error('서버에 연결할 수 없습니다. 백엔드(http://localhost:8000)가 실행 중인지 확인하세요.')
      }
      throw err
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

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
