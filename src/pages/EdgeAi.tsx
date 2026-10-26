import React, { useMemo } from 'react';
import { CheckCircle2, MinusCircle } from 'lucide-react';
import type { Alert, PublicConfig, ServerState, TelemetryRow } from '../types';
import { FEATURE_KEYS } from '../shared/contract';
import { INFO, PARAMS } from '../content/info';
import { ago } from '../lib/format';
import { Card, EmptyNote, InfoBlock, InfoButton, KeyValue } from '../components/ui';
import { dateTime, fmt } from '../lib/format';
import { isStale } from './Overview';

export function EdgeAi({
  rows,
  latest,
  state,
  config,
  alerts,
}: {
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  state: ServerState | null;
  config: PublicConfig | null;
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

  // Each change of the model output, with how long the previous label lasted
  const transitions = useMemo(() => {
    const list = alerts.filter((a) => a.category === 'model' && a.source === state?.activeSource);
    return list
      .map((a, i) => {
        const m = /changed: (.*) → (.*)$/.exec(a.title);
        return {
          id: a.id,
          ts: a.ts,
          from: m?.[1] ?? '—',
          to: m?.[2] ?? a.title,
          lasted: i > 0 ? a.ts - list[i - 1].ts : null,
          ack: a.ack,
        };
      })
      .slice(-20)
      .reverse();
  }, [alerts, state?.activeSource]);
  const isDemo = state?.activeSource === 'demo';
  const mi = config?.model;

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
              ['Algorithm', mi?.algorithm || 'Random Forest'],
              ['Classes', mi?.classes || '—'],
              ['Trained on', mi?.trainedOn || '—'],
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
              ['Validation metrics', mi?.validation || 'Not available'],
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
        <Card title="Prediction changes" info={INFO.predictionLog} bodyClass="p-0">
          <p className="px-4 pt-3 pb-2 text-[12.5px] text-[var(--text-2)] border-b border-[var(--border)]">
            Each line is a moment when the model’s answer changed, for example from <em>Healthy</em> to <em>Imbalance</em>. “Lasted” is how
            long the previous answer was held.
            {isDemo && (
              <span className="block mt-1 text-[var(--text)]">
                <strong className="font-semibold">Demo:</strong> these changes are simulated. The demo repeats a 150 s cycle (healthy → imbalance →
                healthy → bearing-like → healthy → thermal), so the same pattern returns every 2.5 minutes. They are not faults on the motor.
              </span>
            )}
          </p>
          {transitions.length ? (
            <div className="overflow-x-auto">
              <table className="table num">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Change</th>
                    <th>Previous answer lasted</th>
                  </tr>
                </thead>
                <tbody>
                  {transitions.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-[var(--text-2)]">{dateTime(t.ts)}</td>
                      <td className="whitespace-nowrap">
                        <span className="text-[var(--text-2)]">{t.from}</span> → <span className="font-medium">{t.to}</span>
                      </td>
                      <td className="whitespace-nowrap text-[var(--text-2)]">{t.lasted !== null ? ago(t.lasted).replace(' ago', '') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4">
              <EmptyNote title="No changes recorded">Each change of the model output is listed here.</EmptyNote>
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
