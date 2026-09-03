import { useEffect, useState } from 'react';
import {
  ShieldCheck, UserPlus, X, Check, Copy, KeyRound, Trash2, Search, RefreshCw, AlertTriangle,
  Megaphone, History, Send,
} from 'lucide-react';
import {
  fetchPlatformAdmins, findUserByEmail, setPlatformAdmin, inviteNewPlatformAdmin, PlatformAdmin,
  fetchPlatformAuditLog, sendPlatformAnnouncement,
} from '../services/organizations';
import { PlatformAuditLogEntry } from '../types';
import DataTable from '../components/DataTable';

const TABS: { id: 'admins' | 'announce' | 'audit-log'; label: string; icon: React.ElementType }[] = [
  { id: 'admins', label: 'Platform Admins', icon: ShieldCheck },
  { id: 'announce', label: 'Announcements', icon: Megaphone },
  { id: 'audit-log', label: 'Audit Log', icon: History },
];

const ACTION_LABEL: Record<string, string> = {
  'platform_admin.granted': 'Granted platform admin',
  'platform_admin.revoked': 'Revoked platform admin',
  'tenant.billing_updated': 'Updated tenant billing',
  'tenant.modules_updated': 'Updated tenant modules',
  'tenant.deleted': 'Deleted tenant',
  'announcement.sent': 'Sent announcement',
};

function auditDetailLine(entry: PlatformAuditLogEntry): string {
  const d = entry.details || {};
  switch (entry.action) {
    case 'platform_admin.granted':
    case 'platform_admin.revoked':
      return (d.target_email as string) || '';
    case 'tenant.modules_updated':
      return Array.isArray(d.extra_modules) && d.extra_modules.length ? `modules: ${(d.extra_modules as string[]).join(', ')}` : 'no extra modules';
    case 'announcement.sent':
      return `"${d.subject || ''}" · ${d.recipient_count ?? 0} recipient${d.recipient_count === 1 ? '' : 's'}`;
    case 'tenant.billing_updated': {
      const parts = Object.entries(d).map(([k, v]) => `${k}: ${v}`);
      return parts.length ? parts.join(', ') : 'no fields changed';
    }
    default:
      return '';
  }
}

/**
 * Platform Admins — who has cross-tenant access (every RPC/tenant billing
 * screen, not just their own org), plus two related platform-operations
 * tools: emailing every tenant owner at once, and an audit trail of
 * consequential platform-admin actions (migration 032). Every action here
 * is server-guarded (is_platform_admin() and friends); this page only
 * hides the UI for non-admins, it doesn't decide authorization on its own.
 */
export default function PlatformAdmins() {
  const [activeTab, setActiveTab] = useState<'admins' | 'announce' | 'audit-log'>('admins');
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setAdmins(await fetchPlatformAdmins());
    } catch (err: any) {
      setError(err?.message || 'Failed to load platform admins.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ---- Promote an existing user by email ----
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState<{ id: string; name: string; email: string; is_platform_admin: boolean } | null>(null);
  const [promoting, setPromoting] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError('');
    setLookupResult(null);
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    try {
      const user = await findUserByEmail(lookupEmail.trim());
      if (!user) setLookupError('No Uruu OS account with that email. Use "Invite a new person" instead.');
      else setLookupResult(user);
    } catch (err: any) {
      setLookupError(err?.message || 'Lookup failed.');
    }
    setLookupLoading(false);
  };

  const handlePromote = async () => {
    if (!lookupResult) return;
    setPromoting(true);
    setLookupError('');
    try {
      await setPlatformAdmin(lookupResult.id, true);
      setLookupResult(null);
      setLookupEmail('');
      await load();
    } catch (err: any) {
      setLookupError(err?.message || 'Failed to grant platform admin access.');
    }
    setPromoting(false);
  };

  // ---- Revoke ----
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState('');

  const handleRevoke = async (admin: PlatformAdmin) => {
    if (!confirm(`Remove platform admin access for ${admin.name || admin.email}?`)) return;
    setRevokingId(admin.id);
    setRevokeError('');
    try {
      await setPlatformAdmin(admin.id, false);
      await load();
    } catch (err: any) {
      setRevokeError(err?.message || 'Failed to revoke platform admin access.');
    }
    setRevokingId(null);
  };

  // ---- Invite a brand-new person (no existing account) ----
  const [isInviting, setIsInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '' });
  const [inviteError, setInviteError] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const openInviteForm = () => {
    setInviteForm({ email: '', name: '' });
    setInviteError('');
    setInviteResult(null);
    setCopiedPassword(false);
    setIsInviting(true);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    if (!inviteForm.email.trim()) { setInviteError('Email is required.'); return; }
    setInviteSubmitting(true);
    try {
      const result = await inviteNewPlatformAdmin(inviteForm.email.trim(), inviteForm.name.trim() || undefined);
      setInviteResult(result);
      await load();
    } catch (err: any) {
      setInviteError(err?.message || "Couldn't create that account.");
    }
    setInviteSubmitting(false);
  };

  const handleCopyPassword = async () => {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.tempPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 1800);
    } catch {
      // Clipboard API unavailable — the password is still on-screen to copy manually.
    }
  };

  // ---- Announcements ----
  const [announceSubject, setAnnounceSubject] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceSending, setAnnounceSending] = useState(false);
  const [announceError, setAnnounceError] = useState('');
  const [announceResult, setAnnounceResult] = useState<{ sent: number; errors: string[] } | null>(null);

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnnounceError('');
    setAnnounceResult(null);
    if (!announceSubject.trim() || !announceMessage.trim()) {
      setAnnounceError('Subject and message are both required.');
      return;
    }
    if (!confirm(`Send this to every tenant owner? This can't be undone.`)) return;
    setAnnounceSending(true);
    try {
      const result = await sendPlatformAnnouncement(announceSubject.trim(), announceMessage.trim());
      setAnnounceResult(result);
      if (result.errors.length === 0) {
        setAnnounceSubject('');
        setAnnounceMessage('');
      }
    } catch (err: any) {
      setAnnounceError(err?.message || "Couldn't send the announcement.");
    }
    setAnnounceSending(false);
  };

  // ---- Audit log ----
  const [auditLog, setAuditLog] = useState<PlatformAuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditLoaded, setAuditLoaded] = useState(false);

  const loadAuditLog = async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      setAuditLog(await fetchPlatformAuditLog(150));
      setAuditLoaded(true);
    } catch (err: any) {
      setAuditError(err?.message || "Couldn't load the audit log.");
    }
    setAuditLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'audit-log' && !auditLoaded) loadAuditLog();
  }, [activeTab, auditLoaded]);

  const auditColumns = [
    {
      header: 'When',
      accessor: (e: PlatformAuditLogEntry) => <span className="dm-nums" style={{ fontSize: 11, color: 'var(--text-low)' }}>{new Date(e.created_at).toLocaleString()}</span>,
    },
    {
      header: 'Actor',
      accessor: (e: PlatformAuditLogEntry) => <span style={{ color: 'var(--text-mid)' }}>{e.actor_email || '—'}</span>,
    },
    {
      header: 'Action',
      accessor: (e: PlatformAuditLogEntry) => <span className="dm-badge dm-badge-info">{ACTION_LABEL[e.action] || e.action}</span>,
    },
    {
      header: 'Tenant',
      accessor: (e: PlatformAuditLogEntry) => <span style={{ color: e.target_org_name ? 'var(--text-hi)' : 'var(--text-low)', fontWeight: e.target_org_name ? 600 : 400 }}>{e.target_org_name || '—'}</span>,
    },
    {
      header: 'Details',
      accessor: (e: PlatformAuditLogEntry) => <span className="dm-truncate" style={{ display: 'block', maxWidth: '20rem', fontSize: 11, color: 'var(--text-low)' }}>{auditDetailLine(e)}</span>,
    },
  ];

  return (
    <div className="p-6 space-y-6" id="platform-admins">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="dm-h2 flex items-center gap-2">
            <ShieldCheck style={{ width: 17, height: 17, color: 'var(--blue-400)' }} />
            <span>Platform Admins</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>
            Cross-tenant access, tenant-wide announcements, and an audit trail of consequential platform-admin actions.
          </p>
        </div>
        {activeTab === 'admins' && (
          <button onClick={openInviteForm} className="dm-btn dm-btn-primary">
            <UserPlus style={{ width: 14, height: 14 }} />
            <span>Invite new person</span>
          </button>
        )}
      </div>

      <div className="dm-seg" style={{ width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`dm-seg-item ${activeTab === t.id ? 'active' : ''}`}>
            <t.icon style={{ width: 15, height: 15 }} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'admins' && (
      <>
      {/* Promote existing user */}
      <div className="dm-card p-5 space-y-3">
        <h3 className="dm-h3">Promote an existing Uruu OS user</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-low)' }}>
          For someone who already has an Uruu OS account (e.g. a tenant admin) — look them up by email, then grant
          access.
        </p>
        <form onSubmit={handleLookup} className="flex gap-2">
          <input
            type="email" className="dm-input" placeholder="their.email@example.com"
            value={lookupEmail} onChange={e => setLookupEmail(e.target.value)}
          />
          <button type="submit" className="dm-btn dm-btn-ghost" disabled={lookupLoading}>
            <Search style={{ width: 14, height: 14 }} />
            <span>{lookupLoading ? 'Looking up…' : 'Look up'}</span>
          </button>
        </form>
        {lookupError && (
          <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>{lookupError}</span>
          </div>
        )}
        {lookupResult && (
          <div className="dm-card-inset flex items-center justify-between p-3">
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-hi)' }}>{lookupResult.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>{lookupResult.email}</div>
            </div>
            {lookupResult.is_platform_admin ? (
              <span className="dm-badge dm-badge-success">Already a platform admin</span>
            ) : (
              <button onClick={handlePromote} className="dm-btn dm-btn-primary" disabled={promoting}>
                {promoting ? 'Granting…' : 'Grant platform admin'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="dm-card p-5 space-y-3">
        <h3 className="dm-h3">Current platform admins</h3>
        {revokeError && (
          <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>{revokeError}</span>
          </div>
        )}
        {error && (
          <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-10" style={{ color: 'var(--text-low)' }}>
            <RefreshCw className="dm-spin" style={{ width: 16, height: 16, marginRight: 8 }} />
            <span style={{ fontSize: '0.78rem' }}>Loading…</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {admins.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-hi)' }}>{a.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>{a.email}</div>
                </div>
                <button
                  onClick={() => handleRevoke(a)}
                  className="dm-icon-btn"
                  disabled={revokingId === a.id}
                  aria-label="Revoke platform admin access"
                  title="Revoke platform admin access"
                >
                  <Trash2 style={{ width: 15, height: 15, color: 'var(--danger)' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'announce' && (
        <div className="dm-card p-5 space-y-4">
          <div>
            <h3 className="dm-h3 flex items-center gap-1.5">
              <Megaphone style={{ width: 15, height: 15 }} /> Send an announcement
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-low)', marginTop: 2 }}>
              Emails every tenant's owner at once — e.g. a new feature launch or planned downtime.
            </p>
          </div>
          <form onSubmit={handleSendAnnouncement} className="space-y-3">
            <div className="space-y-1.5">
              <label className="dm-label" style={{ padding: 0 }}>Subject</label>
              <input type="text" required className="dm-input" placeholder="e.g. Smart Invoice is now available" value={announceSubject} onChange={e => setAnnounceSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="dm-label" style={{ padding: 0 }}>Message</label>
              <textarea
                required rows={6} className="dm-input" style={{ resize: 'vertical', minHeight: 120 }}
                placeholder="Blank lines start a new paragraph."
                value={announceMessage} onChange={e => setAnnounceMessage(e.target.value)}
              />
            </div>
            {announceError && (
              <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}>
                <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>{announceError}</span>
              </div>
            )}
            {announceResult && (
              <div
                className={`dm-badge ${announceResult.errors.length ? 'dm-badge-warning' : 'dm-badge-success'}`}
                style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}
              >
                {announceResult.errors.length ? <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} /> : <Check style={{ width: 14, height: 14, flexShrink: 0 }} />}
                <span>
                  Sent to {announceResult.sent} owner{announceResult.sent === 1 ? '' : 's'}.
                  {announceResult.errors.length > 0 && ` ${announceResult.errors.length} failed — check Resend's dashboard for details.`}
                </span>
              </div>
            )}
            <button type="submit" className="dm-btn dm-btn-primary" disabled={announceSending}>
              <Send style={{ width: 14, height: 14 }} />
              <span>{announceSending ? 'Sending…' : 'Send to every tenant owner'}</span>
            </button>
          </form>
        </div>
      )}

      {activeTab === 'audit-log' && (
        <div className="dm-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="dm-h3 flex items-center gap-1.5">
              <History style={{ width: 15, height: 15 }} /> Platform admin audit log
            </h3>
            <button onClick={loadAuditLog} className="dm-icon-btn" title="Reload">
              <RefreshCw className={auditLoading ? 'dm-spin' : ''} style={{ width: 15, height: 15 }} />
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: -8 }}>
            Grants/revokes, tenant billing or module edits, tenant deletions, and announcement sends — most recent 150.
          </p>
          {auditError && (
            <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span>{auditError}</span>
            </div>
          )}
          <DataTable
            data={auditLog}
            columns={auditColumns}
            searchPlaceholder="Search by actor or tenant…"
            filterFunction={(e, q) => (e.actor_email || '').toLowerCase().includes(q.toLowerCase()) || (e.target_org_name || '').toLowerCase().includes(q.toLowerCase())}
            emptyMessage="No platform-admin actions recorded yet."
            loading={auditLoading}
          />
        </div>
      )}

      {/* Invite new person modal */}
      {isInviting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setIsInviting(false)}
        >
          <div
            className="dm-card p-6 space-y-4 w-full"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, background: 'var(--bg-1)', boxShadow: 'var(--shadow-modal)' }}
            role="dialog" aria-label="Invite new platform admin"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="dm-h2">Invite new platform admin</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>
                  Creates their account immediately with full cross-tenant access.
                </p>
              </div>
              <button onClick={() => setIsInviting(false)} className="dm-icon-btn" aria-label="Close">
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {inviteResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                  <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                  <span>Account created with platform admin access. Give them this email + password — they'll set their own password on first login.</span>
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Email</label>
                  <input type="text" readOnly className="dm-input" style={{ fontSize: '0.78rem' }} value={inviteResult.email} onFocus={e => e.target.select()} />
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label flex items-center gap-1.5" style={{ padding: 0 }}>
                    <KeyRound style={{ width: 12, height: 12 }} /> Temporary password
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="text" readOnly className="dm-input dm-nums" style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.03em' }} value={inviteResult.tempPassword} onFocus={e => e.target.select()} />
                    <button onClick={handleCopyPassword} className="dm-icon-btn" aria-label="Copy password" title="Copy password">
                      {copiedPassword ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>Shown once — it isn't stored anywhere.</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={openInviteForm} className="dm-btn dm-btn-ghost flex-1">Invite another</button>
                  <button type="button" onClick={() => setIsInviting(false)} className="dm-btn dm-btn-primary flex-1">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Email</label>
                  <input type="email" required autoFocus className="dm-input" placeholder="engineer@example.com" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Name (optional)</label>
                  <input type="text" className="dm-input" placeholder="Full name" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                {inviteError && (
                  <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.9rem', whiteSpace: 'normal' }}>
                    <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span>{inviteError}</span>
                  </div>
                )}
                <button type="submit" className="dm-btn dm-btn-primary" style={{ width: '100%' }} disabled={inviteSubmitting}>
                  {inviteSubmitting ? 'Creating…' : 'Create account + grant access'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
