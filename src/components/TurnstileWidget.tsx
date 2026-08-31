import { useEffect, useRef, useState } from 'react';

// Turnstile site keys are meant to be public (same trust model as a Stripe
// publishable key or a domain-restricted Google Maps key) -- the actual
// protection is the domain allowlist on the Cloudflare side plus the secret
// key's server-side verification (Supabase Dashboard > Authentication >
// Attack Protection), neither of which this value can bypass on its own.
// VITE_TURNSTILE_SITE_KEY still overrides it if the widget is ever rotated.
const DEFAULT_SITE_KEY = '0x4AAAAAAEjJomp9hdgTpz87';
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || DEFAULT_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the verification widget.'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * True when a site key is configured — callers use this to decide whether a
 * captcha token is required before submitting. Unconfigured (no
 * VITE_TURNSTILE_SITE_KEY) means the whole feature is off: no widget, no
 * required token, signup behaves exactly as it did before this existed.
 */
export const isTurnstileEnabled = !!SITE_KEY;

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /** Bump this to force the widget to re-render with a fresh, unused token — Turnstile tokens are single-use. */
  resetKey?: number;
}

/** Renders nothing if VITE_TURNSTILE_SITE_KEY isn't set — see isTurnstileEnabled. */
export default function TurnstileWidget({ onVerify, onExpire, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onVerify(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => setLoadError(true),
        });
      })
      .catch(() => { if (!cancelled) setLoadError(true); });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null;

  return (
    <div className="space-y-1.5">
      <div ref={containerRef} />
      {loadError && (
        <p style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>
          Couldn't load the verification widget. Check your connection and reload the page.
        </p>
      )}
    </div>
  );
}
