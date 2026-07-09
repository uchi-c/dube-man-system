import React, { useEffect, useState } from 'react';
import { Settings2, Save, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  fetchPrintPricingSettings, upsertPrintPricingSettings
} from '../services/supabase';
import { formatCurrency } from '../utils/format';

interface PricingForm {
  bw_price_per_page:     number;
  colour_price_per_page: number;
  paper_cost_per_page:   number;
}

export default function PrintSettings() {
  const [form, setForm]       = useState<PricingForm>({
    bw_price_per_page: 1.00,
    colour_price_per_page: 5.00,
    paper_cost_per_page: 0.20,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchPrintPricingSettings();
      if (data) {
        setForm({
          bw_price_per_page: data.bw_price_per_page,
          colour_price_per_page: data.colour_price_per_page,
          paper_cost_per_page: data.paper_cost_per_page,
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);
    const ok = await upsertPrintPricingSettings(form);
    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError('Failed to save settings. Check your permissions and try again.');
    }
    setSaving(false);
  };

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1.5";

  const marginBW = form.bw_price_per_page - form.paper_cost_per_page;
  const marginColour = form.colour_price_per_page - form.paper_cost_per_page;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm font-mono">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg" id="print-settings">
      <div>
        <h2 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
          <Settings2 className="w-4 h-4 text-blue-500" />
          <span>Print Pricing Settings</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          These prices are used to calculate revenue, cost, and profit for every print job.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-5">
        {/* BW price */}
        <div>
          <label className={labelCls}>Black & White — Price per Page (ZMW)</label>
          <input
            type="number" min="0" step="0.01" required
            className={inputCls}
            value={form.bw_price_per_page}
            onChange={e => setForm(f => ({ ...f, bw_price_per_page: Number(e.target.value) }))}
          />
        </div>

        {/* Colour price */}
        <div>
          <label className={labelCls}>Colour — Price per Page (ZMW)</label>
          <input
            type="number" min="0" step="0.01" required
            className={inputCls}
            value={form.colour_price_per_page}
            onChange={e => setForm(f => ({ ...f, colour_price_per_page: Number(e.target.value) }))}
          />
        </div>

        {/* Paper cost */}
        <div>
          <label className={labelCls}>Paper Cost per Page (ZMW)</label>
          <input
            type="number" min="0" step="0.001" required
            className={inputCls}
            value={form.paper_cost_per_page}
            onChange={e => setForm(f => ({ ...f, paper_cost_per_page: Number(e.target.value) }))}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Used to calculate cost and profit per job. Typically: cost per ream ÷ pages per ream.
          </p>
        </div>

        {/* Margin preview */}
        <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-2 gap-4 text-xs border border-slate-100 tabular-nums">
          <div>
            <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">B&W Margin / Page</div>
            <div className={`text-base font-extrabold ${marginBW >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {formatCurrency(marginBW, { decimals: 3 })}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">Colour Margin / Page</div>
            <div className={`text-base font-extrabold ${marginColour >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {formatCurrency(marginColour, { decimals: 3 })}
            </div>
          </div>
        </div>

        {success && (
          <div className="flex items-center space-x-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings saved successfully.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center space-x-2 cursor-pointer transition"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving…' : 'Save Settings'}</span>
        </button>
      </form>

      {/* Note about printer-level overrides */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700">
        <strong>Note:</strong> These are organization-wide defaults. Individual printers can have their own
        BW / Colour cost-per-page values set in the Printers tab. When both are set, the pricing settings
        above take precedence for revenue calculations (they represent your sell price, while printer values
        represent your cost).
      </div>
    </div>
  );
}
