import React from 'react';

interface AnalogGaugeProps {
  title: string;
  subtitle?: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  inverseThresholds?: boolean; // true if lower is worse (e.g. Health Score: 100 is best, <50 is critical)
  decimals?: number;
  timestampText?: string;
  statusLabel?: string;
  statusColor?: 'emerald' | 'amber' | 'rose';
}

export const AnalogGauge: React.FC<AnalogGaugeProps> = ({
  title,
  subtitle = 'Latest',
  value,
  min,
  max,
  unit,
  warningThreshold,
  criticalThreshold,
  inverseThresholds = false,
  decimals = 2,
  timestampText = 'Live telemetry',
  statusLabel,
  statusColor = 'emerald',
}) => {
  // Clamp value
  const clampedVal = Math.max(min, Math.min(max, value));
  // Normalize to 0 - 1
  const ratio = (clampedVal - min) / (max - min || 1);

  // Gauge angle: starts at -135deg (left bottom) to +135deg (right bottom) = 270 deg span
  const startAngle = -135;
  const endAngle = 135;
  const totalAngle = 270;
  const needleAngle = startAngle + ratio * totalAngle;

  // Arc path generator
  const radius = 68;
  const cx = 95;
  const cy = 95;

  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, r: number, startA: number, endA: number) => {
    const start = polarToCartesian(x, y, r, endA);
    const end = polarToCartesian(x, y, r, startA);
    const largeArcFlag = endA - startA <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  // Divide into 3 colored arc segments like the MobiusFlow gauges: Green, Amber, Red
  let greenArc = '';
  let amberArc = '';
  let redArc = '';

  if (inverseThresholds) {
    // 100 to 78 = Green, 78 to 50 = Amber, 50 to 0 = Red
    const critA = startAngle + (1 - (criticalThreshold ?? 50) / 100) * totalAngle;
    const warnA = startAngle + (1 - (warningThreshold ?? 78) / 100) * totalAngle;
    redArc = describeArc(cx, cy, radius, startAngle, startAngle + 0.35 * totalAngle);
    amberArc = describeArc(cx, cy, radius, startAngle + 0.35 * totalAngle, startAngle + 0.65 * totalAngle);
    greenArc = describeArc(cx, cy, radius, startAngle + 0.65 * totalAngle, endAngle);
  } else {
    // Standard: lower is green, then amber, then red
    greenArc = describeArc(cx, cy, radius, startAngle, startAngle + 0.55 * totalAngle);
    amberArc = describeArc(cx, cy, radius, startAngle + 0.55 * totalAngle, startAngle + 0.8 * totalAngle);
    redArc = describeArc(cx, cy, radius, startAngle + 0.8 * totalAngle, endAngle);
  }

  // Ticks at 4 divisions
  const tickAngles = [startAngle, startAngle + totalAngle * 0.33, startAngle + totalAngle * 0.66, endAngle];

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] p-4 flex flex-col justify-between shadow-xs">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h3>
          <span className="text-[11px] text-slate-400 font-medium block">{subtitle}</span>
        </div>
        {statusLabel && (
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
              statusColor === 'rose'
                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                : statusColor === 'amber'
                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {/* SVG Dial Gauge */}
      <div className="relative flex items-center justify-center my-1">
        <svg width="190" height="155" viewBox="0 0 190 160" className="overflow-visible">
          {/* Background Track Arc */}
          <path
            d={describeArc(cx, cy, radius, startAngle, endAngle)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Green Zone Arc */}
          <path
            d={greenArc}
            fill="none"
            stroke="#22c55e"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Amber Zone Arc */}
          <path
            d={amberArc}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="8"
          />

          {/* Red Zone Arc */}
          <path
            d={redArc}
            fill="none"
            stroke="#ef4444"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Ticks and mini labels */}
          {tickAngles.map((angle, idx) => {
            const tickInner = polarToCartesian(cx, cy, radius - 14, angle);
            const tickOuter = polarToCartesian(cx, cy, radius - 6, angle);
            const labelPos = polarToCartesian(cx, cy, radius - 24, angle);
            const tickVal = (min + (idx / 3) * (max - min)).toFixed(decimals > 0 ? 0 : 0);

            return (
              <g key={idx}>
                <line
                  x1={tickInner.x}
                  y1={tickInner.y}
                  x2={tickOuter.x}
                  y2={tickOuter.y}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y + 3}
                  fontSize="9"
                  fill="#64748b"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {tickVal}
                </text>
              </g>
            );
          })}

          {/* Center Pivot Point */}
          <circle cx={cx} cy={cy} r="6" fill="#1e293b" />
          <circle cx={cx} cy={cy} r="3" fill="#ffffff" />

          {/* Pointer Needle */}
          <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`}>
            {/* Needle line */}
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy - radius + 8}
              stroke="#1e3a5f"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Sharp needle tip */}
            <polygon
              points={`${cx - 3},${cy} ${cx + 3},${cy} ${cx},${cy - radius + 2}`}
              fill="#1e3a5f"
            />
          </g>
        </svg>
      </div>

      {/* Numerical Value Readout */}
      <div className="text-center pt-1 border-t border-slate-100">
        <div className="text-2xl font-extrabold text-slate-800 font-mono tracking-tight">
          {value.toFixed(decimals)} <span className="text-xs font-semibold text-slate-500 font-sans">{unit}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
          <span>🕒 {timestampText}</span>
          <span className="font-mono text-[10px] uppercase text-slate-500 font-medium">
            Min {min} / Max {max}
          </span>
        </div>
      </div>
    </div>
  );
};
