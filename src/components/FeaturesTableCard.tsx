import React from 'react';
import { MotorSensorFeatures, MotorCondition } from '../types';
import { FEATURE_THRESHOLDS, getFeatureCondition } from '../utils/motorCalculations';

interface FeaturesTableCardProps {
  features: MotorSensorFeatures;
  timestampText?: string;
}

export const FeaturesTableCard: React.FC<FeaturesTableCardProps> = ({
  features,
  timestampText = 'Live telemetry',
}) => {
  const rows = [
    {
      key: 'revolutionJitter',
      name: 'Revolution Jitter',
      sensor: 'Hall-Effect Shaft Sensor (GPIO 4)',
      value: `${features.revolutionJitter.toFixed(2)} %`,
      status: getFeatureCondition('revolutionJitter', features.revolutionJitter),
      limit: '< 1.5 %',
      isPrimary: true,
    },
    {
      key: 'rmsVibration',
      name: 'RMS Vibration',
      sensor: '3-Axis Accel (Bearing Drive End)',
      value: `${features.rmsVibration.toFixed(2)} mm/s`,
      status: getFeatureCondition('rmsVibration', features.rmsVibration),
      limit: '< 2.8 mm/s',
      isPrimary: false,
    },
    {
      key: 'peakValue',
      name: 'Peak Value',
      sensor: '3-Axis Accel (Instantaneous Max)',
      value: `${features.peakValue.toFixed(2)} mm/s`,
      status: getFeatureCondition('peakValue', features.peakValue),
      limit: '< 5.5 mm/s',
      isPrimary: false,
    },
    {
      key: 'crestFactor',
      name: 'Crest Factor',
      sensor: 'Peak / RMS Ratio (Spall Impacts)',
      value: `${features.crestFactor.toFixed(2)}`,
      status: getFeatureCondition('crestFactor', features.crestFactor),
      limit: '< 4.2',
      isPrimary: false,
    },
    {
      key: 'kurtosis',
      name: 'Kurtosis',
      sensor: 'Peakedness (Gaussian ~3.0)',
      value: `${features.kurtosis.toFixed(2)}`,
      status: getFeatureCondition('kurtosis', features.kurtosis),
      limit: '< 4.0',
      isPrimary: false,
    },
    {
      key: 'temperatureRiseRate',
      name: 'Temp Rise Rate',
      sensor: 'RTD Core Probe (Rolling 60s)',
      value: `${features.temperatureRiseRate.toFixed(2)} °C/min`,
      status: getFeatureCondition('temperatureRiseRate', features.temperatureRiseRate),
      limit: '< 0.65 °C/min',
      isPrimary: false,
    },
  ];

  const getStatusBadge = (status: MotorCondition) => {
    switch (status) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-100 text-rose-700 border border-rose-200">
            CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-100 text-amber-700 border border-amber-200">
            WARNING
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-100 text-emerald-700 border border-emerald-200">
            NORMAL
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] flex flex-col justify-between shadow-xs overflow-hidden">
      <div>
        {/* Table Title Bar */}
        <div className="p-3 bg-white border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">
              Motor Condition Features (ISO 10816-3)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              Edge AI feature extraction matrix across 6 input dimensions
            </span>
          </div>
          <span className="text-[11px] font-mono text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200 font-semibold">
            6 Parameters Active
          </span>
        </div>

        {/* Table styled exactly like MobiusFlow screenshot */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#2c3b4d] text-white font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-3">Parameter Name</th>
                <th className="py-2.5 px-3">Sensor Source</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Live Reading</th>
                <th className="py-2.5 px-3 text-right">Nominal Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] text-slate-700">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`hover:bg-slate-50 transition-colors ${
                    row.isPrimary ? 'bg-cyan-50/40 font-medium' : ''
                  }`}
                >
                  <td className="py-2 px-3 font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>{row.name}</span>
                    {row.isPrimary && (
                      <span className="text-[9px] bg-cyan-700 text-white font-bold px-1 rounded uppercase">
                        Key
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-[11px] text-slate-500">{row.sensor}</td>
                  <td className="py-2 px-3">{getStatusBadge(row.status)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                    {row.value}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500 text-[11px]">
                    {row.limit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-2.5 bg-slate-50 border-t border-[#e2e8f0] flex items-center justify-between text-[11px] text-slate-400">
        <span>🕒 {timestampText}</span>
        <span className="font-mono text-slate-500 text-[10px]">Edge Inference Rate: 50 ms</span>
      </div>
    </div>
  );
};
