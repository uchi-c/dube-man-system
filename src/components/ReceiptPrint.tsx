import { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { Sale } from '../types';
import { formatCurrency } from '../utils/format';
import { getCurrentOrganizationName } from '../services/organizations';

type ReceiptWidth = '58mm' | '80mm';
const WIDTH_STORAGE_KEY = 'uruu_receipt_width';

/**
 * Prints a sale via the browser's own print dialog, formatted to fit a
 * thermal receipt printer set up as a normal OS printer (the "print
 * dialog, receipt-width layout" approach — works with any printer already
 * configured in Windows/Mac, no special browser permissions, works from a
 * phone too). Only the #receipt-print-area element is visible when
 * printing; everything else on the page (including this modal's own
 * chrome, marked .receipt-no-print) is hidden for the duration.
 */
export default function ReceiptPrint({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [width, setWidth] = useState<ReceiptWidth>(
    () => (typeof window !== 'undefined' && (localStorage.getItem(WIDTH_STORAGE_KEY) as ReceiptWidth)) || '80mm',
  );

  useEffect(() => {
    getCurrentOrganizationName().then(setOrgName);
  }, []);

  const handleWidthChange = (w: ReceiptWidth) => {
    setWidth(w);
    try { localStorage.setItem(WIDTH_STORAGE_KEY, w); } catch { /* private browsing — fine to skip */ }
  };

  const total = sale.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area {
            position: absolute; top: 0; left: 0; width: ${width};
            font-family: 'Courier New', monospace; color: #000; padding: 4mm;
          }
          .receipt-no-print { display: none !important; }
        }
      `}</style>

      <div
        className="dm-card p-5 space-y-4 w-full"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 380, background: 'var(--bg-1)', boxShadow: 'var(--shadow-modal)' }}
        role="dialog" aria-label="Print receipt"
      >
        <div className="receipt-no-print flex items-center justify-between">
          <h3 className="dm-h2">Receipt</h3>
          <button onClick={onClose} className="dm-icon-btn" aria-label="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="receipt-no-print flex items-center gap-2" style={{ fontSize: '0.75rem' }}>
          <span className="dm-label" style={{ padding: 0 }}>Printer width</span>
          {(['58mm', '80mm'] as const).map(w => (
            <button
              key={w}
              onClick={() => handleWidthChange(w)}
              className={`dm-badge ${width === w ? 'dm-badge-info' : 'dm-badge-neutral'}`}
              style={{ cursor: 'pointer' }}
            >
              {w}
            </button>
          ))}
        </div>

        <div
          id="receipt-print-area"
          className="dm-card-inset"
          style={{ padding: '1rem', fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-hi)' }}
        >
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>{orgName || 'Uruu OS'}</div>
          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-low)', marginBottom: 8 }}>
            {new Date(sale.created_at).toLocaleString()}
          </div>
          <div style={{ borderTop: '1px dashed currentColor', margin: '6px 0' }} />
          <div>Receipt: {sale.id.slice(0, 8)}</div>
          <div>Customer: {sale.customer_name || 'Walk-in'}</div>
          <div style={{ borderTop: '1px dashed currentColor', margin: '6px 0' }} />
          {sale.items.map(item => (
            <div key={item.id} className="flex justify-between" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>
                {item.product_name} x{item.quantity}
              </span>
              <span className="dm-nums">{formatCurrency(item.quantity * item.unit_price)}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed currentColor', margin: '6px 0' }} />
          <div className="flex justify-between" style={{ fontWeight: 700 }}>
            <span>TOTAL</span>
            <span className="dm-nums">{formatCurrency(total)}</span>
          </div>
          <div style={{ marginTop: 4 }}>Payment: {sale.payment_method}</div>
          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-low)', marginTop: 10 }}>
            Thank you for your business!
          </div>
        </div>

        <button onClick={() => window.print()} className="receipt-no-print dm-btn dm-btn-primary" style={{ width: '100%' }}>
          <Printer style={{ width: 15, height: 15 }} />
          <span>Print</span>
        </button>
      </div>
    </div>
  );
}
