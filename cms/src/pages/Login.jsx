import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [seedDone, setSeedDone] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

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
        setError('백엔드(http://localhost:8000)에 연결할 수 없습니다. Docker면 docker compose up -d, 로컬이면 run-https.bat 실행 중인지 확인하세요.')
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
        <p className="hint">새로고침 후 로그인 화면이 나오면, 같은 주소(localhost 또는 127.0.0.1)로 접속했는지·백엔드(http://localhost:8000)가 켜져 있는지 확인하세요.</p>
      </div>
    </div>
  )
}
