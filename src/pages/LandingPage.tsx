import { ArrowRight, ShieldCheck, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import InstallAppButton from '../components/InstallAppButton';
import ProductPreview from '../components/ProductPreview';
import PricingSection from '../components/PricingSection';

interface LandingPageProps {
  onSignIn: () => void;
  onGetStarted: () => void;
}

/**
 * The first thing anyone hits at the bare domain -- including a prospective
 * business owner who searched for Uruu OS. It pitches the product (pharmacy,
 * retail, café and printing businesses each get their own workspace) and
 * gives them a scrollable look at the actual screens before they commit to
 * anything, then two ways in: "Get started" (self-service signup, a 7-day
 * trial -- see create_tenant_org) or "Sign in" for existing customers/staff.
 */
export default function LandingPage({ onSignIn, onGetStarted }: LandingPageProps) {
  return (
    <div className="dm-app-bg dm-glow min-h-screen flex flex-col items-center p-6" style={{ fontFamily: "'Inter',sans-serif" }} id="landing-page">
      <div className="dm-glow-orb" style={{ top: '12%', right: '-6%', width: 320, height: 320, background: 'rgba(76,111,255,0.24)' }} />
      <div className="dm-glow-orb" style={{ bottom: '10%', left: '-8%', width: 260, height: 260, background: 'rgba(125,211,252,0.14)' }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md text-center space-y-8"
        style={{ marginTop: '6vh' }}
      >
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-mark.png" alt="Uruu OS" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <div>
            <div style={{ color: 'var(--text-hi)', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '22px', letterSpacing: '-0.02em' }}>
              Uruu OS
            </div>
            <div className="dm-label" style={{ padding: 0, marginTop: 2 }}>Run your business on one platform</div>
          </div>
        </div>

        <p style={{ color: 'var(--text-mid)', fontSize: '0.95rem', lineHeight: 1.7 }}>
          Sales, inventory, pharmacy dispensing, café &amp; WiFi sessions, and printing orders —
          all in one dashboard. Built for pharmacies, retail shops, internet cafés, and
          printing &amp; branding businesses, each with their own private workspace.
        </p>

        <div className="dm-card-glass p-6 space-y-3">
          <button onClick={onGetStarted} className="dm-btn dm-btn-primary w-full">
            Get started <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
          <button onClick={onSignIn} className="dm-btn dm-btn-ghost w-full">
            Sign in
          </button>
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--text-low)', fontSize: '0.72rem', paddingTop: 4 }}>
            <ShieldCheck style={{ width: 13, height: 13 }} />
            <span>7-day free trial · no credit card required</span>
          </div>
        </div>

        <a
          href="https://wa.me/260979501830"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5"
          style={{ color: 'var(--text-low)', fontSize: '0.78rem' }}
        >
          <MessageCircle style={{ width: 13, height: 13 }} /> Questions? WhatsApp 0979 501 830
        </a>
      </motion.div>

      <div className="relative z-10 w-full" style={{ maxWidth: 1040, marginTop: '5rem', marginBottom: '4rem' }}>
        <ProductPreview />
      </div>

      <div className="relative z-10 w-full" style={{ maxWidth: 1040, marginBottom: '3rem' }}>
        <PricingSection onGetStarted={onGetStarted} />
      </div>

      <div className="relative z-10 flex justify-center" style={{ marginBottom: '2rem' }}>
        <InstallAppButton />
      </div>
    </div>
  );
}
