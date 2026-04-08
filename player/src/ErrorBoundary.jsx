import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Player error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100vw',
          height: '100vh',
          background: '#000',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'sans-serif',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>플레이어 오류</p>
          <p style={{ color: '#888', fontSize: '0.9rem' }}>{this.state.error?.message || String(this.state.error)}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
