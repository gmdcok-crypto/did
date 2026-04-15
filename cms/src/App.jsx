import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import Contents from './pages/Contents'
import Schedules from './pages/Schedules'
import Devices from './pages/Devices'

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="loading">로딩 중...</div>
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="contents" element={<Contents />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="devices" element={<Devices />} />
      </Route>
    </Routes>
  )
}
