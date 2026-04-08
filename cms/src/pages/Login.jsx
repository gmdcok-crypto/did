import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { API_BASE } from '../lib/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [seedDone, setSeedDone] = useState(false)
  const [backendOk, setBackendOk] = useState(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  const checkBackend = () => {
    setBackendOk(null)
    fetch('/health')
      .then((r) => (r.ok ? setBackendOk(true) : setBackendOk(false)))
      .catch(() => setBackendOk(false))
  }

  useEffect(() => {
    checkBackend()
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/auth/ensure-seed`)
      .then((r) => r.json())
      .catch(() => ({}))
      .finally(() => setSeedDone(true))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.message || '로그인 실패'
      if (msg.includes('Failed to fetch') || msg.includes('서버에 연결')) {
        setError('백엔드에 연결할 수 없습니다. 터미널에서 backend 폴더로 이동 후 uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 실행하고 "연결 다시 확인" 버튼을 눌러보세요.')
      } else {
        setError(msg)
      }
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>디지털 광고 CMS</h1>
        <p className="login-sub">관리자 로그인</p>
        {backendOk === false && (
          <p className="error" style={{ marginBottom: '0.75rem' }}>
            백엔드 연결 안 됨. 터미널에서 <code>cd d:\did\backend</code> 후 <code>uvicorn app.main:app --reload --host 127.0.0.1 --port 8000</code> 실행하고, 아래 "연결 다시 확인"을 누른 뒤 로그인하세요.
          </p>
        )}
        {backendOk === false && (
          <button type="button" className="btn btn-sm" onClick={checkBackend} style={{ marginBottom: '0.75rem' }}>
            연결 다시 확인
          </button>
        )}
        {backendOk === true && <p className="muted small text-success">백엔드 연결됨</p>}
        {!seedDone && <p className="muted small">계정 확인 중...</p>}
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={!seedDone}>
            로그인
          </button>
        </form>
        <p className="hint">기본 계정: admin@example.com / admin123</p>
        <p className="hint">연결 안 됨이면 백엔드(localhost:8000) 실행 후 "연결 다시 확인"을 누르세요.</p>
      </div>
    </div>
  )
}
