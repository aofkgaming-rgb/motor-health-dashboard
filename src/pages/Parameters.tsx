import React, { useMemo, useState } from 'react';
import type { AuthUser, PublicConfig, ServerState, TelemetryRow } from '../types';
import { dayKey } from '../shared/settings';
import { Card, InfoBlock, SeverityBadge } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { fmt } from '../lib/format';
import { RANGES, RangeKey, resolutionText, useSeries } from '../lib/useHistory';
import { allViews, limitLines, ParamView, useMaintenanceMarkers } from '../lib/params';
import { limitSeverity } from '../shared/settings';
import { featureSeverity, isStale } from './Overview';
import { can } from '../lib/access';

const PARAM_RANGES: RangeKey[] = ['15m', '24h', '7d', '30d'];

/** Mean, lowest and highest value per calendar day (from the chart rows, which are already averaged). */
function dailySummary(rows: TelemetryRow[], v: ParamView, tz: number) {
  const m = new Map<string, { s: number; n: number; lo: number; hi: number }>();
  for (const r of rows) {
    const x = v.get(r);
    if (x === null || !Number.isFinite(x)) continue;
    const d = dayKey(r.ts, tz);
    const e = m.get(d) || { s: 0, n: 0, lo: Infinity, hi: -Infinity };
    e.s += x;
    e.n++;
    e.lo = Math.min(e.lo, x);
    e.hi = Math.max(e.hi, x);
    m.set(d, e);
  }
  return [...m.entries()].map(([day, e]) => ({ day, mean: e.s / e.n, lo: e.lo, hi: e.hi }));
}

export function Parameters({
  token,
  user,
  rows,
  latest,
  state,
  config,
  selected,
  onSelect,
  maintenanceTick,
}: {
  token: string;
  user: AuthUser;
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  state: ServerState | null;
  config: PublicConfig | null;
  selected: string;
  onSelect: (k: string) => void;
  maintenanceTick: number;
}) {
  const longOk = can(user, 'history.long');
  const [range, setRange] = useState<RangeKey>('15m');
  const r = RANGES.find((x) => x.key === range)!;
  const series = useSeries(token, state?.activeSource, r.ms, range !== '15m', maintenanceTick);
  const data = range === '15m' ? rows : series.rows;
  const views = allViews(config);
  const p = views.find((x) => x.key === selected) ?? views[0];
  const stale = isStale(state);
  const zWarn = state?.thresholds.zWarn ?? 3;
  const zCrit = state?.thresholds.zCrit ?? 5;
  const hasZ = p.feature && data.some((row) => (row.z as any)?.[p.key] !== undefined);
  const showDate = r.ms > 6 * 3600e3;
  const tz = config?.tzOffsetMin ?? 330;
  const markersRaw = useMaintenanceMarkers(token, maintenanceTick);
  const markers = showDate ? markersRaw.map((m) => ({ ts: Date.parse(`${m.date}T12:00:00Z`) - tz * 60000, label: `Maintenance ${m.date}: ${m.type}` })) : [];
  const daily = useMemo(() => (r.long ? dailySummary(data, p, tz).slice(-31) : []), [data, p, tz, r.long]);
  const dMax = daily.length ? Math.max(...daily.map((d) => d.hi)) : 1;
  const dMin = daily.length ? Math.min(...daily.map((d) => d.lo)) : 0;
  const now0 = Date.now();
  const markersInView = markers.filter((mk) => mk.ts >= now0 - r.ms);

  const groups: [string, ParamView[]][] = [
    ['Health features', views.filter((v) => v.feature)],
    ['Operating values', views.filter((v) => !v.feature && !v.custom)],
    ['Custom parameters', views.filter((v) => v.custom)],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
      <nav aria-label="Parameters" className="card overflow-hidden">
        {groups
          .filter(([, list]) => list.length)
          .map(([title, list]) => (
            <div key={title}>
              <div className="eyebrow px-4 pt-3 pb-1.5 bg-[var(--surface-2)] border-b border-[var(--border)]">{title}</div>
              <ul className="divide-y divide-[var(--border)]">
                {list.map((x) => {
                  const active = x.key === p.key;
                  const v = latest ? x.get(latest) : null;
                  const ls = limitSeverity(v, x.limits);
                  return (
                    <li key={x.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(x.key)}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer border-l-[3px] ${
                          active ? 'bg-[var(--accent-soft)] border-[var(--accent)]' : 'border-transparent hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-[var(--text)]">{x.name}</span>
                          <span className="block text-[12.5px] text-[var(--text-2)] num">
                            {fmt(v, x.decimals)} {x.unit !== '—' ? x.unit : ''}
                          </span>
                        </span>
                        {x.feature ? (
                          <SeverityBadge severity={featureSeverity(latest, x.key)} />
                        ) : ls ? (
                          <SeverityBadge severity={ls} />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </nav>

      <div className="space-y-4 min-w-0">
        <Card
          title={p.name}
          info={p.info}
          actions={
            <div className="seg" role="group" aria-label="Time range">
              {PARAM_RANGES.map((k) => {
                const x = RANGES.find((y) => y.key === k)!;
                const blocked = x.long && !longOk;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={range === k}
                    disabled={blocked}
                    title={blocked ? 'Your role can view up to 24 hours. Ask the admin for longer trends.' : undefined}
                    onClick={() => setRange(k)}
                    className={blocked ? 'opacity-50 cursor-not-allowed' : ''}
                  >
                    {x.label}
                  </button>
                );
              })}
            </div>
          }
        >
          <div className={`flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-3 ${stale ? 'opacity-60' : ''}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-semibold tracking-tight num">{fmt(latest ? p.get(latest) : null, p.decimals)}</span>
              <span className="text-[13px] text-[var(--muted)]">{p.unit !== '—' ? p.unit : ''}</span>
            </div>
            {p.feature && <SeverityBadge severity={featureSeverity(latest, p.key)} size="md" />}
            {(latest?.z as any)?.[p.key] !== undefined && (
              <span className="text-[13px] text-[var(--text-2)] num">z = {fmt((latest!.z as any)[p.key], 2)}</span>
            )}
            <span className="text-[12px] text-[var(--muted)] ml-auto">
              {range === '15m' ? 'every row' : series.loading && !series.rows.length ? 'Loading…' : resolutionText(series.tier, series.bucketMs)}
            </span>
          </div>
          {range !== '15m' && series.error && <p className="text-[12.5px] text-[#a82626] mb-2">{series.error}</p>}
          <TrendChart
            height={240}
            unit={p.unit !== '—' ? p.unit : ''}
            decimals={p.decimals}
            showDate={showDate}
            refLines={limitLines(p.limits)}
            markers={markers}
            ariaLabel={`${p.name} trend over ${r.label}`}
            series={[{ key: p.key, label: p.name, color: 'var(--series-1)', points: data.map((row) => [row.ts, p.get(row)]) }]}
          />
          <p className="text-[12px] text-[var(--muted)] mt-2">
            {limitLines(p.limits).length ? 'Dashed lines: limits set by the admin. ' : ''}
            {markersInView.length ? 'Green dashed lines: maintenance dates. ' : ''}
            {r.long ? 'Long ranges are averaged per bucket so they stay readable; exports keep the measured rows.' : ''}
          </p>
        </Card>

        {r.long && (
          <Card title={`Day by day — last ${r.label}`}>
            {daily.length ? (
              <div className="overflow-x-auto">
                <table className="table num">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Mean</th>
                      <th>Lowest</th>
                      <th>Highest</th>
                      <th className="w-[40%]">Range (lowest – highest)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily
                      .slice()
                      .reverse()
                      .map((d) => {
                        const span = dMax - dMin || 1;
                        const l = ((d.lo - dMin) / span) * 100;
                        const w = Math.max(1, ((d.hi - d.lo) / span) * 100);
                        const m = ((d.mean - dMin) / span) * 100;
                        const hasMaint = markersRaw.some((mk) => mk.date === d.day);
                        return (
                          <tr key={d.day}>
                            <td className="whitespace-nowrap">
                              {new Date(`${d.day}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })}
                              {hasMaint && <span className="ml-1.5 text-[11px] text-[var(--series-3)] font-medium">maintenance</span>}
                            </td>
                            <td>{fmt(d.mean, p.decimals)}</td>
                            <td>{fmt(d.lo, p.decimals)}</td>
                            <td>{fmt(d.hi, p.decimals)}</td>
                            <td>
                              <div className="relative h-2.5 rounded-full bg-[var(--none-soft)]" aria-hidden>
                                <div className="absolute h-full rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]" style={{ left: `${l}%`, width: `${w}%` }} />
                                <div className="absolute top-[-2px] h-[14px] w-[2px] bg-[var(--accent-ink)]" style={{ left: `${m}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <p className="text-[12px] text-[var(--muted)] mt-2">
                  From the averaged chart points ({resolutionText(series.tier, series.bucketMs)}), so a very short spike may not show as the highest
                  value. The vertical tick is the daily mean.
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-[var(--text-2)]">No data in this period yet.</p>
            )}
          </Card>
        )}

        {p.feature && (
          <Card title="Deviation from healthy baseline (z-score)">
            {hasZ ? (
              <>
                <TrendChart
                  height={160}
                  decimals={2}
                  showDate={showDate}
                  yFloor={0}
                  markers={markers}
                  refLines={[
                    { y: zWarn, label: `warning ${zWarn}` },
                    { y: zCrit, label: `critical ${zCrit}` },
                  ]}
                  ariaLabel={`${p.name} z-score trend`}
                  series={[
                    {
                      key: 'z',
                      label: 'z',
                      color: 'var(--series-1)',
                      points: data.map((row) => [row.ts, (row.z as any)?.[p.key] !== undefined ? Math.abs((row.z as any)[p.key]) : null]),
                    },
                  ]}
                />
                <p className="text-[12px] text-[var(--muted)] mt-2">
                  |z| against this motor’s own healthy statistics. Dashed lines are the project thresholds{r.long ? '; long ranges show the largest |z| in each bucket' : ''}.
                </p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-2)]">
                The device has not sent z-scores for this parameter. They appear after the 2-hour healthy calibration run.
              </p>
            )}
          </Card>
        )}

        <Card title={`About: ${p.name}`}>
          <InfoBlock content={p.info} />
        </Card>
      </div>
    </div>
  );
}
