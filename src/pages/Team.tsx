import React, { useState, useEffect } from 'react';
import { User, UserRole, OrganizationInvite } from '../types';
import { fetchAllUsers, updateUserRole } from '../services/supabase';
import { createInvite, fetchInvites, revokeInvite } from '../services/organizations';
import {
  UserPlus, Mail, Calendar, AlertCircle, RefreshCw, Check, X,
  Copy, Ban, Clock, ShieldCheck, Users as UsersIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DataTable from '../components/DataTable';

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: 'STAFF',         label: 'Staff',          hint: 'Sales, inventory, customers, pharmacy' },
  { value: 'CAFE_OPERATOR', label: 'Café Operator',  hint: 'Café workstations & WiFi sessions' },
  { value: 'ADMIN',         label: 'Admin',          hint: 'Full access, incl. billing & team' },
];

const roleBadgeClass = (role: UserRole) =>
  role === 'ADMIN' ? 'dm-badge-info' : role === 'CAFE_OPERATOR' ? 'dm-badge-warning' : 'dm-badge-neutral';

const roleLabel = (role: UserRole) => ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;

function inviteStatus(invite: OrganizationInvite): { label: string; cls: string } {
  if (invite.revoked_at) return { label: 'Revoked', cls: 'dm-badge-neutral' };
  if (invite.accepted_at) return { label: 'Accepted', cls: 'dm-badge-success' };
  if (new Date(invite.expires_at) < new Date()) return { label: 'Expired', cls: 'dm-badge-danger' };
  return { label: 'Pending', cls: 'dm-badge-warning' };
}

export default function Team() {
  const [members, setMembers] = useState<User[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('STAFF');
  const [inviteError, setInviteError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [users, pendingInvites] = await Promise.all([fetchAllUsers(), fetchInvites()]);
      setMembers(users);
      setInvites(pendingInvites);
    } catch (err) {
      console.error('Error loading team:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openInviteForm = () => {
    setInviteEmail(''); setInviteRole('STAFF'); setInviteError(''); setInviteLink(''); setCopied(false);
    setIsInviting(true);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    if (!inviteEmail.trim()) { setInviteError('Enter the email address to invite.'); return; }
    setSubmitting(true);
    try {
      const { token } = await createInvite(inviteEmail.trim(), inviteRole);
      const link = `${window.location.origin}${window.location.pathname}#/signup?invite=${token}`;
      setInviteLink(link);
      await loadData();
    } catch (err: any) {
      setInviteError(err?.message || "Couldn't create the invite. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — the link is still on-screen to copy manually.
    }
  };

  const handleRevoke = async (invite: OrganizationInvite) => {
    const ok = await revokeInvite(invite.id);
    if (ok) await loadData();
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    const ok = await updateUserRole(userId, role);
    if (ok) await loadData();
  };

  const memberColumns = [
    {
      header: '',
      accessor: (u: User) => (
        <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-bg)', border: '1px solid rgba(76,111,255,0.3)', color: 'var(--blue-400)', fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", textTransform: 'uppercase', fontSize: '0.85rem' }}>
          {u.name.charAt(0)}
        </div>
      ),
    },
    { header: 'Name', accessor: (u: User) => <strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{u.name}</strong> },
    {
      header: 'Email',
      accessor: (u: User) => (
        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-mid)' }}>
          <Mail style={{ width: 13, height: 13, color: 'var(--text-low)' }} /> {u.email}
        </span>
      ),
    },
    {
      header: 'Role',
      accessor: (u: User) => (
        <select
          className="dm-select"
          style={{ minHeight: 32, padding: '0.3rem 1.8rem 0.3rem 0.6rem', fontSize: '0.78rem' }}
          value={u.role}
          onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
        >
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      ),
    },
    {
      header: 'Joined',
      accessor: (u: User) => (
        <span className="dm-nums flex items-center gap-1.5" style={{ color: 'var(--text-low)' }}>
          <Calendar style={{ width: 13, height: 13 }} /> {new Date(u.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const pendingInvites = invites.filter(i => inviteStatus(i).label === 'Pending');

  return (
    <div className="space-y-6 dm-animate-in" id="team-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="dm-h1">Team</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>
            Invite teammates and choose whether they sign in as Admin, Staff, or Café Operator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="dm-icon-btn" title="Reload">
            <RefreshCw style={{ width: 16, height: 16 }} className={loading ? 'dm-spin' : ''} />
          </button>
          <button onClick={openInviteForm} className="dm-btn dm-btn-primary">
            <UserPlus style={{ width: 16, height: 16 }} /> Invite teammate
          </button>
        </div>
      </div>

      <div className="dm-card p-5">
        <h3 className="dm-h3" style={{ marginBottom: 14 }}>Members</h3>
        <DataTable
          data={members}
          columns={memberColumns}
          searchPlaceholder="Search by name or email…"
          filterFunction={(u, query) =>
            u.name.toLowerCase().includes(query.toLowerCase()) ||
            u.email.toLowerCase().includes(query.toLowerCase())
          }
          emptyMessage="No teammates yet."
          loading={loading}
        />
      </div>

      {pendingInvites.length > 0 && (
        <div className="dm-card p-5">
          <h3 className="dm-h3" style={{ marginBottom: 14 }}>Pending invites</h3>
          <div className="space-y-2">
            {pendingInvites.map(invite => {
              const status = inviteStatus(invite);
              return (
                <div key={invite.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="dm-truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-hi)' }}>{invite.email}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }} className="flex items-center gap-1.5">
                      <Clock style={{ width: 11, height: 11 }} /> Invited {new Date(invite.created_at).toLocaleDateString()} · expires {new Date(invite.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`dm-badge ${roleBadgeClass(invite.role)}`}>{roleLabel(invite.role)}</span>
                    <span className={`dm-badge ${status.cls}`}>{status.label}</span>
                    <button onClick={() => handleRevoke(invite)} className="dm-icon-btn" title="Revoke invite" aria-label="Revoke invite">
                      <Ban style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Invite slide-over ---- */}
      <AnimatePresence>
        {isInviting && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsInviting(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm p-6 overflow-y-auto"
              style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--panel-line)', boxShadow: 'var(--shadow-modal)' }}
              role="dialog" aria-label="Invite teammate"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="dm-h2">Invite teammate</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>They'll join this organization with the role you pick below.</p>
                </div>
                <button onClick={() => setIsInviting(false)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {inviteLink ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                    <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                    <span>Invite created for {inviteEmail}. Share this link with them — it expires in 7 days.</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Invite link</label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly className="dm-input dm-nums" style={{ fontSize: '0.72rem' }} value={inviteLink} onFocus={e => e.target.select()} />
                      <button onClick={handleCopyLink} className="dm-icon-btn" aria-label="Copy link" title="Copy link">
                        {copied ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={openInviteForm} className="dm-btn dm-btn-ghost flex-1">Invite another</button>
                    <button type="button" onClick={() => setIsInviting(false)} className="dm-btn dm-btn-primary flex-1">Done</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Email address</label>
                    <input type="email" required autoFocus className="dm-input" placeholder="teammate@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Role</label>
                    <div className="space-y-2">
                      {ROLE_OPTIONS.map(opt => {
                        const active = inviteRole === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setInviteRole(opt.value)}
                            aria-pressed={active}
                            className="w-full flex items-center gap-3 text-left"
                            style={{
                              padding: '0.65rem 0.8rem',
                              borderRadius: 'var(--r-control)',
                              border: active ? '1px solid #4C6FFF' : '1px solid var(--panel-line)',
                              background: active ? 'rgba(76,111,255,0.14)' : 'var(--panel-2)',
                              cursor: 'pointer',
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                          >
                            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 8, background: active ? 'rgba(76,111,255,0.22)' : 'var(--panel)', color: active ? 'var(--blue-400)' : 'var(--text-low)' }}>
                              {opt.value === 'ADMIN' ? <ShieldCheck style={{ width: 15, height: 15 }} /> : <UsersIcon style={{ width: 15, height: 15 }} />}
                            </div>
                            <div className="min-w-0">
                              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: active ? 'var(--text-hi)' : 'var(--text-mid)' }}>{opt.label}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>{opt.hint}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {inviteError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                      <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                      <span>{inviteError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setIsInviting(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                    <button type="submit" disabled={submitting} className="dm-btn dm-btn-primary flex-1">{submitting ? 'Creating…' : 'Create invite'}</button>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
