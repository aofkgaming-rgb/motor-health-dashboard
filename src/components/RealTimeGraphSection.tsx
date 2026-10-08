import React, { useRef, useEffect, useState } from 'react';
import {
  Pause,
  Play,
  Sliders,
} from 'lucide-react';
import { MotorTelemetryPoint } from '../types';
import { FEATURE_THRESHOLDS } from '../utils/motorCalculations';

interface RealTimeGraphSectionProps {
  history: MotorTelemetryPoint[];
  isLive: boolean;
  onToggleLive: () => void;
}

type GraphChannel =
  | 'rmsVibration'
  | 'peakValue'
  | 'crestFactor'
  | 'kurtosis'
  | 'revolutionJitter'
  | 'temperatureRiseRate';

interface ChannelMetadata {
  key: GraphChannel;
  name: string;
  unit: string;
  color: string;
  defaultAxis: 'left' | 'right';
  min: number;
  max: number;
}

const AVAILABLE_CHANNELS: ChannelMetadata[] = [
  {
    key: 'rmsVibration',
    name: 'RMS Vibration',
    unit: 'mm/s',
    color: '#1e293b', // Dark slate blue (like Voltage in screenshot)
    defaultAxis: 'left',
    min: 0,
    max: 8.0,
  },
  {
    key: 'revolutionJitter',
    name: 'Revolution Jitter',
    unit: '%',
    color: '#16a34a', // Crisp Green (like Frequency in screenshot)
    defaultAxis: 'right',
    min: 0,
    max: 6.0,
  },
  {
    key: 'peakValue',
    name: 'Peak Value',
    unit: 'mm/s',
    color: '#0284c7', // Sky blue
    defaultAxis: 'left',
    min: 0,
    max: 12.0,
  },
  {
    key: 'kurtosis',
    name: 'Kurtosis',
    unit: 'ratio',
    color: '#7c3aed', // Purple
    defaultAxis: 'right',
    min: 1,
    max: 8.0,
  },
  {
    key: 'crestFactor',
    name: 'Crest Factor',
    unit: 'ratio',
    color: '#ea580c', // Orange
    defaultAxis: 'right',
    min: 1,
    max: 7.0,
  },
  {
    key: 'temperatureRiseRate',
    name: 'Temp Rise Rate',
    unit: '°C/min',
    color: '#dc2626', // Red
    defaultAxis: 'left',
    min: 0,
    max: 2.0,
  },
];

export const RealTimeGraphSection: React.FC<RealTimeGraphSectionProps> = ({
  history,
  isLive,
  onToggleLive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Selected channels: By default, match the 2 traces in the screenshot: Dark navy & Green
  const [selectedChannels, setSelectedChannels] = useState<GraphChannel[]>([
    'rmsVibration',
    'revolutionJitter',
  ]);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [timeWindowSec, setTimeWindowSec] = useState<number>(60);

  const toggleChannel = (key: GraphChannel) => {
    setSelectedChannels((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  // Canvas drawing loop
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

    // Background: Clean white matching screenshot
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 20, right: 45, bottom: 25, left: 45 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (chartW <= 0 || chartH <= 0) return;

    // Filter points within selected window
    const now = Date.now();
    const windowMs = timeWindowSec * 1000;
    const visiblePoints = history.filter((p) => p.timestamp >= now - windowMs);
    const dataToRender = visiblePoints.length > 0 ? visiblePoints : history.slice(-timeWindowSec);

    // Horizontal grid lines (4 divisions)
    const divisions = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#f1f5f9';
    ctx.setLineDash([2, 2]);

    for (let i = 0; i <= divisions; i++) {
      const y = padding.top + (i / divisions) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
    }

    // Vertical time grid lines
    const vDivisions = 6;
    for (let j = 0; j <= vDivisions; j++) {
      const x = padding.left + (j / vDivisions) * chartW;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartH);
      ctx.stroke();
    }
    ctx.setLineDash([]); // Reset line dash

    // Pink/Red dashed Warning Threshold Line (matching the screenshot's red dashed limit line)
    const thresholdY = padding.top + chartH * 0.22;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, thresholdY);
    ctx.lineTo(padding.left + chartW, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label for threshold
    ctx.fillStyle = '#f43f5e';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ISO Warning Limit', padding.left + chartW - 5, thresholdY - 4);

    // Draw Traces
    if (dataToRender.length >= 2) {
      selectedChannels.forEach((chKey, chIdx) => {
        const meta = AVAILABLE_CHANNELS.find((c) => c.key === chKey);
        if (!meta) return;

        // Min & max for this channel
        const values = dataToRender.map((d) => d[chKey] as number);
        const dataMin = Math.min(meta.min, Math.min(...values));
        const dataMax = Math.max(meta.max, Math.max(...values));
        const range = dataMax - dataMin || 1;

        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();

        dataToRender.forEach((point, idx) => {
          const x = padding.left + (idx / (dataToRender.length - 1)) * chartW;
          const val = point[chKey] as number;
          const y = padding.top + chartH - ((val - dataMin) / range) * chartH;

          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      });
    }

    // Y Axis labels (Left)
    const primaryMeta = AVAILABLE_CHANNELS.find((c) => c.key === selectedChannels[0]);
    if (primaryMeta) {
      ctx.fillStyle = primaryMeta.color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= divisions; i++) {
        const val = primaryMeta.max - (i / divisions) * (primaryMeta.max - primaryMeta.min);
        const y = padding.top + (i / divisions) * chartH + 3;
        ctx.fillText(val.toFixed(1), padding.left - 6, y);
      }
    }

    // Y Axis labels (Right)
    const secondaryMeta = AVAILABLE_CHANNELS.find((c) => c.key === selectedChannels[1]) || primaryMeta;
    if (secondaryMeta && selectedChannels.length > 1) {
      ctx.fillStyle = secondaryMeta.color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      for (let i = 0; i <= divisions; i++) {
        const val = secondaryMeta.max - (i / divisions) * (secondaryMeta.max - secondaryMeta.min);
        const y = padding.top + (i / divisions) * chartH + 3;
        ctx.fillText(val.toFixed(1), padding.left + chartW + 6, y);
      }
    }

    // X Axis Timestamps
    if (dataToRender.length > 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';

      for (let j = 0; j <= vDivisions; j++) {
        const idx = Math.min(
          dataToRender.length - 1,
          Math.floor((j / vDivisions) * (dataToRender.length - 1))
        );
        const pt = dataToRender[idx];
        if (pt) {
          const x = padding.left + (j / vDivisions) * chartW;
          const timeStr = new Date(pt.timestamp).toTimeString().split(' ')[0];
          ctx.fillText(timeStr, x, height - 8);
        }
      }
    }

    // Draw Crosshair on Hover
    if (hoverPos && hoverIndex !== null && dataToRender[hoverIndex]) {
      const x = padding.left + (hoverIndex / (dataToRender.length - 1)) * chartW;

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [history, selectedChannels, isLive, timeWindowSec, hoverIndex, hoverPos]);

  // Handle Mouse Move for Hover Inspector
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padding = { left: 45, right: 45 };
    const chartW = canvas.clientWidth - padding.left - padding.right;

    if (mouseX >= padding.left && mouseX <= padding.left + chartW) {
      const ratio = (mouseX - padding.left) / chartW;
      const dataLen = history.slice(-timeWindowSec).length;
      const idx = Math.min(dataLen - 1, Math.max(0, Math.round(ratio * (dataLen - 1))));
      setHoverIndex(idx);
      setHoverPos({ x: mouseX, y: mouseY });
    } else {
      setHoverIndex(null);
      setHoverPos(null);
    }
  };

  const hoveredPoint = hoverIndex !== null ? history.slice(-timeWindowSec)[hoverIndex] : null;

  return (
    <div className="bg-white rounded-md border border-[#d8e2ea] p-4 flex flex-col justify-between shadow-xs">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">
            Voltage and Frequency / Dynamic Sensor Waveforms
          </h3>
          <span className="text-[11px] text-slate-400 font-medium">
            Synchronized multi-channel telemetry with ISO-10816 threshold limit line
          </span>
        </div>

        {/* Controls: Time Window & Live Pause */}
        <div className="flex items-center gap-2">
          {/* Time Window Buttons */}
          <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 text-xs font-mono">
            {[30, 60, 120, 300].map((sec) => (
              <button
                key={sec}
                onClick={() => setTimeWindowSec(sec)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  timeWindowSec === sec
                    ? 'bg-white text-slate-800 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {sec < 60 ? `${sec}s` : `${sec / 60}m`}
              </button>
            ))}
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={onToggleLive}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold cursor-pointer border ${
              isLive
                ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}
          >
            {isLive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
            <span>{isLive ? 'Pause' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {/* Parameter Selection Chips */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
          <Sliders className="w-3 h-3" />
          Trace:
        </span>
        {AVAILABLE_CHANNELS.map((ch) => {
          const isSelected = selectedChannels.includes(ch.key);
          return (
            <button
              key={ch.key}
              onClick={() => toggleChannel(ch.key)}
              className={`text-xs px-2.5 py-1 rounded font-mono font-semibold cursor-pointer transition-all border flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-white text-slate-800 border-slate-400 shadow-xs'
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: isSelected ? ch.color : '#cbd5e1' }}
              />
              <span>{ch.name}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive HTML5 Canvas Waveform Area */}
      <div className="relative w-full h-64 border border-[#e2e8f0] rounded overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoverIndex(null);
            setHoverPos(null);
          }}
          className="w-full h-full cursor-crosshair block"
        />

        {/* Hover Inspector Tooltip */}
        {hoveredPoint && hoverPos && (
          <div
            className="absolute z-10 pointer-events-none bg-slate-900/90 text-white rounded p-2 text-xs font-mono shadow-md border border-slate-700"
            style={{
              left: Math.min(canvasRef.current?.clientWidth! - 160, Math.max(10, hoverPos.x + 12)),
              top: Math.min(canvasRef.current?.clientHeight! - 90, Math.max(10, hoverPos.y - 40)),
            }}
          >
            <div className="text-[10px] text-slate-400 border-b border-slate-800 pb-1 mb-1">
              Time: {new Date(hoveredPoint.timestamp).toLocaleTimeString()}
            </div>
            {selectedChannels.map((k) => {
              const meta = AVAILABLE_CHANNELS.find((c) => c.key === k);
              const val = hoveredPoint[k] as number;
              return (
                <div key={k} className="flex items-center justify-between gap-3 text-[11px]">
                  <span style={{ color: meta?.color }}>{meta?.name}:</span>
                  <span className="font-bold">
                    {val.toFixed(2)} {meta?.unit}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend and Footer metadata matching screenshot */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-4">
          {selectedChannels.map((chKey) => {
            const meta = AVAILABLE_CHANNELS.find((c) => c.key === chKey);
            return (
              <span key={chKey} className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rotate-45" style={{ backgroundColor: meta?.color }} />
                <span className="font-semibold text-slate-700">{meta?.name}</span>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>🕒 Live 1-sec push</span>
          <span>•</span>
          <span className="font-mono">Zone: Europe/London (ISO-10816)</span>
        </div>
      </div>
    </div>
  );
};
