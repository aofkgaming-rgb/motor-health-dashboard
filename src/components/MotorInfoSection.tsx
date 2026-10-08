import React from 'react';
import {
  Clock,
  Cpu,
  Layers,
  HardDrive,
} from 'lucide-react';
import { MotorInfo } from '../types';

interface MotorInfoSectionProps {
  info: MotorInfo;
}

export const MotorInfoSection: React.FC<MotorInfoSectionProps> = ({ info }) => {
  return (
    <div
      id="motor-info-section"
      className="rounded-lg bg-[#0F141C] border border-slate-800 p-4 text-slate-200"
    >
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-300">
            Motor Operational Telemetry & Sensor Integrity
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-500">
          Target: {info.model}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* RPM & Running Status */}
        <div className="bg-slate-900/90 rounded p-3 border border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Shaft Speed</span>
            <span className="text-emerald-400 font-semibold">{info.status}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-white">
              {info.currentRpm.toLocaleString()}
            </span>
            <span className="text-xs font-mono text-slate-400">RPM</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            Rated: {info.ratedRpm} RPM (Sync 50Hz)
          </div>
        </div>

        {/* Operating Time */}
        <div className="bg-slate-900/90 rounded p-3 border border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Operating Time</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-white">
              {info.operatingTimeHours}h {info.operatingTimeMinutes}m
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            Continuous Duty Cycle S1
          </div>
        </div>

        {/* Data Sampling Status */}
        <div className="bg-slate-900/90 rounded p-3 border border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sampling Engine</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-cyan-300">
              {(info.samplingRateHz / 1000).toFixed(0)} kHz
            </span>
            <span className="text-xs font-mono text-slate-400">Buffer</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            {info.fftWindowSize} pts FFT Window
          </div>
        </div>

        {/* Sensor 1 & 2 Integrity */}
        <div className="bg-slate-900/90 rounded p-3 border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">
            Sensor Channels
          </span>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Hall Effect (Jitter):</span>
              <span className="text-emerald-400 font-semibold text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800">
                {info.sensors.hallEffect}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Accelerometer:</span>
              <span className="text-emerald-400 font-semibold text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800">
                {info.sensors.accelerometer}
              </span>
            </div>
          </div>
        </div>

        {/* Sensor 3 & Edge Node */}
        <div className="bg-slate-900/90 rounded p-3 border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">
            Thermal & Edge Node
          </span>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">RTD Temperature:</span>
              <span className="text-emerald-400 font-semibold text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800">
                {info.sensors.tempProbe}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Edge Controller:</span>
              <span className="text-cyan-400 font-semibold text-[10px]">ESP32-S3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
