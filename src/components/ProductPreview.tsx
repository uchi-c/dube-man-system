import { ShoppingCart, Package, Pill, Monitor, Printer, LayoutDashboard, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * Every "screen" below is built from the app's own dm-* classes and color
 * tokens (dm-card, dm-badge-*, --text-hi, etc.) instead of a real
 * screenshot -- there's no browser automation set up in this repo to
 * capture one, and reusing the live design system directly means these
 * mockups can't visually drift from the actual product the way a stale
 * screenshot would.
 */

function BrowserChrome({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div
      className="flex-shrink-0"
      style={{ width: 296, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--panel-line-strong)', background: 'var(--panel)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center gap-1.5" style={{ padding: '10px 12px', borderBottom: '1px solid var(--panel-line)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#FF6B6B' }} />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#FFB020' }} />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#3DDC97' }} />
        <span className="dm-nums" style={{ marginLeft: 8, fontSize: '0.62rem', color: 'var(--text-low)' }}>{path}</span>
      </div>
      <div style={{ padding: 14, minHeight: 240 }}>{children}</div>
    </div>
  );
}

function ScreenTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5" style={{ marginBottom: 12 }}>
      <Icon style={{ width: 13, height: 13, color: 'var(--blue-400)' }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-hi)' }}>{label}</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'success' | 'warning' }) {
  const colorVar = tone === 'blue' ? 'var(--blue-400)' : tone === 'success' ? 'var(--success)' : 'var(--warning)';
  return (
    <div style={{ flex: 1, padding: '8px 8px', borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
      <div style={{ fontSize: '0.55rem', color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div className="dm-nums" style={{ fontSize: '0.82rem', fontWeight: 700, color: colorVar, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DashboardScreen() {
  const bars = [40, 65, 50, 80, 60, 90, 70];
  return (
    <>
      <ScreenTitle icon={LayoutDashboard} label="Overview" />
      <div className="flex gap-1.5" style={{ marginBottom: 12 }}>
        <MiniStat label="Today's sales" value="K1,240" tone="success" />
        <MiniStat label="Low stock" value="3" tone="warning" />
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 64, marginBottom: 4 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: 'linear-gradient(180deg, var(--blue-400), rgba(76,111,255,0.25))' }} />
        ))}
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-low)' }}>Sales, this week</div>
    </>
  );
}

function POSScreen() {
  const items = [
    { name: 'A4 Spiral Notebook', qty: 2, price: 40 },
    { name: 'Airtime Voucher', qty: 1, price: 20 },
  ];
  return (
    <>
      <ScreenTitle icon={ShoppingCart} label="New sale" />
      <div className="space-y-1.5" style={{ marginBottom: 10 }}>
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between" style={{ fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--text-mid)' }}>{it.qty}× {it.name}</span>
            <span className="dm-nums" style={{ color: 'var(--text-hi)', fontWeight: 600 }}>K{it.qty * it.price}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between" style={{ paddingTop: 8, borderTop: '1px solid var(--panel-line)', marginBottom: 10 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-mid)' }}>Total</span>
        <span className="dm-nums" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-hi)' }}>K100.00</span>
      </div>
      <div className="dm-btn dm-btn-primary w-full" style={{ minHeight: 30, fontSize: '0.7rem', justifyContent: 'center' }}>Charge</div>
    </>
  );
}

function InventoryScreen() {
  const rows: { name: string; badge: 'success' | 'warning' | 'danger'; label: string }[] = [
    { name: 'Printer Paper A4', badge: 'success', label: '120 in stock' },
    { name: 'USB Flash Drive 16GB', badge: 'warning', label: '4 · Low' },
    { name: 'HP Toner Cartridge', badge: 'danger', label: 'Out of stock' },
  ];
  return (
    <>
      <ScreenTitle icon={Package} label="Inventory" />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between">
            <span style={{ fontSize: '0.68rem', color: 'var(--text-mid)' }}>{r.name}</span>
            <span className={`dm-badge dm-badge-${r.badge}`} style={{ fontSize: '0.58rem', padding: '0.15rem 0.4rem' }}>{r.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function PharmacyScreen() {
  const rows = [
    { name: 'Amoxicillin · 500mg', rx: true },
    { name: 'Paracetamol · 500mg', rx: false },
    { name: 'Cough Syrup', rx: false },
  ];
  return (
    <>
      <ScreenTitle icon={Pill} label="Pharmacy catalog" />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between">
            <span style={{ fontSize: '0.68rem', color: 'var(--text-mid)' }}>{r.name}</span>
            {r.rx ? <span className="dm-badge dm-badge-info" style={{ fontSize: '0.58rem', padding: '0.15rem 0.4rem' }}>Rx</span> : <Check style={{ width: 12, height: 12, color: 'var(--success)' }} />}
          </div>
        ))}
      </div>
    </>
  );
}

function CafeScreen() {
  const pcs: { name: string; badge: 'success' | 'info' | 'warning'; label: string }[] = [
    { name: 'PC-01', badge: 'success', label: 'Available' },
    { name: 'PC-02', badge: 'info', label: 'Occupied' },
    { name: 'PC-03', badge: 'success', label: 'Available' },
    { name: 'PC-04', badge: 'warning', label: 'Maintenance' },
  ];
  return (
    <>
      <ScreenTitle icon={Monitor} label="Café & WiFi" />
      <div className="grid grid-cols-2 gap-2">
        {pcs.map((pc, i) => (
          <div key={i} style={{ padding: '8px', borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-hi)' }}>{pc.name}</div>
            <span className={`dm-badge dm-badge-${pc.badge}`} style={{ fontSize: '0.55rem', padding: '0.1rem 0.35rem', marginTop: 4 }}>{pc.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function PrintingScreen() {
  return (
    <>
      <ScreenTitle icon={Printer} label="Branding & orders" />
      <div style={{ padding: 10, borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--panel-line)', marginBottom: 8 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-hi)' }}>10× Hoodie embroidery</span>
          <span className="dm-badge dm-badge-info" style={{ fontSize: '0.55rem', padding: '0.1rem 0.35rem' }}>Printing</span>
        </div>
        <div className="flex items-center justify-between" style={{ fontSize: '0.6rem', color: 'var(--text-low)' }}>
          <span>Deposit K50 of K150</span>
          <ArrowRight style={{ width: 11, height: 11 }} />
        </div>
      </div>
      <div className="flex items-center gap-1.5" style={{ fontSize: '0.6rem', color: 'var(--warning)' }}>
        <AlertTriangle style={{ width: 11, height: 11 }} /> K100 balance owed
      </div>
    </>
  );
}

const SCREENS: { path: string; render: React.ElementType; caption: string; desc: string }[] = [
  { path: 'app.uruu.os/dashboard', render: DashboardScreen, caption: 'One dashboard for everything', desc: 'Sales, stock and low-stock alerts at a glance.' },
  { path: 'app.uruu.os/sales', render: POSScreen, caption: 'Point of sale', desc: 'Ring up a sale and take payment in seconds.' },
  { path: 'app.uruu.os/inventory', render: InventoryScreen, caption: 'Live inventory', desc: 'Stock levels update in real time, with low-stock warnings built in.' },
  { path: 'app.uruu.os/pharmacy', render: PharmacyScreen, caption: 'Pharmacy dispensing', desc: 'Track prescriptions, batches and expiry dates.' },
  { path: 'app.uruu.os/cafe', render: CafeScreen, caption: 'Café & WiFi sessions', desc: 'Manage computer stations and internet time in one view.' },
  { path: 'app.uruu.os/printing-orders', render: PrintingScreen, caption: 'Printing & branding orders', desc: 'Track jobs from design through to collection, deposits included.' },
];

export default function ProductPreview() {
  return (
    <div className="w-full">
      <div className="text-center" style={{ marginBottom: 20 }}>
        <h2 style={{ color: 'var(--text-hi)', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.15rem' }}>
          See it in action
        </h2>
        <p style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginTop: 4 }}>
          One workspace for sales, stock, pharmacy, café and print jobs. Scroll through the modules below.
        </p>
      </div>

      <div
        className="dm-scroll-x flex gap-4 px-1"
        style={{ scrollSnapType: 'x mandatory', paddingBottom: 8 }}
      >
        {SCREENS.map((s, i) => {
          const Screen = s.render;
          return (
            <motion.div
              key={s.path}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              style={{ scrollSnapAlign: 'center' }}
              className="flex-shrink-0"
            >
              <BrowserChrome path={s.path}>
                <Screen />
              </BrowserChrome>
              <div style={{ width: 296, marginTop: 10, textAlign: 'left' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-hi)' }}>{s.caption}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-low)', marginTop: 2 }}>{s.desc}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
