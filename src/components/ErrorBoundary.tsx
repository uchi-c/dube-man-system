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

// Chunk-load failures (a lazy-loaded route's JS file 404s because a new
// deploy replaced it with a different hashed filename after this tab
// already loaded index.html) can't be fixed by re-rendering — the failed
// dynamic import() is cached and rejects the same way every time. A full
// reload is the only fix, since it re-fetches index.html with the current
// asset references. Matches Vite/Rollup, webpack, and Safari's wording.
const CHUNK_LOAD_ERROR_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i;

// Guards against reload-looping forever if the deploy is genuinely broken
// (not just this tab being stale) — only auto-reload once per 10s window.
const RELOAD_GUARD_KEY = 'uruu_chunk_reload_at';
const RELOAD_GUARD_WINDOW_MS = 10_000;

// Exported so unit tests can exercise the classification logic directly
// without mounting a component or triggering a real render error.
export function isChunkLoadError(error: Error): boolean {
  return CHUNK_LOAD_ERROR_RE.test(error.message || '');
}

function shouldAutoReload(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    return Date.now() - last > RELOAD_GUARD_WINDOW_MS;
  } catch {
    return true;
  }
}

function markReloadAttempt(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private browsing, quota) — reload still proceeds.
  }
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

    if (isChunkLoadError(error) && shouldAutoReload()) {
      markReloadAttempt();
      window.location.reload();
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const chunkError = this.state.error ? isChunkLoadError(this.state.error) : false;

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <div
          className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
          style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.30)' }}
        >
          <AlertTriangle style={{ width: 24, height: 24, color: 'var(--danger)' }} />
        </div>
        <h2 className="dm-h2">
          {chunkError ? 'A new version is available' : 'Something went wrong'}
        </h2>
        <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 8, maxWidth: 380 }}>
          {chunkError
            ? "This tab was open before an update finished deploying. Reload to pick up the latest version — you won't lose your session."
            : `${this.props.section ? `The ${this.props.section} section` : 'This section'} hit an unexpected error. You can retry without losing your session.`}
        </p>
        {this.state.error?.message && (
          <code
            className="dm-nums mt-3 px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)', color: 'var(--danger)', fontSize: '0.6875rem', maxWidth: 420, wordBreak: 'break-word' }}
          >
            {this.state.error.message}
          </code>
        )}
        <button
          onClick={chunkError ? this.handleReload : this.handleReset}
          className="dm-btn dm-btn-primary mt-6"
        >
          <RefreshCw style={{ width: 15, height: 15 }} />
          {chunkError ? 'Reload page' : 'Try Again'}
        </button>
      </div>
    );
  }
}
