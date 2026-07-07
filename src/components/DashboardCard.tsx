import React from 'react';
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

export default function DashboardCard({
  id,
  title,
  value,
  subValue,
  icon: IconComp,
  colorScheme,
  trend,
  actionLabel,
  onActionClick
}: DashboardCardProps) {
  // Define color variations
  const schemes = {
    rose: {
      border: 'border-rose-100 hover:border-rose-250',
      bg: 'bg-rose-50/10',
      iconBox: 'bg-rose-100 text-rose-700',
      valueClr: 'text-rose-600',
    },
    amber: {
      border: 'border-amber-100 hover:border-amber-250',
      bg: 'bg-amber-50/10',
      iconBox: 'bg-amber-100 text-amber-700',
      valueClr: 'text-amber-600',
    },
    blue: {
      border: 'border-blue-100 hover:border-blue-250',
      bg: 'bg-blue-50/10',
      iconBox: 'bg-blue-100 text-blue-700',
      valueClr: 'text-blue-600',
    },
    emerald: {
      border: 'border-emerald-100 hover:border-emerald-250',
      bg: 'bg-emerald-50/10',
      iconBox: 'bg-emerald-100 text-emerald-700',
      valueClr: 'text-emerald-600',
    },
    slate: {
      border: 'border-slate-200 hover:border-slate-300',
      bg: 'bg-slate-50/10',
      iconBox: 'bg-slate-100 text-slate-700',
      valueClr: 'text-slate-800',
    },
    violet: {
      border: 'border-violet-100 hover:border-violet-250',
      bg: 'bg-violet-50/10',
      iconBox: 'bg-violet-100 text-violet-700',
      valueClr: 'text-violet-600',
    }
  };

  const choice = schemes[colorScheme] || schemes.slate;

  return (
    <motion.div
      id={id}
      whileHover={{ y: -3 }}
      className={`bg-white rounded-3xl p-5 border shadow-xs transition-all flex flex-col justify-between ${choice.border} ${choice.bg}`}
    >
      <div>
        {/* Header containing icon and badge */}
        <div className="flex justify-between items-center mb-3.5">
          <span className="text-xs font-bold text-slate-400 font-sans uppercase tracking-wider">{title}</span>
          <div className={`p-2.5 rounded-xl flex items-center justify-center shrink-0 ${choice.iconBox}`}>
            <IconComp className="w-5 h-5" />
          </div>
        </div>

        {/* Primary Value */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-2xl font-black tracking-tight ${choice.valueClr}`}>
              {value}
            </h3>
            {trend && trend !== 'neutral' && (
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                  trend === 'up' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                }`}
              >
                {trend === 'up'
                  ? <ArrowUpRight className="w-3 h-3" />
                  : <ArrowDownRight className="w-3 h-3" />
                }
              </span>
            )}
          </div>
          {subValue && (
            <p className="text-[11px] font-mono text-slate-400">
              {subValue}
            </p>
          )}
        </div>
      </div>

      {/* Optional action triggers */}
      {actionLabel && onActionClick && (
        <div className="border-t border-slate-100 pt-3 mt-4 flex justify-end">
          <button
            onClick={onActionClick}
            className="text-xs font-bold text-slate-500 hover:text-rose-500 hover:underline transition flex items-center cursor-pointer"
          >
            <span>{actionLabel}</span>
            <span className="ml-1 font-mono">&rarr;</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
