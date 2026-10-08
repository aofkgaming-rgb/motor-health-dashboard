import React from 'react';
import { MotorTelemetryPoint } from '../types';

interface BarChartSectionProps {
  history: MotorTelemetryPoint[];
}

export const BarChartSection: React.FC<BarChartSectionProps> = ({ history }) => {
  // Aggregate recent buckets (or generate 12-14 realistic time bins matching the screenshot)
  const timeBins = [
    { time: '11:49:53', v1: 28, v2: 12, v3: 15 },
    { time: '11:53:11', v1: 275, v2: 440, v3: 345 },
    { time: '11:53:12', v1: 355, v2: 310, v3: 245 },
    { time: '11:53:14', v1: 170, v2: 240, v3: 205 },
    { time: '11:53:18', v1: 420, v2: 350, v3: 290 },
    { time: '11:58:09', v1: 325, v2: 225, v3: 360 },
    { time: '11:58:10', v1: 370, v2: 405, v3: 320 },
    { time: '12:00:07', v1: 260, v2: 310, v3: 315 },
    { time: '12:00:08', v1: 315, v2: 280, v3: 305 },
    { time: '12:04:38', v1: 165, v2: 260, v3: 400 },
    { time: '12:09:05', v1: 415, v2: 380, v3: 425 },
    { time: '12:19:38', v1: 315, v2: 235, v3: 360 },
    { time: '12:22:15', v1: 215, v2: 280, v3: 265 },
  ];

  const maxVal = 600;

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] p-4 flex flex-col justify-between shadow-xs">
      {/* Chart Title Bar */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">
            Harmonic Energy & Loss Distribution by Interval
          </h3>
          <span className="text-[11px] text-slate-400 font-medium">
            Multi-spectral torque ripple & stator core loss dissipation
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">kJ / cycle</span>
      </div>

      {/* SVG Bar Chart */}
      <div className="relative w-full h-56 my-1">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 540 180" preserveAspectRatio="none">
          {/* Horizontal Grid lines (at 0, 150, 300, 450, 600) */}
          {[0, 150, 300, 450, 600].map((val) => {
            const y = 160 - (val / maxVal) * 145;
            return (
              <g key={val}>
                <line
                  x1="35"
                  y1={y}
                  x2="530"
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <text
                  x="28"
                  y={y + 3}
                  fontSize="9"
                  fill="#94a3b8"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Render Cluster Bars */}
          {timeBins.map((bin, idx) => {
            const groupWidth = 34;
            const startX = 40 + idx * (485 / timeBins.length);
            const barW = 6.5;

            const h1 = (bin.v1 / maxVal) * 145;
            const h2 = (bin.v2 / maxVal) * 145;
            const h3 = (bin.v3 / maxVal) * 145;

            return (
              <g key={idx}>
                {/* Bar 1: Green */}
                <rect
                  x={startX}
                  y={160 - h1}
                  width={barW}
                  height={h1}
                  fill="#4ade80"
                  rx="1"
                />
                {/* Bar 2: Violet / Purple */}
                <rect
                  x={startX + barW + 1}
                  y={160 - h2}
                  width={barW}
                  height={h2}
                  fill="#7c3aed"
                  rx="1"
                />
                {/* Bar 3: Sky Blue */}
                <rect
                  x={startX + (barW + 1) * 2}
                  y={160 - h3}
                  width={barW}
                  height={h3}
                  fill="#38bdf8"
                  rx="1"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend and Time labels matching MobiusFlow */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#4ade80]" /> Stator Core Loss
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#7c3aed]" /> Jitter Mechanical Ripple
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#38bdf8]" /> Rotor Slip Drag
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>🕒 Live interval buffer</span>
          <span>•</span>
          <span className="font-mono">Motor ID: MTR-IND-415V</span>
        </div>
      </div>
    </div>
  );
};
