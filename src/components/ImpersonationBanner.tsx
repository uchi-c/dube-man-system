import { useEffect, useState } from 'react';
import { UserCog, LogOut } from 'lucide-react';
import { fetchMyImpersonationStatus, endTenantImpersonation, clearOrganizationCache } from '../services/organizations';
import { ImpersonationStatus } from '../types';

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Persistent, unmissable strip shown across the whole app while a platform
 * admin has an active "view as tenant" grant (see start_tenant_impersonation,
 * migration 033) — so it's never ambiguous which hat they're currently
 * wearing. Driven by the real server-side grant (get_my_impersonation_status)
 * rather than a client-side flag, so it can't drift out of sync with a
 * second tab or a grant that already expired server-side.
 */
export default function ImpersonationBanner({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [status, setStatus] = useState<ImpersonationStatus | null>(null);
  const [remaining, setRemaining] = useState('');
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    fetchMyImpersonationStatus().then(setStatus).catch(() => {});
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (!status) return;
    const tick = () => {
      if (new Date(status.expiresAt).getTime() - Date.now() <= 0) {
        // Expired server-side mid-session — current_org_ids() has already
        // stopped honoring it, so bounce out to a clean reload rather than
        // let the rest of the app keep querying data it can no longer see.
        // Only touch the hash (not .href, which would race reload() —
        // see handleViewAsTenant in TenantsAdmin.tsx for the same fix).
        clearOrganizationCache();
        window.location.hash = '/tenants';
        window.location.reload();
        return;
      }
      setRemaining(formatRemaining(status.expiresAt));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status]);

  const handleEnd = async () => {
    if (!status) return;
    setEnding(true);
    try {
      await endTenantImpersonation(status.orgId);
    } catch {
      // Even if the call fails (e.g. it already expired), still leave locally.
    }
    clearOrganizationCache();
    window.location.hash = '/tenants';
    window.location.reload();
  };

  if (!status) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 flex-wrap"
      style={{ position: 'sticky', top: 0, zIndex: 200, background: 'var(--warning)', color: '#1a1300', padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}
      role="status"
    >
      <UserCog style={{ width: 15, height: 15, flexShrink: 0 }} />
      <span>
        Viewing <strong>{status.orgName}</strong> as a platform admin — expires in {remaining}
      </span>
      <button
        onClick={handleEnd}
        disabled={ending}
        className="flex items-center gap-1"
        style={{ background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: 6, padding: '0.2rem 0.6rem', color: 'inherit', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}
      >
        <LogOut style={{ width: 13, height: 13 }} /> {ending ? 'Ending…' : 'End session'}
      </button>
    </div>
  );
}
