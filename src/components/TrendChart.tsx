import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clockTime, fmt } from '../lib/format';

export interface Series {
  key: string;
  label: string;
  color: string;
  points: [number, number | null][]; // [ts, value]
}

interface Props {
  series: Series[];
  height?: number;
  unit?: string;
  decimals?: number;
  refLines?: { y: number; label: string }[];
  yFloor?: number; // force the axis to include this value (e.g. 0)
  compact?: boolean; // sparkline: no axes, no tooltip
  showDate?: boolean;
  /** vertical markers, e.g. maintenance dates */
  markers?: { ts: number; label: string }[];
  ariaLabel: string;
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(10)));
  return { lo, hi, ticks, step };
}

export function TrendChart({
  series,
  height = 180,
  unit = '',
  decimals = 2,
  refLines = [],
  yFloor,
  compact = false,
  showDate = false,
  markers = [],
  ariaLabel,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const m = compact ? { t: 2, r: 2, b: 2, l: 2 } : { t: 10, r: 12, b: 22, l: 46 };
  const w = Math.max(0, width - m.l - m.r);
  const h = Math.max(0, height - m.t - m.b);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const vals = all.map((p) => p[1]).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!all.length || !vals.length) return null;
    const t0 = Math.min(...all.map((p) => p[0]));
    const t1 = Math.max(...all.map((p) => p[0]));
    let vmin = Math.min(...vals, ...refLines.map((r) => r.y));
    let vmax = Math.max(...vals, ...refLines.map((r) => r.y));
    if (yFloor !== undefined) {
      vmin = Math.min(vmin, yFloor);
      vmax = Math.max(vmax, yFloor);
    }
    const { lo, hi, ticks } = niceTicks(vmin, vmax, compact ? 2 : 4);
    const x = (t: number) => (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w);
    const y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * h;
    // break lines where data is missing or there is a time gap (> 3x the typical spacing)
    const paths = series.map((s) => {
      const pts = s.points;
      const gaps = pts.slice(1).map((p, i) => p[0] - pts[i][0]).sort((a, b) => a - b);
      const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      let d = '';
      let pen = false;
      pts.forEach((p, i) => {
        const gap = i > 0 && typical > 0 && p[0] - pts[i - 1][0] > typical * 3;
        if (p[1] === null || !Number.isFinite(p[1])) {
          pen = false;
          return;
        }
        d += `${!pen || gap ? 'M' : 'L'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`;
        pen = true;
      });
      return d;
    });
    const xTicks = [t0, t0 + (t1 - t0) / 2, t1];
    return { t0, t1, x, y, lo, hi, ticks, paths, xTicks };
  }, [series, w, h, refLines, yFloor, compact]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!geo || compact) return;
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const t = geo.t0 + (px / (w || 1)) * (geo.t1 - geo.t0);
    setHover(t);
  };

  const hoverInfo = useMemo(() => {
    if (hover === null || !geo) return null;
    const items = series.map((s) => {
      let best: [number, number | null] | null = null;
      let bd = Infinity;
      for (const p of s.points) {
        const d = Math.abs(p[0] - hover);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return { s, p: best };
    });
    const ts = items.find((i) => i.p)?.p?.[0];
    return ts === undefined ? null : { ts, items };
  }, [hover, geo, series]);

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      {!geo ? (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--muted)]">
          {compact ? '—' : 'No data in this range yet'}
        </div>
      ) : (
        width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            <g transform={`translate(${m.l},${m.t})`}>
              {!compact &&
                geo.ticks.map((t) => (
                  <g key={t}>
                    <line x1={0} x2={w} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--border)" />
                    <text x={-8} y={geo.y(t)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--muted)" className="num">
                      {Math.abs(t) >= 100 ? t.toFixed(0) : Number(t.toPrecision(3))}
                    </text>
                  </g>
                ))}
              {!compact &&
                geo.xTicks.map((t, i) => (
                  <text
                    key={i}
                    x={geo.x(t)}
                    y={h + 15}
                    textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                    fontSize={10.5}
                    fill="var(--muted)"
                    className="num"
                  >
                    {showDate
                      ? new Date(t).toLocaleString([], { hour: '2-digit', minute: '2-digit', hour12: false, day: '2-digit', month: 'short' })
                      : clockTime(t)}
                  </text>
                ))}
              {refLines.map((r) => (
                <g key={r.label}>
                  <line x1={0} x2={w} y1={geo.y(r.y)} y2={geo.y(r.y)} stroke="var(--text-2)" strokeDasharray="4 4" strokeWidth={1} />
                  {!compact && (
                    <text x={w} y={geo.y(r.y) - 4} textAnchor="end" fontSize={10.5} fill="var(--text-2)">
                      {r.label}
                    </text>
                  )}
                </g>
              ))}
              {!compact &&
                markers
                  .filter((mk) => mk.ts >= geo.t0 && mk.ts <= geo.t1)
                  .map((mk, i) => (
                    <g key={`mk${i}`}>
                      <line x1={geo.x(mk.ts)} x2={geo.x(mk.ts)} y1={0} y2={h} stroke="var(--series-3)" strokeDasharray="2 3" strokeWidth={1.5} />
                      <title>{mk.label}</title>
                      <path d={`M${geo.x(mk.ts)},-4 l4,4 l-4,4 l-4,-4 z`} fill="var(--series-3)" />
                    </g>
                  ))}
              {geo.paths.map((d, i) => (
                <path
                  key={series[i].key}
                  d={d}
                  fill="none"
                  stroke={series[i].color}
                  strokeWidth={compact ? 1.5 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {hoverInfo && (
                <g pointerEvents="none">
                  <line x1={geo.x(hoverInfo.ts)} x2={geo.x(hoverInfo.ts)} y1={0} y2={h} stroke="var(--border-strong)" />
                  {hoverInfo.items.map(
                    ({ s, p }) =>
                      p &&
                      p[1] !== null && (
                        <circle key={s.key} cx={geo.x(p[0])} cy={geo.y(p[1])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                      ),
                  )}
                </g>
              )}
              {!compact && (
                <rect
                  width={w}
                  height={h}
                  fill="transparent"
                  onPointerMove={onMove}
                  onPointerLeave={() => setHover(null)}
                  style={{ cursor: 'crosshair' }}
                />
              )}
            </g>
          </svg>
        )
      )}
      {hoverInfo && geo && (
        <div
          className="absolute pointer-events-none card px-2.5 py-1.5 text-[12px] z-10"
          style={{
            top: 4,
            left: Math.min(Math.max(m.l + geo.x(hoverInfo.ts) + 12, 0), Math.max(0, width - 170)),
          }}
        >
          <div className="text-[var(--muted)] num mb-0.5">
            {showDate
              ? new Date(hoverInfo.ts).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
              : clockTime(hoverInfo.ts)}
          </div>
          {hoverInfo.items.map(({ s, p }) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[var(--text)] num">
              {series.length > 1 && <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />}
              {series.length > 1 && <span className="text-[var(--text-2)]">{s.label}</span>}
              <span className="font-semibold">
                {fmt(p?.[1] ?? null, decimals)} {unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Pick<Series, 'key' | 'label' | 'color'>[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--text-2)]">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-[3px] rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
