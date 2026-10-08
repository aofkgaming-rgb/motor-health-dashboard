import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';
import { MotorCondition, AiPredictionData } from '../types';

interface MainHealthCardProps {
  condition: MotorCondition;
  healthScore: number;
  aiData: AiPredictionData;
  rpm: number;
}

export const MainHealthCard: React.FC<MainHealthCardProps> = ({
  condition,
  healthScore,
  aiData,
  rpm,
}) => {
  // Determine industrial color schemes: Green (Healthy), Amber/Yellow (Warning), Red (Critical)
  const statusConfig = {
    HEALTHY: {
      label: 'HEALTHY',
      sublabel: 'Optimal Operating State',
      badgeBg: 'bg-emerald-950/80 border-emerald-500 text-emerald-300',
      icon: CheckCircle2,
      accentColor: '#10b981', // emerald-500
      strokeColor: '#22c55e',
      borderGlow: 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      cardBg: 'bg-gradient-to-b from-[#111c19] to-[#0d1416]',
      textAccent: 'text-emerald-400',
      scoreBar: 'bg-emerald-500',
    },
    WARNING: {
      label: 'WARNING',
      sublabel: 'Incipient Mechanical Irregularity',
      badgeBg: 'bg-amber-950/80 border-amber-500 text-amber-300',
      icon: AlertTriangle,
      accentColor: '#f59e0b', // amber-500
      strokeColor: '#f59e0b',
      borderGlow: 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]',
      cardBg: 'bg-gradient-to-b from-[#1f190e] to-[#14120e]',
      textAccent: 'text-amber-400',
      scoreBar: 'bg-amber-500',
    },
    CRITICAL: {
      label: 'CRITICAL',
      sublabel: 'Severe Anomaly — Action Required',
      badgeBg: 'bg-rose-950/80 border-rose-500 text-rose-300',
      icon: AlertOctagon,
      accentColor: '#ef4444', // red-500
      strokeColor: '#ef4444',
      borderGlow: 'border-rose-500/50 shadow-[0_0_25px_rgba(239,68,68,0.2)]',
      cardBg: 'bg-gradient-to-b from-[#221014] to-[#160c0f]',
      textAccent: 'text-rose-400',
      scoreBar: 'bg-rose-500',
    },
  }[condition];

  const StatusIcon = statusConfig.icon;

  // Circular gauge calculations for 0 - 100%
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  // Use a 270 degree arc (3/4 of a circle) for an industrial dial meter
  const strokeDashoffset = circumference - (healthScore / 100) * (circumference * 0.75);

  return (
    <div
      id="main-motor-health-card"
      className={`rounded-xl border p-5 md:p-6 text-slate-100 transition-all duration-300 ${statusConfig.borderGlow} ${statusConfig.cardBg}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Column: Condition Banner & Circular Industrial Gauge */}
        <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-center justify-center gap-4 text-center sm:text-left lg:text-center border-b lg:border-b-0 lg:border-r border-slate-800/80 pb-6 lg:pb-0 lg:pr-6">
          {/* Main Status Pill */}
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-mono tracking-wider uppercase text-slate-400 mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              Overall Condition
            </span>
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg border font-mono font-black text-lg sm:text-xl tracking-wider ${statusConfig.badgeBg}`}
            >
              <StatusIcon className="w-5 h-5 animate-pulse" />
              <span>{statusConfig.label}</span>
            </div>
            <span className="text-xs text-slate-400 font-mono mt-1">
              {statusConfig.sublabel}
            </span>
          </div>

          {/* Industrial Arc Gauge */}
          <div className="relative flex items-center justify-center mt-2">
            <svg className="w-40 h-40 transform -rotate-135" viewBox="0 0 160 160">
              {/* Background Track Arc */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#1e293b"
                strokeWidth="12"
                strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                strokeDashoffset="0"
                fill="none"
                strokeLinecap="round"
              />
              {/* Active Value Arc */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke={statusConfig.strokeColor}
                strokeWidth="12"
                strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                strokeDashoffset={strokeDashoffset}
                fill="none"
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </svg>

            {/* Central Score Readout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
                {healthScore}%
              </span>
              <span className="text-[11px] font-mono font-medium text-slate-400 uppercase tracking-wider">
                Health Score
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: AI ML Prediction, Diagnostic Details & Plain-Language Explanation */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
          {/* Top diagnostic header */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[11px] uppercase tracking-wide">
                  Edge AI ML Inference
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Confidence: <span className="text-emerald-400 font-semibold">{aiData.confidence.toFixed(1)}%</span>
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Shaft Speed: <span className="text-amber-400 font-semibold">{rpm} RPM</span>
              </div>
            </div>

            {/* AI Prediction Classification */}
            <div className="bg-slate-900/90 rounded-lg p-3.5 border border-slate-800">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wide mb-1">
                AI Prediction Diagnosis:
              </div>
              <div className={`text-base sm:text-lg font-bold font-mono ${statusConfig.textAccent}`}>
                {aiData.predictedClass}
              </div>
            </div>
          </div>

          {/* Simple Explanation of the Current Condition */}
          <div className="bg-[#0B0F15]/90 rounded-lg p-3.5 border border-slate-800/90">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 font-semibold mb-1.5">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Current Condition Explanation:</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
              {aiData.explanation}
            </p>
          </div>

          {/* Quick Model Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
            <div className="px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-800 text-slate-400">
              <span className="block text-[10px] text-slate-500 uppercase">Input Vectors</span>
              <span className="text-slate-200 font-medium">6 Sensor Features</span>
            </div>
            <div className="px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-800 text-slate-400">
              <span className="block text-[10px] text-slate-500 uppercase">Primary Metric</span>
              <span className="text-cyan-400 font-medium">Revolution Jitter</span>
            </div>
            <div className="px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-800 text-slate-400">
              <span className="block text-[10px] text-slate-500 uppercase">Inference Latency</span>
              <span className="text-slate-200 font-medium">~38 ms (ESP32)</span>
            </div>
            <div className="px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-800 text-slate-400">
              <span className="block text-[10px] text-slate-500 uppercase">ISO Standard</span>
              <span className="text-slate-200 font-medium">ISO 10816-3 Class II</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
