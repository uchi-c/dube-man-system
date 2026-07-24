import { useEffect, useState } from 'react';
import { Download, Check } from 'lucide-react';

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
 * Always visible (deliberately — it used to disappear the moment the app
 * was installed, which read as "did something break" rather than "it
 * worked"). Shows a live "Install app" button once the browser signals the
 * page is installable, a dimmed/disabled state before that point or on
 * browsers that never fire the prompt (e.g. desktop Safari/Firefox), and
 * a persistent "Installed" state afterward.
 */
export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
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
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Whether accepted or dismissed, this specific prompt is spent —
    // Chrome only lets you call .prompt() once per captured event. If it
    // was accepted, the 'appinstalled' listener above flips `installed`;
    // if dismissed, this just goes back to the dimmed/disabled state until
    // the browser decides to offer the prompt again.
    setDeferredPrompt(null);
  };

  if (installed) {
    return (
      <button
        disabled
        className={compact ? 'dm-icon-btn' : 'dm-btn dm-btn-ghost'}
        style={compact ? { width: 40, height: 40, opacity: 0.65, cursor: 'default' } : { gap: 8, opacity: 0.7, cursor: 'default' }}
        aria-label="App installed"
        title="Uruu OS is installed on this device"
      >
        <Check style={{ width: compact ? 16 : 15, height: compact ? 16 : 15 }} />
        {!compact && 'Installed'}
      </button>
    );
  }

  return (
    <button
      onClick={handleInstall}
      disabled={!deferredPrompt}
      className={compact ? 'dm-icon-btn' : 'dm-btn dm-btn-ghost'}
      style={compact ? { width: 40, height: 40, opacity: deferredPrompt ? 1 : 0.5 } : { gap: 8, opacity: deferredPrompt ? 1 : 0.5 }}
      aria-label="Install app"
      title={deferredPrompt ? 'Install Uruu OS as an app' : "Install option isn't available yet in this browser"}
    >
      <Download style={{ width: compact ? 16 : 15, height: compact ? 16 : 15 }} />
      {!compact && 'Install app'}
    </button>
  );
}
