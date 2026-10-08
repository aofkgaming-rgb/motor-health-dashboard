import React from 'react';
import {
  Activity,
  Zap,
  Radio,
  BarChart2,
  RotateCw,
  ThermometerSnowflake,
  TrendingUp,
} from 'lucide-react';
import { MotorSensorFeatures, MotorCondition } from '../types';
import { FEATURE_THRESHOLDS, getFeatureCondition } from '../utils/motorCalculations';

interface SensorFeatureCardsProps {
  features: MotorSensorFeatures;
  history: {
    rmsVibration: number;
    peakValue: number;
    crestFactor: number;
    kurtosis: number;
    revolutionJitter: number;
    temperatureRiseRate: number;
  }[];
}

// Mini SVG Sparkline Component
const MiniSparkline: React.FC<{
  data: number[];
  color: string;
  min?: number;
  max?: number;
}> = ({ data, color, min, max }) => {
  if (!data || data.length < 2) {
    return <div className="h-8 flex items-center justify-center text-[10px] text-slate-600">Gathering...</div>;
  }

  const values = data.slice(-20); // last 20 samples
  const actualMin = min !== undefined ? min : Math.min(...values);
  const actualMax = max !== undefined ? max : Math.max(...values);
  const range = actualMax - actualMin || 1;

  const width = 120;
  const height = 32;
  const padding = 2;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((v - actualMin) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="w-full h-8 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

export const SensorFeatureCards: React.FC<SensorFeatureCardsProps> = ({
  features,
  history,
}) => {
  // Extract history series for the sparklines
  const rmsSeries = history.map((h) => h.rmsVibration);
  const peakSeries = history.map((h) => h.peakValue);
  const crestSeries = history.map((h) => h.crestFactor);
  const kurtSeries = history.map((h) => h.kurtosis);
  const jitterSeries = history.map((h) => h.revolutionJitter);
  const tempSeries = history.map((h) => h.temperatureRiseRate);

  // Status visual mapping helper
  const getStatusBadge = (status: MotorCondition) => {
    switch (status) {
      case 'CRITICAL':
        return {
          label: 'CRITICAL',
          badgeClass: 'bg-rose-950/80 text-rose-400 border border-rose-700/80',
          dotClass: 'bg-rose-500',
          colorHex: '#ef4444',
        };
      case 'WARNING':
        return {
          label: 'WARNING',
          badgeClass: 'bg-amber-950/80 text-amber-400 border border-amber-700/80',
          dotClass: 'bg-amber-500',
          colorHex: '#f59e0b',
        };
      default:
        return {
          label: 'NORMAL',
          badgeClass: 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/80',
          dotClass: 'bg-emerald-500',
          colorHex: '#22c55e',
        };
    }
  };

  const cardsData = [
    {
      id: 'rmsVibration',
      name: 'RMS VIBRATION',
      unit: 'mm/s',
      value: features.rmsVibration.toFixed(2),
      status: getFeatureCondition('rmsVibration', features.rmsVibration),
      threshold: FEATURE_THRESHOLDS.rmsVibration.normalRange,
      desc: 'ISO 10816 velocity severity',
      icon: Activity,
      trendData: rmsSeries,
      isPrimary: false,
    },
    {
      id: 'peakValue',
      name: 'PEAK VALUE',
      unit: 'mm/s',
      value: features.peakValue.toFixed(2),
      status: getFeatureCondition('peakValue', features.peakValue),
      threshold: FEATURE_THRESHOLDS.peakValue.normalRange,
      desc: 'Peak vibration amplitude',
      icon: Zap,
      trendData: peakSeries,
      isPrimary: false,
    },
    {
      id: 'crestFactor',
      name: 'CREST FACTOR',
      unit: 'ratio',
      value: features.crestFactor.toFixed(2),
      status: getFeatureCondition('crestFactor', features.crestFactor),
      threshold: FEATURE_THRESHOLDS.crestFactor.normalRange,
      desc: 'Peak / RMS ratio (impact flaking)',
      icon: TrendingUp,
      trendData: crestSeries,
      isPrimary: false,
    },
    {
      id: 'kurtosis',
      name: 'KURTOSIS',
      unit: 'dimless',
      value: features.kurtosis.toFixed(2),
      status: getFeatureCondition('kurtosis', features.kurtosis),
      threshold: FEATURE_THRESHOLDS.kurtosis.normalRange,
      desc: 'Peakedness (Gaussian ~3.0)',
      icon: BarChart2,
      trendData: kurtSeries,
      isPrimary: false,
    },
    {
      id: 'revolutionJitter',
      name: 'REVOLUTION JITTER',
      unit: '%',
      value: features.revolutionJitter.toFixed(2),
      status: getFeatureCondition('revolutionJitter', features.revolutionJitter),
      threshold: FEATURE_THRESHOLDS.revolutionJitter.normalRange,
      desc: 'Rotational period variation',
      icon: RotateCw,
      trendData: jitterSeries,
      isPrimary: true, // Key project feature
    },
    {
      id: 'temperatureRiseRate',
      name: 'TEMP RISE RATE',
      unit: '°C/min',
      value: features.temperatureRiseRate.toFixed(2),
      status: getFeatureCondition('temperatureRiseRate', features.temperatureRiseRate),
      threshold: FEATURE_THRESHOLDS.temperatureRiseRate.normalRange,
      desc: 'Rolling thermal derivative',
      icon: ThermometerSnowflake,
      trendData: tempSeries,
      isPrimary: false,
    },
  ];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold font-mono tracking-wider text-slate-200 uppercase">
            Live Sensor Readings — 6 ML Input Features
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Model Inputs
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono hidden sm:inline">
          Continuous Feature Extraction @ 10 kHz
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cardsData.map((card) => {
          const badge = getStatusBadge(card.status);
          const Icon = card.icon;

          return (
            <div
              key={card.id}
              id={`card-${card.id}`}
              className={`rounded-lg bg-[#0F141C] border p-4 transition-all duration-200 ${
                card.isPrimary
                  ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Card Header: Name, Icon & Status Pill */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center ${
                      card.isPrimary
                        ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-800'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold font-mono text-slate-200">
                        {card.name}
                      </span>
                      {card.isPrimary && (
                        <span className="text-[9px] font-mono px-1 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700 font-semibold uppercase">
                          Key Feature
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      {card.desc}
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold ${badge.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                  <span>{badge.label}</span>
                </div>
              </div>

              {/* Value and Unit */}
              <div className="flex items-baseline justify-between mt-3 mb-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black font-mono tracking-tight text-white">
                    {card.value}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{card.unit}</span>
                </div>

                {/* Normal Baseline */}
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block font-mono">Nominal:</span>
                  <span className="text-[11px] font-mono text-slate-300">{card.threshold}</span>
                </div>
              </div>

              {/* Trend Graph Sparkline */}
              <div className="mt-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                  <span>Recent Trend</span>
                  <span>Rolling 20s</span>
                </div>
                <MiniSparkline data={card.trendData} color={badge.colorHex} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
