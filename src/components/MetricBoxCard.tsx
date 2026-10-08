import React from 'react';
import { MotorCondition } from '../types';

interface MetricBoxCardProps {
  label: string;
  sublabel: string;
  value: string | number;
  unit: string;
  status: MotorCondition;
  timestamp?: string;
  normalRange?: string;
}

export const MetricBoxCard: React.FC<MetricBoxCardProps> = ({
  label,
  sublabel,
  value,
  unit,
  status,
  timestamp = 'Live telemetry',
  normalRange,
}) => {
  const getStatusDot = () => {
    switch (status) {
      case 'CRITICAL':
        return 'bg-rose-500 ring-4 ring-rose-100';
      case 'WARNING':
        return 'bg-amber-500 ring-4 ring-amber-100';
      default:
        return 'bg-emerald-500 ring-4 ring-emerald-100';
    }
  };

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] p-4 flex flex-col justify-between shadow-xs hover:border-slate-400 transition-colors">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 tracking-tight">{label}</h4>
            <span className="text-[11px] text-slate-400 font-medium block">{sublabel}</span>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot()}`} />
        </div>

        <div className="mt-2 mb-1">
          <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-800 tracking-tight">
            {typeof value === 'number' ? value.toFixed(2) : value}
          </span>
          <span className="text-xs font-semibold text-slate-500 ml-1.5">{unit}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
        <span className="flex items-center gap-1">🕒 {timestamp}</span>
        {normalRange && <span className="font-mono text-[10px] text-slate-500 font-medium">{normalRange}</span>}
      </div>
    </div>
  );
};
