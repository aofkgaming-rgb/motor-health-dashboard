import React from 'react';
import {
  Wrench,
  Clock,
} from 'lucide-react';
import { MaintenanceRecommendation, MotorCondition } from '../types';

interface RecommendationsSectionProps {
  recommendations: MaintenanceRecommendation[];
  condition: MotorCondition;
}

export const RecommendationsSection: React.FC<RecommendationsSectionProps> = ({
  recommendations,
  condition,
}) => {
  const getPriorityBadge = (priority: MaintenanceRecommendation['priority']) => {
    switch (priority) {
      case 'URGENT':
        return {
          label: 'URGENT INTERVENTION',
          className: 'bg-rose-100 text-rose-700 border-rose-300',
        };
      case 'PLANNED':
        return {
          label: 'PLANNED ACTION',
          className: 'bg-amber-100 text-amber-700 border-amber-300',
        };
      default:
        return {
          label: 'ROUTINE MONITORING',
          className: 'bg-emerald-100 text-emerald-700 border-emerald-300',
        };
    }
  };

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] p-4 flex flex-col justify-between shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
            <Wrench className="w-4 h-4 text-cyan-600" />
            <span>Actionable Maintenance SOP & Predictive Recommendations</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-medium block">
            Prescriptive engineering guidance triggered by ISO tolerances and Edge ML classification
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-500">
          Status: <strong className="text-slate-800">{condition}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recommendations.map((rec) => {
          const badge = getPriorityBadge(rec.priority);

          return (
            <div
              key={rec.id}
              className="p-3 rounded bg-slate-50 border border-slate-200 text-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Window: <strong>{rec.estimatedWindow}</strong></span>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-slate-900 mb-1 font-sans">
                  {rec.title}
                </h4>
                <p className="text-[11px] text-slate-600 font-sans leading-relaxed mb-2">
                  {rec.description}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between font-mono text-[11px] text-slate-500">
                <span>Trigger: <strong className="text-cyan-700">{rec.triggerFeature}</strong></span>
                <span className="text-slate-700 font-semibold">{rec.actionItem}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
