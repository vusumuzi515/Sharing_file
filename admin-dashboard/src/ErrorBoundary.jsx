import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 20, backgroundColor: '#f1f5f9', color: '#334155', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: '0.875rem', marginBottom: 16 }}>{this.state.error?.message || 'Unknown error'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', backgroundColor: '#1d4ed8', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
