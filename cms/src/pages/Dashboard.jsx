import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE } from '../lib/api'

export default function Dashboard() {
  const [stats, setStats] = useState({
    campaigns: 0,
    devices: 0,
    onlineDevices: 0,
    contents: 0,
    schedules: 0,
  })
  const [recentDevices, setRecentDevices] = useState([])
  const [loading, setLoading] = useState(true)

  const refreshDeviceStats = useCallback(async () => {
    const devices = await api('/devices').catch(() => [])
    const devList = Array.isArray(devices) ? devices : []
    setStats((s) => ({
      ...s,
      devices: devList.length,
      onlineDevices: devList.filter((d) => d.status === 'online').length,
    }))
    setRecentDevices(devList.slice(-5).reverse())
  }, [])

  useEffect(() => {
    Promise.all([
      api('/campaigns').catch(() => []),
      api('/devices').catch(() => []),
      api('/contents').catch(() => []),
      api('/schedules').catch(() => []),
    ]).then(([campaigns, devices, contents, schedules]) => {
      const devList = Array.isArray(devices) ? devices : []
      setStats({
        campaigns: Array.isArray(campaigns) ? campaigns.length : 0,
        devices: devList.length,
        onlineDevices: devList.filter((d) => d.status === 'online').length,
        contents: Array.isArray(contents) ? contents.length : 0,
        schedules: Array.isArray(schedules) ? schedules.length : 0,
      })
      setRecentDevices(devList.slice(-5).reverse())
      setLoading(false)
    })
  }, [])

  // 디바이스 탭과 동일: 기기 온라인 등 변경 시 대시보드 숫자도 갱신 (처음만 보고 오프라인 고정 방지)
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/devices/events`)
    es.onmessage = () => refreshDeviceStats()
    es.onerror = () => es.close()
    return () => es.close()
  }, [refreshDeviceStats])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDeviceStats()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshDeviceStats])

  if (loading) return <div className="loading">로딩 중...</div>

  return (
    <div className="page">
      <h1>대시보드</h1>
      <div className="kpi-cards">
        <Link to="/campaigns" className="kpi-card kpi-card-link">
          <span className="kpi-value">{stats.campaigns}</span>
          <span className="kpi-label">캠페인</span>
        </Link>
        <Link to="/contents" className="kpi-card kpi-card-link">
          <span className="kpi-value">{stats.contents}</span>
          <span className="kpi-label">미디어</span>
        </Link>
        <Link to="/schedules" className="kpi-card kpi-card-link">
          <span className="kpi-value">{stats.schedules}</span>
          <span className="kpi-label">스케줄</span>
        </Link>
        <Link to="/devices" className="kpi-card kpi-card-link">
          <span className="kpi-value">
            {stats.onlineDevices} <span className="kpi-sub">/ {stats.devices}</span>
          </span>
          <span className="kpi-label">디바이스 (온라인/전체)</span>
        </Link>
      </div>

      {recentDevices.length > 0 && (
        <section className="card section">
          <h2>최근 등록 디바이스</h2>
          <ul className="recent-devices">
            {recentDevices.map((d) => (
              <li key={d.id}>
                <span className="name">{d.name || d.device_id}</span>
                <span className="location">{d.location || '-'}</span>
                <span className={`status status-${d.status}`}>{d.status}</span>
              </li>
            ))}
          </ul>
          <Link to="/devices" className="btn btn-sm btn-primary">
            디바이스 전체 보기
          </Link>
        </section>
      )}
    </div>
  )
}
