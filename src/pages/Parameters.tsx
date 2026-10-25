import React, { useState } from 'react';
import type { ServerState, TelemetryRow } from '../types';
import type { FeatureKey } from '../shared/contract';
import { PARAMS } from '../content/info';
import { Card, InfoBlock, SeverityBadge } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { fmt } from '../lib/format';
import { useHistory } from '../lib/useHistory';
import { featureSeverity, isStale } from './Overview';

export function Parameters({
  token,
  rows,
  latest,
  state,
  selected,
  onSelect,
}: {
  token: string;
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  state: ServerState | null;
  selected: FeatureKey;
  onSelect: (k: FeatureKey) => void;
}) {
  const [range, setRange] = useState<'live' | 'day'>('live');
  const hist = useHistory(token, state?.activeSource, range === 'day');
  const data = range === 'live' ? rows : hist.rows;
  const p = PARAMS.find((x) => x.key === selected)!;
  const stale = isStale(state);
  const zWarn = state?.thresholds.zWarn ?? 3;
  const zCrit = state?.thresholds.zCrit ?? 5;
  const hasZ = data.some((r) => r.z?.[selected] !== undefined);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
      {/* List of the six parameters */}
      <nav aria-label="Parameters" className="card overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {PARAMS.map((x) => {
            const active = x.key === selected;
            return (
              <li key={x.key}>
                <button
                  type="button"
                  onClick={() => onSelect(x.key)}
                  aria-current={active ? 'true' : undefined}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 cursor-pointer border-l-[3px] ${
                    active ? 'bg-[var(--accent-soft)] border-[var(--accent)]' : 'border-transparent hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[var(--text)]">{x.name}</span>
                    <span className="block text-[12.5px] text-[var(--text-2)] num">
                      {fmt(latest?.[x.key] ?? null, x.decimals)} {x.unit !== '—' ? x.unit : ''}
                    </span>
                  </span>
                  <SeverityBadge severity={featureSeverity(latest, x.key)} />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Detail of the selected parameter */}
      <div className="space-y-4 min-w-0">
        <Card
          title={p.name}
          actions={
            <div className="seg" role="group" aria-label="Time range">
              <button type="button" aria-pressed={range === 'live'} onClick={() => setRange('live')}>
                Last 15 min · every row
              </button>
              <button type="button" aria-pressed={range === 'day'} onClick={() => setRange('day')}>
                24 h · 10 s steps
              </button>
            </div>
          }
        >
          <div className={`flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-3 ${stale ? 'opacity-60' : ''}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-semibold tracking-tight num">{fmt(latest?.[selected] ?? null, p.decimals)}</span>
              <span className="text-[13px] text-[var(--muted)]">{p.unit !== '—' ? p.unit : ''}</span>
            </div>
            <SeverityBadge severity={featureSeverity(latest, selected)} size="md" />
            {latest?.z?.[selected] !== undefined && (
              <span className="text-[13px] text-[var(--text-2)] num">z = {fmt(latest.z[selected]!, 2)}</span>
            )}
          </div>
          {range === 'day' && hist.error && <p className="text-[12.5px] text-[#a82626] mb-2">{hist.error}</p>}
          <TrendChart
            height={220}
            unit={p.unit !== '—' ? p.unit : ''}
            decimals={p.decimals}
            showDate={range === 'day'}
            ariaLabel={`${p.name} trend`}
            series={[{ key: selected, label: p.name, color: 'var(--series-1)', points: data.map((r) => [r.ts, r[selected]]) }]}
          />
        </Card>

        <Card title="Deviation from healthy baseline (z-score)">
          {hasZ ? (
            <>
              <TrendChart
                height={160}
                decimals={2}
                showDate={range === 'day'}
                yFloor={0}
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
                    points: data.map((r) => [r.ts, r.z?.[selected] !== undefined ? Math.abs(r.z[selected]!) : null]),
                  },
                ]}
              />
              <p className="text-[12px] text-[var(--muted)] mt-2">
                |z| against this motor’s own healthy statistics. Dashed lines are project defaults, not limits from a standard.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">
              The device has not sent z-scores for this parameter. They appear after the 2-hour healthy calibration run.
            </p>
          )}
        </Card>

        <Card title={`About: ${p.name}`}>
          <InfoBlock content={p.info} />
        </Card>
      </div>
    </div>
  );
}
