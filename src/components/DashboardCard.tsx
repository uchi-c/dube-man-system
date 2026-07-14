import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardCardProps {
  id?: string;
  title: string;
  value: string | number;
  subValue?: string | number;
  icon: LucideIcon;
  colorScheme: 'rose' | 'amber' | 'blue' | 'emerald' | 'slate' | 'violet';
  trend?: 'up' | 'down' | 'neutral';
  actionLabel?: string;
  onActionClick?: () => void;
}

// One accent system, everywhere — legacy scheme names map onto tokens.
const TONE: Record<string, { fg: string; bg: string; ring: string }> = {
  blue:    { fg: 'var(--blue-400)',  bg: 'var(--blue-bg)',    ring: 'rgba(76,111,255,0.30)' },
  rose:    { fg: 'var(--blue-400)',  bg: 'var(--blue-bg)',    ring: 'rgba(76,111,255,0.30)' },
  violet:  { fg: 'var(--cyan-300)',  bg: 'var(--cyan-bg)',    ring: 'rgba(125,211,252,0.30)' },
  emerald: { fg: 'var(--success)',   bg: 'var(--success-bg)', ring: 'rgba(61,220,151,0.30)' },
  amber:   { fg: 'var(--warning)',   bg: 'var(--warning-bg)', ring: 'rgba(255,176,32,0.30)' },
  slate:   { fg: 'var(--text-mid)',  bg: 'rgba(255,255,255,0.05)', ring: 'var(--panel-line)' },
};

export default function DashboardCard({
  id, title, value, subValue, icon: IconComp, colorScheme, trend, actionLabel, onActionClick,
}: DashboardCardProps) {
  const tone = TONE[colorScheme] || TONE.slate;

  return (
    <motion.div id={id} whileHover={{ y: -2 }} className="dm-card p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-3.5">
          <span className="dm-label" style={{ padding: 0 }}>{title}</span>
          <div className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: 11, background: tone.bg, color: tone.fg, border: `1px solid ${tone.ring}` }}>
            <IconComp style={{ width: 19, height: 19 }} />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="dm-kpi">{value}</span>
            {trend && trend !== 'neutral' && (
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 20, height: 20, borderRadius: 999,
                  background: trend === 'up' ? 'var(--success-bg)' : 'var(--danger-bg)',
                  color: trend === 'up' ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {trend === 'up' ? <ArrowUpRight style={{ width: 12, height: 12 }} /> : <ArrowDownRight style={{ width: 12, height: 12 }} />}
              </span>
            )}
          </div>
          {subValue && <p className="dm-nums" style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>{subValue}</p>}
        </div>
      </div>

      {actionLabel && onActionClick && (
        <div className="pt-3 mt-4 flex justify-end" style={{ borderTop: '1px solid var(--panel-line)' }}>
          <button onClick={onActionClick} className="flex items-center gap-1" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-mid)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <span>{actionLabel}</span> →
          </button>
        </div>
      )}
    </motion.div>
  );
}
