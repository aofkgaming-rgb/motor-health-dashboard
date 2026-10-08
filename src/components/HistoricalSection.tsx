import React, { useState, useEffect } from 'react';
import {
  History,
  ArrowDownRight,
} from 'lucide-react';
import { HistoricalDataPoint } from '../types';

interface HistoricalSectionProps {
  currentHealthScore: number;
}

export const HistoricalSection: React.FC<HistoricalSectionProps> = ({
  currentHealthScore,
}) => {
  const [activeRange, setActiveRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [historyPoints, setHistoryPoints] = useState<HistoricalDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/motor/history?range=${activeRange}`)
      .then((res) => res.json())
      .then((res) => {
        if (isMounted && res.data) {
          setHistoryPoints(res.data);
        }
      })
      .catch((err) => console.error('Failed to load history:', err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeRange]);

  const minScore = historyPoints.length > 0 ? Math.min(...historyPoints.map((p) => p.healthScore)) : 100;
  const startScore = historyPoints.length > 0 ? historyPoints[0].healthScore : 100;
  const endScore = historyPoints.length > 0 ? historyPoints[historyPoints.length - 1].healthScore : currentHealthScore;
  const deltaScore = endScore - startScore;

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] p-4 flex flex-col justify-between shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
            <History className="w-4 h-4 text-cyan-600" />
            <span>Gradual Motor Degradation & Multi-Horizon Trend</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-medium block">
            Tracks progressive shaft wear, baseline drift, and time-to-maintenance
          </span>
        </div>

        {/* Range Selector */}
        <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 text-xs font-mono">
          {[
            { key: '1h', label: '1 Hour' },
            { key: '6h', label: '6 Hours' },
            { key: '24h', label: '24 Hours' },
            { key: '7d', label: '7 Days' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveRange(item.key as any)}
              className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                activeRange === item.key
                  ? 'bg-white text-slate-800 font-bold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Degradation Metric Strips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs font-mono">
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-500 uppercase block">Starting Health</span>
          <span className="text-base font-bold text-slate-800">{startScore}%</span>
        </div>
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-500 uppercase block">Current Health</span>
          <span
            className={`text-base font-bold ${
              endScore < 50 ? 'text-rose-600' : endScore < 78 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {endScore}%
          </span>
        </div>
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-500 uppercase block">Degradation Drift</span>
          <div className="flex items-center gap-1">
            <span className={`text-base font-bold ${deltaScore < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {deltaScore > 0 ? `+${deltaScore}%` : `${deltaScore}%`}
            </span>
            <ArrowDownRight className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-500 uppercase block">Lowest Recorded</span>
          <span className="text-base font-bold text-amber-600">{minScore}%</span>
        </div>
      </div>

      {/* SVG Trend Graph */}
      <div className="relative bg-slate-50 rounded border border-slate-200 p-3 h-48 flex flex-col justify-between">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
            Querying edge telemetry archive for {activeRange}...
          </div>
        ) : (
          <div className="w-full h-full flex flex-col justify-between">
            <div className="flex-1 w-full relative">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                {/* Guidelines */}
                <line x1="0" y1="25" x2="100" y2="25" stroke="#f43f5e" strokeDasharray="2,2" strokeWidth="0.5" />
                <line x1="0" y1="52" x2="100" y2="52" stroke="#f59e0b" strokeDasharray="2,2" strokeWidth="0.5" />
                <line x1="0" y1="80" x2="100" y2="80" stroke="#cbd5e1" strokeWidth="0.5" />

                {/* Health Curve (Cyan/Navy trace) */}
                <polyline
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={historyPoints
                    .map((pt, idx) => {
                      const x = (idx / (historyPoints.length - 1 || 1)) * 100;
                      const y = 92 - (pt.healthScore / 100) * 84;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />
              </svg>

              <div className="absolute top-1 left-1 text-[9px] font-mono text-emerald-600 font-semibold">
                Nominal Zone (&gt;78%)
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 left-1 text-[9px] font-mono text-amber-600 font-semibold">
                Warning Threshold (50-78%)
              </div>
              <div className="absolute bottom-1 left-1 text-[9px] font-mono text-rose-600 font-semibold">
                Critical Zone (&lt;50%)
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1.5 border-t border-slate-200">
              <span>{historyPoints[0]?.label || 'Start'}</span>
              <span>Timeline: {activeRange.toUpperCase()}</span>
              <span>{historyPoints[historyPoints.length - 1]?.label || 'Now'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
