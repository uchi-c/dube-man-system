import React, { useEffect, useState, useMemo } from 'react';
import { fetchActivityLogs } from '../services/supabase';
import { ActivityLog } from '../types';
import { Search, History, RefreshCcw, User, Clock, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

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
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Ciso Security Logs & Audits</h1>
          <p className="text-sm text-slate-500 mt-1">Chronological ledger recording critical operator events and session logins.</p>
        </div>
        <button
          onClick={refreshLogs}
          className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-650 bg-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
        >
          <RefreshCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Sync logs</span>
        </button>
      </div>

      {userRole !== 'ADMIN' && (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start space-x-2.5 text-rose-800 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <div>
            <span className="font-bold">Privileged Access Advisory</span>
            <p className="mt-0.5">Your current login has limited audit logging filters. Only administrator accounts can view complete system trails.</p>
          </div>
        </div>
      )}

      {/* Search filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="relative">
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 text-slate-700 rounded-2xl outline-none text-sm transition-all"
            placeholder="Filter security events by keywords or worker names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Logs ledger list */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center text-slate-400">
          <RefreshCcw className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-2" />
          <p className="text-xs font-mono">Synchronizing audit logs...</p>
        </div>
      ) : filteredLogs.length > 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-mono text-slate-450 uppercase tracking-wider text-[10px]">
                  <th className="px-5 py-3 font-bold">Operator Profile</th>
                  <th className="px-5 py-3 font-bold">Event Log Description</th>
                  <th className="px-5 py-3 font-bold">Security Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-sans">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* User */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 text-xs font-bold font-mono">
                          {log.user_name.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 block truncate max-w-[150px]">{log.user_name}</span>
                          <span className="text-[10px] text-slate-400">UID: {log.user_id}</span>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-3.5 pr-8 leading-snug break-words max-w-sm">
                      <span className="font-medium text-slate-700">{log.action}</span>
                    </td>

                    {/* Timestamp */}
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[10px] text-slate-400">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1 text-slate-350" />
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
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center">
          <History className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-slate-600 text-sm font-bold mt-4">Audits database empty</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">No security logs match your search. Trigger some actions inside the application tabs above to log transactions.</p>
        </div>
      )}
    </div>
  );
}

