import { ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import InstallAppButton from '../components/InstallAppButton';

interface LandingPageProps {
  onSignIn: () => void;
}

/**
 * The first thing anyone hits at the bare domain. Uruu OS isn't a public
 * product with self-service signup -- it's this business's internal
 * operations system, reachable only by accounts an admin has already
 * created. This page exists so that landing at the root domain shows a
 * proper front page instead of dropping straight into a login form with no
 * context; it deliberately has no "create an account" path anywhere on it.
 */
export default function LandingPage({ onSignIn }: LandingPageProps) {
  return (
    <div className="dm-app-bg dm-glow min-h-screen flex flex-col items-center justify-center p-6" style={{ fontFamily: "'Inter',sans-serif" }} id="landing-page">
      <div className="dm-glow-orb" style={{ top: '12%', right: '-6%', width: 320, height: 320, background: 'rgba(76,111,255,0.24)' }} />
      <div className="dm-glow-orb" style={{ bottom: '10%', left: '-8%', width: 260, height: 260, background: 'rgba(125,211,252,0.14)' }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md text-center space-y-8"
      >
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-mark.png" alt="Uruu OS" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <div>
            <div style={{ color: 'var(--text-hi)', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em' }}>
              Uruu OS
            </div>
            <div className="dm-label" style={{ padding: 0, marginTop: 2 }}>Internal operations platform</div>
          </div>
        </div>

        <p style={{ color: 'var(--text-mid)', fontSize: '0.95rem', lineHeight: 1.7 }}>
          This system runs the day-to-day operations for our team — sales, inventory, pharmacy,
          printing, and café management in one place. It's for our staff only; access is by
          invitation from an admin.
        </p>

        <div className="dm-card-glass p-6 space-y-4">
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--text-low)', fontSize: '0.75rem' }}>
            <ShieldCheck style={{ width: 14, height: 14 }} />
            <span>Access is invite-only</span>
          </div>
          <button onClick={onSignIn} className="dm-btn dm-btn-primary w-full">
            Sign In <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="flex justify-center">
          <InstallAppButton />
        </div>
      </motion.div>
    </div>
  );
}
