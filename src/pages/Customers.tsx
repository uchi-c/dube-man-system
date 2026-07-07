import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { fetchCustomers, insertCustomer } from '../services/supabase';
import { Users, Plus, Mail, Phone, Calendar, UserPlus, Info, RefreshCw, Check } from 'lucide-react';
import { motion } from 'motion/react';
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

  useEffect(() => {
    loadData();
  }, []);

  const handleRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess(false);

    if (!custName.trim()) {
      setRegError('Client name field is required.');
      return;
    }

    try {
      const result = await insertCustomer(custName, custPhone, custEmail);
      if (result) {
        setRegSuccess(true);
        setCustName('');
        setCustPhone('');
        setCustEmail('');
        await loadData();
        
        setTimeout(() => {
          setRegSuccess(false);
          setIsRegistering(false);
        }, 1500);
      } else {
        setRegError('Could not process customer profile write back.');
      }
    } catch (err: any) {
      setRegError(err?.message || 'Error occurred registering client profile.');
    }
  };

  const columns = [
    {
      header: 'Avatar',
      accessor: (c: Customer) => (
        <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center font-mono select-none uppercase text-xs">
          {c.name.charAt(0)}
        </div>
      )
    },
    {
      header: 'Client Name',
      accessor: (c: Customer) => <strong className="text-slate-800 text-xs font-semibold">{c.name}</strong>
    },
    {
      header: 'Phone Connection',
      accessor: (c: Customer) => (
        <span className="text-slate-500 font-mono text-xs flex items-center">
          <Phone className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
          {c.phone || 'Unavailable'}
        </span>
      )
    },
    {
      header: 'Email Profile',
      accessor: (c: Customer) => (
        <span className="text-slate-500 font-mono text-xs flex items-center">
          <Mail className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
          {c.email || 'Generic Walk-in'}
        </span>
      )
    },
    {
      header: 'Registry Date',
      accessor: (c: Customer) => (
        <span className="text-slate-400 font-mono text-xs flex items-center">
          <Calendar className="w-3.5 h-3.5 mr-1 text-slate-300 shrink-0" />
          {new Date(c.created_at).toLocaleDateString()}
        </span>
      )
    },
    {
      header: 'Customer Index ID',
      accessor: (c: Customer) => <span className="font-mono text-[9px] text-slate-400 bg-slate-50 px-1 py-0.5 rounded border">{c.id.slice(0, 13)}...</span>
    }
  ];

  return (
    <div className="space-y-6" id="customers-page">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Client Accounts Registry</h1>
          <p className="text-sm text-slate-500 mt-1">Review contact records, track billing accounts, and manage loyalty indices.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button 
            onClick={loadData}
            className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer transition-all shrink-0"
            title="Reload records"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsRegistering(true)}
            className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-sm font-semibold shadow-md inline-flex items-center space-x-2 cursor-pointer transition shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Register New Customer</span>
          </button>
        </div>
      </div>

      {/* Main Ledger list */}
      <DataTable 
        data={customers}
        columns={columns}
        searchPlaceholder="Filter clients by email, phone, or name parameters..."
        filterFunction={(c, query) => 
          c.name.toLowerCase().includes(query.toLowerCase()) || 
          (c.phone || '').toLowerCase().includes(query.toLowerCase()) || 
          (c.email || '').toLowerCase().includes(query.toLowerCase())
        }
        emptyMessage="No customer records detected. Click 'Register New Customer' to add your first client profile."
        loading={loading}
      />

      {/* REGISTRATION MODAL */}
      {isRegistering && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-left"
          >
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-slate-800">Add Customer Account</h3>
              <p className="text-slate-400 text-xs mt-0.5">Register walk-in client records to lock details for future billing receipts.</p>
            </div>

            <form onSubmit={handleRegisterClient} className="space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 block">Full Customer Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alinafe Phiri"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 outline-none font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 block">Phone Connection (WhatsApp preferred)</label>
                <input
                  type="text"
                  placeholder="e.g. +265 999 123 456"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 block">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. alinafe@gmail.com"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 outline-none font-mono"
                />
              </div>

              {regError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg flex items-center space-x-1.5 font-mono text-[11px]">
                  <Info className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{regError}</span>
                </div>
              )}

              {regSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg flex items-center space-x-1.5 font-mono text-[11px]">
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3] shrink-0" />
                  <span>Account saved successfully! Updating ledger...</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 border-t justify-end text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md cursor-pointer transition"
                >
                  Register Profile
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
