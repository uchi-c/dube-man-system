import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { fetchCustomers, insertCustomer } from '../services/supabase';
import { Plus, Mail, Phone, Calendar, AlertCircle, RefreshCw, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DataTable from '../components/DataTable';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess(false);
    if (!custName.trim()) {
      setRegError('Enter a name to register the customer.');
      return;
    }
    try {
      const result = await insertCustomer(custName, custPhone, custEmail);
      if (result) {
        setRegSuccess(true);
        setCustName(''); setCustPhone(''); setCustEmail('');
        await loadData();
        setTimeout(() => { setRegSuccess(false); setIsRegistering(false); }, 1400);
      } else {
        setRegError("Couldn't save the customer. Try again.");
      }
    } catch (err: any) {
      setRegError(err?.message || "Couldn't save the customer. Try again.");
    }
  };

  const columns = [
    {
      header: '',
      accessor: (c: Customer) => (
        <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-bg)', border: '1px solid rgba(76,111,255,0.3)', color: 'var(--blue-400)', fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", textTransform: 'uppercase', fontSize: '0.85rem' }}>
          {c.name.charAt(0)}
        </div>
      ),
    },
    {
      header: 'Name',
      accessor: (c: Customer) => <strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{c.name}</strong>,
    },
    {
      header: 'Phone',
      accessor: (c: Customer) => (
        <span className="dm-nums flex items-center gap-1.5" style={{ color: 'var(--text-mid)' }}>
          <Phone style={{ width: 13, height: 13, color: 'var(--text-low)' }} /> {c.phone || '—'}
        </span>
      ),
    },
    {
      header: 'Email',
      accessor: (c: Customer) => (
        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-mid)' }}>
          <Mail style={{ width: 13, height: 13, color: 'var(--text-low)' }} /> {c.email || '—'}
        </span>
      ),
    },
    {
      header: 'Registered',
      accessor: (c: Customer) => (
        <span className="dm-nums flex items-center gap-1.5" style={{ color: 'var(--text-low)' }}>
          <Calendar style={{ width: 13, height: 13 }} /> {new Date(c.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 dm-animate-in" id="customers-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="dm-h1">Customers</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>Contact records and billing history for your clients.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="dm-icon-btn" title="Reload">
            <RefreshCw style={{ width: 16, height: 16 }} className={loading ? 'dm-spin' : ''} />
          </button>
          <button onClick={() => { setIsRegistering(true); setRegError(''); }} className="dm-btn dm-btn-primary">
            <Plus style={{ width: 16, height: 16 }} /> Register customer
          </button>
        </div>
      </div>

      <DataTable
        data={customers}
        columns={columns}
        searchPlaceholder="Search by name, phone or email…"
        filterFunction={(c, query) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          (c.phone || '').toLowerCase().includes(query.toLowerCase()) ||
          (c.email || '').toLowerCase().includes(query.toLowerCase())
        }
        emptyMessage="No customers yet. Register your first client to start tracking billing."
        loading={loading}
      />

      {/* ---- Registration slide-over ---- */}
      <AnimatePresence>
        {isRegistering && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsRegistering(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm p-6 overflow-y-auto"
              style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--panel-line)', boxShadow: 'var(--shadow-modal)' }}
              role="dialog" aria-label="Register customer"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="dm-h2">Register customer</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>Save contact details for future receipts.</p>
                </div>
                <button onClick={() => setIsRegistering(false)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              <form onSubmit={handleRegisterClient} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Full name</label>
                  <input type="text" required className="dm-input" placeholder="e.g. Alinafe Phiri" value={custName} onChange={e => setCustName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Phone (WhatsApp preferred)</label>
                  <input type="text" className="dm-input" placeholder="e.g. +260 97 123 4567" value={custPhone} onChange={e => setCustPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Email (optional)</label>
                  <input type="email" className="dm-input" placeholder="e.g. alinafe@email.com" value={custEmail} onChange={e => setCustEmail(e.target.value)} />
                </div>

                {regError && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span>{regError}</span>
                  </div>
                )}
                {regSuccess && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                    <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                    <span>Customer saved.</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setIsRegistering(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                  <button type="submit" className="dm-btn dm-btn-primary flex-1">Register</button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
