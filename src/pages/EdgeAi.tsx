import React, { useMemo } from 'react';
import { CheckCircle2, MinusCircle } from 'lucide-react';
import type { Alert, ServerState, TelemetryRow } from '../types';
import { FEATURE_KEYS } from '../shared/contract';
import { INFO, PARAMS } from '../content/info';
import { Card, EmptyNote, InfoBlock, InfoButton, KeyValue } from '../components/ui';
import { dateTime, fmt } from '../lib/format';
import { isStale } from './Overview';

export function EdgeAi({
  rows,
  latest,
  state,
  alerts,
}: {
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  state: ServerState | null;
  alerts: Alert[];
}) {
  const stale = isStale(state);

  // Class distribution over the rows currently held (last ~15 min)
  const dist = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.cls && m.set(r.cls, (m.get(r.cls) || 0) + 1));
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return { total, items: [...m.entries()].sort((a, b) => b[1] - a[1]) };
  }, [rows]);

  const transitions = alerts
    .filter((a) => a.category === 'model' && a.source === state?.activeSource)
    .slice(-15)
    .reverse();

  const modelLabel = latest?.model ?? state?.device?.model ?? null;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Latest prediction" info={INFO.cls} className="lg:col-span-2">
          {latest ? (
            <div className={stale ? 'opacity-60' : ''}>
              <div className="text-[30px] font-semibold tracking-tight">{latest.cls ?? <span className="text-[var(--muted)]">No output</span>}</div>
              {latest.vote_share !== null ? (
                <div className="mt-3 max-w-md">
                  <div className="flex items-center justify-between text-[12.5px] text-[var(--text-2)] mb-1">
                    <span className="inline-flex items-center gap-1">
                      Tree agreement <InfoButton content={INFO.vote_share} />
                    </span>
                    <span className="num font-medium text-[var(--text)]">{Math.round(latest.vote_share * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--none-soft)] overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${latest.vote_share * 100}%` }} />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-[var(--muted)]">The device did not send a vote count for this prediction.</p>
              )}
              <p className="mt-4 text-[12.5px] text-[var(--text-2)]">
                Inferred on the device at <span className="num">{dateTime(latest.ts)}</span>. A prediction is a prompt to inspect the motor, not
                a confirmed diagnosis.
              </p>
            </div>
          ) : (
            <EmptyNote title="No prediction yet">Predictions appear when the device sends its first row.</EmptyNote>
          )}
        </Card>

        <Card title="Model status">
          <KeyValue
            rows={[
              ['Runs on', 'ESP32 Board B (on-device)'],
              ['Algorithm', 'Random Forest, 50 trees'],
              ['Model id', modelLabel ?? '—'],
              [
                'Mode',
                modelLabel === 'rules'
                  ? 'Rule-based fallback'
                  : modelLabel === 'demo'
                    ? 'Demo simulation'
                    : modelLabel
                      ? 'Trained model'
                      : 'Unknown',
              ],
              ['Validation metrics', 'Not available — training in progress'],
            ]}
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Model inputs in the latest row">
          {latest ? (
            <ul className="divide-y divide-[var(--border)]">
              {FEATURE_KEYS.map((k) => {
                const p = PARAMS.find((x) => x.key === k)!;
                const ok = latest[k] !== null;
                const inModel = k !== 'jitter_pct' && k !== 'temp_rise_c_min';
                return (
                  <li key={k} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="flex items-center gap-2">
                      {ok ? (
                        <CheckCircle2 size={15} style={{ color: 'var(--good)' }} aria-label="Present" />
                      ) : (
                        <MinusCircle size={15} style={{ color: 'var(--none)' }} aria-label="Missing" />
                      )}
                      {p.name}
                    </span>
                    <span className="text-[12px] text-[var(--muted)]">
                      <span className="num text-[var(--text-2)]">{fmt(latest[k], p.decimals)}</span>
                      {' · '}
                      {inModel ? 'model input' : 'baseline monitoring'}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyNote title="No row yet" />
          )}
          <p className="text-[12px] text-[var(--muted)] mt-3">
            Jitter and temperature rise rate are monitored against the baseline instead of being model inputs, because the public training
            datasets do not contain them.
          </p>
        </Card>

        <Card title={`Class share, last ${Math.max(1, Math.round(rows.length / 60))} min`}>
          {dist.total ? (
            <ul className="space-y-2.5">
              {dist.items.map(([cls, n]) => (
                <li key={cls}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span>{cls}</span>
                    <span className="num text-[var(--text-2)]">
                      {Math.round((n / dist.total) * 100)}% · {n} rows
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--none-soft)] overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(n / dist.total) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title="No class outputs in this window" />
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Prediction changes" bodyClass="p-0">
          {transitions.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {transitions.map((a) => (
                <li key={a.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3 text-[13px]">
                  <span>{a.title.replace('Model output changed: ', '')}</span>
                  <span className="text-[11.5px] text-[var(--muted)] num whitespace-nowrap">{dateTime(a.ts)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4">
              <EmptyNote title="No changes recorded">Each change of the model output since the server started is listed here.</EmptyNote>
            </div>
          )}
        </Card>
        <Card title="How the health decision is made">
          <InfoBlock content={INFO.health} />
        </Card>
      </section>
    </div>
  );
}
