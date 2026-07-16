import { useEffect, useState, useMemo } from 'react';
import { fetchActivityLogs } from '../services/supabase';
import { ActivityLog } from '../types';
import { Search, History, RefreshCcw, Clock, ShieldAlert } from 'lucide-react';

interface ActivityLogsProps {
  userRole: string;
}

export default function ActivityLogs({ userRole }: ActivityLogsProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const refreshLogs = async () => {
    setLoading(true);
    try {
      setLogs(await fetchActivityLogs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      return log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
             log.user_name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [logs, searchQuery]);

  return (
    <div className="space-y-6" id="activity-logs-tab">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="dm-h1">Security Logs &amp; Audits</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 4 }}>Chronological ledger recording critical operator events and session logins.</p>
        </div>
        <button
          onClick={refreshLogs}
          className="dm-btn dm-btn-ghost"
        >
          <RefreshCcw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          <span>Sync logs</span>
        </button>
      </div>

      {userRole !== 'ADMIN' && (
        <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.85rem 1rem', alignItems: 'flex-start', whiteSpace: 'normal' }}>
          <ShieldAlert style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 700 }}>Privileged Access Advisory</span>
            <p style={{ marginTop: 2 }}>Your current login has limited audit logging filters. Only administrator accounts can view complete system trails.</p>
          </div>
        </div>
      )}

      {/* Search filters */}
      <div className="dm-card p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
          <input
            type="text"
            className="dm-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Filter security events by keywords or worker names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Logs ledger list */}
      {loading ? (
        <div className="dm-card-inset text-center" style={{ padding: '3rem 1.5rem' }}>
          <RefreshCcw className="dm-spin" style={{ width: 28, height: 28, color: 'var(--blue-400)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>Synchronizing audit logs...</p>
        </div>
      ) : filteredLogs.length > 0 ? (
        <div className="dm-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="dm-scroll-x">
            <table className="w-full text-left dm-nums" style={{ borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: 'var(--panel-2)', color: 'var(--text-low)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.625rem', borderBottom: '1px solid var(--panel-line)' }}>
                  <th className="px-5 py-3" style={{ fontWeight: 700 }}>Operator Profile</th>
                  <th className="px-5 py-3" style={{ fontWeight: 700 }}>Event Log Description</th>
                  <th className="px-5 py-3" style={{ fontWeight: 700 }}>Security Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} className="dm-row" style={{ borderTop: '1px solid var(--panel-line)', color: 'var(--text-mid)' }}>
                    {/* User */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--blue-bg)', color: 'var(--blue-400)', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace' }}>
                          {log.user_name.charAt(0)}
                        </div>
                        <div>
                          <span className="dm-truncate" style={{ fontWeight: 700, color: 'var(--text-hi)', display: 'block', maxWidth: 150 }}>{log.user_name}</span>
                          <span style={{ fontSize: '0.625rem', color: 'var(--text-low)' }}>UID: {log.user_id}</span>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-3.5 pr-8" style={{ lineHeight: 1.4, wordBreak: 'break-word', maxWidth: 384 }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-mid)' }}>{log.action}</span>
                    </td>

                    {/* Timestamp */}
                    <td className="px-5 py-3.5 whitespace-nowrap" style={{ fontFamily: 'monospace', fontSize: '0.625rem', color: 'var(--text-low)' }}>
                      <span className="flex items-center">
                        <Clock style={{ width: 11, height: 11, marginRight: 4, color: 'var(--text-low)' }} />
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="dm-card-inset text-center" style={{ padding: '3rem 1.5rem' }}>
          <History style={{ width: 48, height: 48, color: 'var(--text-low)', margin: '0 auto' }} />
          <h3 style={{ color: 'var(--text-mid)', fontSize: '0.875rem', fontWeight: 700, marginTop: 16 }}>Audits database empty</h3>
          <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', maxWidth: 380, margin: '4px auto 0' }}>No security logs match your search. Trigger some actions inside the application tabs above to log transactions.</p>
        </div>
      )}
    </div>
  );
}
