import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Shows a recoverable message instead of a blank page if a screen crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ShopSmart UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container section">
        <div className="error-state" role="alert">
          <div>
            <strong>Something went wrong on this page</strong>
            <p>{this.state.error.message || 'Unexpected error'}</p>
          </div>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
          <a className="btn btn-ghost" href="/">Go to home</a>
        </div>
      </div>
    );
  }
}
