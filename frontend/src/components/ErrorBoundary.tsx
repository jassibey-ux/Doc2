import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#1a1a2e',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          padding: '20px',
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '16px' }}>Something went wrong</h1>
          <details style={{
            whiteSpace: 'pre-wrap',
            maxWidth: '800px',
            overflow: 'auto',
            background: 'rgba(0,0,0,0.3)',
            padding: '16px',
            borderRadius: '8px',
          }}>
            <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
            <p style={{ color: '#f97316' }}>{this.state.error?.message}</p>
            <pre style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              {this.state.error?.stack}
            </pre>
            {this.state.errorInfo && (
              <pre style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '16px' }}>
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 24px',
              background: '#ff8c00',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
