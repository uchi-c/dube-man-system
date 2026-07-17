import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// Fired by Chrome/Edge/Android when the page meets PWA installability
// criteria (manifest + service worker + HTTPS — all already in place here).
// Not part of the standard DOM lib types, hence the manual shape.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own (non-standard) flag for an already-installed PWA.
    (window.navigator as any).standalone === true
  );
}

/**
 * Renders nothing until the browser signals the app is actually
 * installable (or is already installed, or the browser doesn't support
 * install prompts at all — e.g. desktop Safari/Firefox), then shows a
 * one-click "Install app" button that triggers the native install dialog.
 */
export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    if (installed) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installed]);

  if (installed || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Whether accepted or dismissed, this specific prompt is spent —
    // Chrome only lets you call .prompt() once per captured event.
    setDeferredPrompt(null);
  };

  return (
    <button
      onClick={handleInstall}
      className={compact ? 'dm-icon-btn' : 'dm-btn dm-btn-ghost'}
      style={compact ? { width: 40, height: 40 } : { gap: 8 }}
      aria-label="Install app"
      title="Install Uruu OS as an app"
    >
      <Download style={{ width: compact ? 16 : 15, height: compact ? 16 : 15 }} />
      {!compact && 'Install app'}
    </button>
  );
}
