import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
          <h2 style={{ color: '#c5221f' }}>오류가 발생했습니다</h2>
          <pre style={{ background: '#f5f5f5', padding: '1rem', overflow: 'auto' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.href = '/login'}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
          >
            로그인 화면으로
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
