import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label so we can tell which region failed. */
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render/runtime errors in the subtree and shows a recoverable
 * fallback instead of blanking the whole app. Wrap the app shell and any
 * independently-loaded page region.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface for debugging; a real deployment can forward this to a logger.
    console.error(`[ErrorBoundary${this.props.section ? ` · ${this.props.section}` : ''}]`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <div
          className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
          style={{ background: '#fff1f2', border: '1px solid #fecaca' }}
        >
          <AlertTriangle style={{ width: 24, height: 24, color: '#dc2626' }} />
        </div>
        <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: '1.25rem', color: '#0f172a', letterSpacing: '-0.01em' }}>
          Something went wrong
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 8, maxWidth: 380 }}>
          {this.props.section
            ? `The ${this.props.section} section hit an unexpected error.`
            : 'This section hit an unexpected error.'}{' '}
          You can retry without losing your session.
        </p>
        {this.state.error?.message && (
          <code
            className="mt-3 px-3 py-1.5 rounded-lg text-[11px] font-mono"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#991b1b', maxWidth: 420 }}
          >
            {this.state.error.message}
          </code>
        )}
        <button
          onClick={this.handleReset}
          className="mt-6 flex items-center gap-2 cursor-pointer"
          style={{
            padding: '0.625rem 1.25rem',
            background: '#0f172a',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.875rem',
            fontWeight: 700,
          }}
        >
          <RefreshCw style={{ width: 15, height: 15 }} />
          Try Again
        </button>
      </div>
    );
  }
}
