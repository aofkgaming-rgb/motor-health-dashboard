import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Alert, PageKey, ServerState, TelemetryRow } from '../types';
import { FeatureKey, severityFromZ } from '../shared/contract';
import { INFO, PARAMS } from '../content/info';
import { Card, EmptyNote, InfoButton, SeverityBadge } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { ago, clockTime, currentImbalance, fmt } from '../lib/format';
import { useNow } from '../components/Shell';
import { AlertRow } from './Alerts';

export function featureSeverity(row: TelemetryRow | null, key: FeatureKey) {
  if (!row) return 'unavailable' as const;
  return severityFromZ(row.z?.[key] ?? null, row.calibrated);
}

export function isStale(state: ServerState | null) {
  return !!state && state.activeSource === 'device' && state.deviceStatus !== 'LIVE';
}

export function Overview({
  rows,
  latest,
  state,
  alerts,
  clockOffset,
  onNavigate,
  onOpenParam,
}: {
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  state: ServerState | null;
  alerts: Alert[];
  clockOffset: number;
  onNavigate: (p: PageKey) => void;
  onOpenParam: (k: FeatureKey) => void;
}) {
  const now = useNow() + clockOffset;
  const stale = isStale(state);
  const recent = useMemo(() => rows.filter((r) => r.ts >= (latest?.ts ?? 0) - 5 * 60 * 1000), [rows, latest]);
  const sev = latest ? severityFromZ(latest.z_max, latest.calibrated) : 'unavailable';
  const imb = latest ? currentImbalance([latest.i_l1_a, latest.i_l2_a, latest.i_l3_a]) : null;
  const visibleAlerts = alerts.filter((a) => a.source === state?.activeSource).slice(-5).reverse();

  if (!latest) {
    return (
      <Card title="Motor health">
        <EmptyNote title="Waiting for the first data row">
          {state?.deviceStatus === 'NEVER_CONNECTED'
            ? 'No device has sent data since the server started. Power Board B and check its Wi-Fi, or start the demo from the Device page.'
            : 'The device is connected but no row has arrived yet.'}
        </EmptyNote>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {stale && (
        <div role="status" className="card px-4 py-3 text-[13px] text-[var(--text-2)] border-l-4" style={{ borderLeftColor: 'var(--warn)' }}>
          Showing the last values received {ago(now - (state?.device?.lastSeen ?? latest.ts))}. They are not current.
        </div>
      )}

      {/* Health summary */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Model output" info={INFO.cls} className="md:col-span-1">
          <div className={stale ? 'opacity-60' : ''}>
            <div className="text-[26px] font-semibold tracking-tight text-[var(--text)] leading-tight">
              {latest.cls ?? <span className="text-[var(--muted)]">No output</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-2)]">
              {latest.vote_share !== null && (
                <span className="inline-flex items-center gap-1 num">
                  {Math.round(latest.vote_share * 100)}% tree agreement <InfoButton content={INFO.vote_share} />
                </span>
              )}
              <span>Model: {latest.model ?? '—'}</span>
            </div>
            {latest.model === 'rules' && (
              <p className="mt-2 text-[12px] text-[var(--muted)]">Rule-based fallback — trained model not loaded on the device yet.</p>
            )}
          </div>
        </Card>

        <Card title="Baseline deviation" info={INFO.z_max}>
          <div className={stale ? 'opacity-60' : ''}>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold tracking-tight num text-[var(--text)]">
                {latest.z_max !== null ? fmt(latest.z_max, 1) : '—'}
              </span>
              <span className="text-[12.5px] text-[var(--muted)]">largest |z|</span>
            </div>
            <div className="mt-2">
              <SeverityBadge severity={sev} size="md" />
            </div>
          </div>
        </Card>

        <Card title="Operating point">
          <dl className={`grid grid-cols-3 gap-3 ${stale ? 'opacity-60' : ''}`}>
            <div>
              <dt className="eyebrow flex items-center gap-1">
                Speed <InfoButton content={INFO.rpm} />
              </dt>
              <dd className="text-[18px] font-semibold num">{fmt(latest.rpm, 0)}</dd>
              <dd className="text-[11.5px] text-[var(--muted)]">rpm</dd>
            </div>
            <div>
              <dt className="eyebrow flex items-center gap-1">
                Temp <InfoButton content={INFO.temp_c} />
              </dt>
              <dd className="text-[18px] font-semibold num">{fmt(latest.temp_c, 1)}</dd>
              <dd className="text-[11.5px] text-[var(--muted)]">°C surface</dd>
            </div>
            <div>
              <dt className="eyebrow flex items-center gap-1">
                Current <InfoButton content={INFO.current} />
              </dt>
              <dd className="text-[18px] font-semibold num">
                {[latest.i_l1_a, latest.i_l2_a, latest.i_l3_a].every((x) => x === null)
                  ? '—'
                  : fmt(
                      [latest.i_l1_a, latest.i_l2_a, latest.i_l3_a]
                        .filter((x): x is number => x !== null)
                        .reduce((a, b, _, arr) => a + b / arr.length, 0),
                      2,
                    )}
              </dd>
              <dd className="text-[11.5px] text-[var(--muted)]">A mean{imb !== null ? ` · ${fmt(imb, 1)}% imb.` : ''}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {/* Six parameters */}
      <section aria-label="Six health parameters" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {PARAMS.map((p) => {
          const v = latest[p.key];
          const s = featureSeverity(latest, p.key);
          return (
            <article key={p.key} className="card p-4 flex flex-col gap-2 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1">
                  {p.name} <InfoButton content={p.info} />
                </h3>
                <SeverityBadge severity={s} />
              </div>
              <div className={`flex items-baseline gap-1.5 ${stale ? 'opacity-60' : ''}`}>
                <span className="text-[24px] font-semibold tracking-tight num">{fmt(v, p.decimals)}</span>
                <span className="text-[12.5px] text-[var(--muted)]">{p.unit !== '—' ? p.unit : ''}</span>
                {latest.z?.[p.key] !== undefined && (
                  <span className="ml-auto text-[12px] text-[var(--muted)] num">z {fmt(latest.z[p.key]!, 1)}</span>
                )}
              </div>
              <TrendChart
                compact
                height={40}
                ariaLabel={`${p.name}, last 5 minutes`}
                series={[{ key: p.key, label: p.name, color: 'var(--series-1)', points: recent.map((r) => [r.ts, r[p.key]]) }]}
              />
              <div className="flex items-center justify-between text-[11.5px] text-[var(--muted)]">
                <span className="num">Last 5 min · {clockTime(latest.ts)}</span>
                <button
                  type="button"
                  onClick={() => onOpenParam(p.key)}
                  className="inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline cursor-pointer"
                >
                  Details <ArrowRight size={12} />
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* Recent alerts */}
      <Card
        title="Recent alerts"
        bodyClass="p-0"
        actions={
          <button type="button" className="btn" onClick={() => onNavigate('alerts')}>
            View all alerts
          </button>
        }
      >
        {visibleAlerts.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {visibleAlerts.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </ul>
        ) : (
          <div className="px-4">
            <EmptyNote title="No alerts">Alerts appear here when the model output, baseline deviation or device status changes.</EmptyNote>
          </div>
        )}
      </Card>
    </div>
  );
}
