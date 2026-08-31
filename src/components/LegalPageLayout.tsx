import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  onBack: () => void;
  children: React.ReactNode;
}

/**
 * Shared chrome for PrivacyPolicy.tsx / TermsOfService.tsx -- header, back
 * link, "last updated" stamp, and prose styling for the actual document
 * body. Both pages are reachable pre-auth (see App.tsx's authView, seeded
 * from location.pathname === '/privacy' | '/terms') so a visitor can open
 * /#/privacy or /#/terms directly, e.g. from a shared link, without signing
 * in first.
 */
export default function LegalPageLayout({ title, lastUpdated, onBack, children }: LegalPageLayoutProps) {
  return (
    <div className="dm-app-bg min-h-screen" style={{ fontFamily: "'Inter',sans-serif" }}>
      <div className="w-full mx-auto" style={{ maxWidth: 760, padding: '2.5rem 1.5rem 5rem' }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="flex items-center gap-3 mb-8">
            <img src="/logo-mark.png" alt="Uruu OS" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '17px', color: 'var(--text-hi)' }}>Uruu OS</span>
          </div>

          <button onClick={onBack} className="dm-btn dm-btn-ghost" style={{ marginBottom: 24, minHeight: 34, padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Back
          </button>

          <h1 className="dm-h1" style={{ fontSize: '1.9rem' }}>{title}</h1>
          <p style={{ color: 'var(--text-low)', fontSize: '0.78rem', marginTop: 6, marginBottom: 32 }}>Last updated: {lastUpdated}</p>

          <div className="legal-prose">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
