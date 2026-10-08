import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { MotorAlert } from '../types';

interface AlertsPanelProps {
  alerts: MotorAlert[];
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts }) => {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity === 'ALL') return true;
    return a.severity === filterSeverity;
  });

  return (
    <div className="bg-[#16202c] rounded-md border border-[#263548] text-white flex flex-col justify-between shadow-xs overflow-hidden">
      {/* Dark Card Header matching 2nd Floor CT */}
      <div className="p-3 bg-[#1c2837] border-b border-[#263548] flex items-center justify-between">
        <div>
          <h4 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            <span>Fault Detection & SOP Log</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50">
              Live Monitor
            </span>
          </h4>
          <span className="text-[11px] text-slate-400 font-medium block">
            Real-Time Threshold & AI Trigger Actions
          </span>
        </div>

        {/* Severity Filter buttons */}
        <div className="flex items-center gap-1 text-[10px] font-mono">
          {(['ALL', 'CRITICAL', 'WARNING'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                filterSeverity === sev
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List Body */}
      <div className="p-3 space-y-2 max-h-52 overflow-y-auto flex-1">
        {filteredAlerts.length === 0 ? (
          <div className="py-6 text-center text-slate-400 font-mono text-xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5 opacity-90" />
            <p className="text-slate-200 font-medium">All 6 Features Within Normal Limits</p>
            <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
              Continuous monitoring active at 10 kHz
            </span>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isCrit = alert.severity === 'CRITICAL';
            return (
              <div
                key={alert.id}
                className="p-2.5 rounded bg-[#131b24] border border-[#223042] text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      isCrit
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {alert.parameter}: <strong className="text-white">{alert.currentReading}</strong>
                  </span>
                </div>
                <p className="text-[11px] font-sans text-slate-300 leading-snug">
                  {alert.recommendedAction}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Legend and Metadata at bottom matching screenshot */}
      <div className="p-2.5 bg-[#141d27] border-t border-[#263548] flex items-center justify-between text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Critical Fault
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> Warning
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" /> SOP Standard
          </span>
        </div>
        <span>ISO-10816</span>
      </div>
    </div>
  );
};
