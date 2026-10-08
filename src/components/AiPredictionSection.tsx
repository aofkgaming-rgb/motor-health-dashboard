import React from 'react';
import { AiPredictionData, MotorSensorFeatures } from '../types';

interface AiPredictionSectionProps {
  aiData: AiPredictionData;
  features: MotorSensorFeatures;
}

export const AiPredictionSection: React.FC<AiPredictionSectionProps> = ({
  aiData,
  features,
}) => {
  const statusColor = {
    HEALTHY: {
      badge: 'bg-emerald-900/80 text-emerald-300 border border-emerald-700',
      bar: 'bg-emerald-400',
      text: 'text-emerald-400',
    },
    WARNING: {
      badge: 'bg-amber-900/80 text-amber-300 border border-amber-700',
      bar: 'bg-amber-400',
      text: 'text-amber-400',
    },
    CRITICAL: {
      badge: 'bg-rose-900/80 text-rose-300 border border-rose-700',
      bar: 'bg-rose-400',
      text: 'text-rose-400',
    },
  }[aiData.condition];

  return (
    <div className="bg-[#16202c] rounded-md border border-[#263548] text-white flex flex-col justify-between shadow-xs overflow-hidden">
      {/* Dark Card Header matching 1st Floor CT */}
      <div className="p-3 bg-[#1c2837] border-b border-[#263548] flex items-center justify-between">
        <div>
          <h4 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            <span>AI Health Prediction</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 border border-purple-700/50">
              Edge Classifier
            </span>
          </h4>
          <span className="text-[11px] text-slate-400 font-medium block">
            Multi-Feature Anomaly Inference & Confidence
          </span>
        </div>

        <div className="text-right">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${statusColor.badge}`}
          >
            {aiData.condition}
          </span>
        </div>
      </div>

      {/* Primary Status Strip */}
      <div className="grid grid-cols-3 gap-2 p-3 border-b border-[#223042] text-xs font-mono bg-[#141d27]">
        <div>
          <span className="text-[10px] text-slate-400 uppercase block">Health Score</span>
          <span className={`text-base font-bold ${statusColor.text}`}>
            {aiData.healthScore}%
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block">Confidence</span>
          <span className="text-base font-bold text-cyan-300">
            {aiData.confidence.toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block">Anomaly Match</span>
          <span className="text-xs font-bold text-slate-200 line-clamp-1">
            {aiData.anomalyDetected ? 'Spike / Drift' : 'Nominal'}
          </span>
        </div>
      </div>

      {/* Feature Contributions Ranked */}
      <div className="p-3 space-y-2 flex-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
          <span>Feature Weight Breakdown</span>
          <span>Impact</span>
        </div>

        {aiData.contributions.slice(0, 4).map((item, idx) => {
          const isCritical = item.status === 'CRITICAL';
          const isWarning = item.status === 'WARNING';
          const barColor = isCritical
            ? 'bg-rose-500'
            : isWarning
            ? 'bg-amber-400'
            : 'bg-emerald-400';

          return (
            <div key={item.featureKey} className="text-xs font-mono space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">{item.name}</span>
                <span className="text-slate-400">{item.importanceScore}%</span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-300`}
                  style={{ width: `${item.importanceScore}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend and Metadata at bottom matching screenshot */}
      <div className="p-2.5 bg-[#141d27] border-t border-[#263548] flex items-center justify-between text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#34d399]" /> Healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#fbbf24]" /> Warning
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#f87171]" /> Critical
          </span>
        </div>
        <span>Model: v2.3</span>
      </div>
    </div>
  );
};
