import React, { useRef, useEffect } from 'react';
import { MotorTelemetryPoint } from '../types';

interface RevolutionJitterSectionProps {
  currentJitter: number;
  rpm: number;
  history: MotorTelemetryPoint[];
}

export const RevolutionJitterSection: React.FC<RevolutionJitterSectionProps> = ({
  currentJitter,
  rpm,
  history,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Calculate statistics from rolling history
  const recentJitterValues = history.slice(-30).map((h) => h.revolutionJitter);
  const avgJitter =
    recentJitterValues.length > 0
      ? recentJitterValues.reduce((a, b) => a + b, 0) / recentJitterValues.length
      : currentJitter;
  const maxJitter =
    recentJitterValues.length > 0 ? Math.max(...recentJitterValues) : currentJitter;

  // Condition evaluation
  const jitterCondition =
    currentJitter > 3.5 ? 'CRITICAL' : currentJitter > 1.5 ? 'WARNING' : 'HEALTHY';

  // Microsecond timing: 1 rev at nominal RPM
  const nominalPeriodUs = rpm > 0 ? Math.round((60 / rpm) * 1000000) : 33613;
  const periodDeltaUs = Math.round((currentJitter / 100) * nominalPeriodUs);

  // Draw dark oscilloscope waveform matching the CT cards in the screenshot
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Dark background matching screenshot CT cards
    ctx.fillStyle = '#16202c';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 15, right: 15, bottom: 20, left: 30 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (chartW <= 0 || chartH <= 0) return;

    // Grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#223042';
    ctx.setLineDash([2, 2]);

    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (i / 3) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      // Y labels
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      const val = (4.5 - (i / 3) * 4.5).toFixed(1);
      ctx.fillText(val, padding.left - 4, y + 3);
    }

    // Vertical time grid lines
    for (let j = 0; j <= 5; j++) {
      const x = padding.left + (j / 5) * chartW;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Plot traces
    const points = history.slice(-35);
    if (points.length >= 2) {
      // 1. Cyan Trace: Instantaneous Jitter
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, idx) => {
        const x = padding.left + (idx / (points.length - 1)) * chartW;
        const val = Math.min(5.0, p.revolutionJitter);
        const y = padding.top + chartH - (val / 5.0) * chartH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 2. Yellow/Amber Trace: Filtered Moving Average
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      points.forEach((p, idx) => {
        const x = padding.left + (idx / (points.length - 1)) * chartW;
        // Moving smooth val
        const val = Math.min(5.0, (p.revolutionJitter + avgJitter) / 2);
        const y = padding.top + chartH - (val / 5.0) * chartH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 3. Red Trace: Threshold / Transient Envelope
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      points.forEach((p, idx) => {
        const x = padding.left + (idx / (points.length - 1)) * chartW;
        const val = Math.min(5.0, p.revolutionJitter * 0.4 + 1.2);
        const y = padding.top + chartH - (val / 5.0) * chartH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [history, currentJitter, avgJitter]);

  return (
    <div className="bg-[#16202c] rounded-md border border-[#263548] text-white flex flex-col justify-between shadow-xs overflow-hidden">
      {/* Dark Card Header (like "Gnd Floor CT / Ground Floor Riser" in screenshot) */}
      <div className="p-3 bg-[#1c2837] border-b border-[#263548] flex items-center justify-between">
        <div>
          <h4 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            <span>Revolution Jitter Analyzer</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
              GPIO 4
            </span>
          </h4>
          <span className="text-[11px] text-slate-400 font-medium block">
            Hall-Effect Timer Interrupt (1 µs resolution)
          </span>
        </div>

        <div className="text-right">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
              jitterCondition === 'CRITICAL'
                ? 'bg-rose-900/80 text-rose-300 border border-rose-700'
                : jitterCondition === 'WARNING'
                ? 'bg-amber-900/80 text-amber-300 border border-amber-700'
                : 'bg-emerald-900/80 text-emerald-300 border border-emerald-700'
            }`}
          >
            {jitterCondition}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 p-3 border-b border-[#223042] text-xs font-mono bg-[#141d27]">
        <div>
          <span className="text-[10px] text-slate-400 uppercase block">Current Jitter</span>
          <span className="text-base font-bold text-cyan-300">{currentJitter.toFixed(2)}%</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block">Moving Avg</span>
          <span className="text-base font-bold text-amber-300">{avgJitter.toFixed(2)}%</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block">Period Delta</span>
          <span className="text-base font-bold text-slate-200">±{periodDeltaUs} µs</span>
        </div>
      </div>

      {/* Dark Waveform Canvas */}
      <div className="relative w-full h-40 bg-[#16202c]">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Legend at bottom matching screenshot */}
      <div className="p-2.5 bg-[#141d27] border-t border-[#263548] flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]" /> Current Jitter
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#eab308]" /> Avg Window
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Critical Limit
          </span>
        </div>
        <span>Europe/London</span>
      </div>
    </div>
  );
};
