import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Wrench } from 'lucide-react';
import type { Alert, AuthUser, PageKey, PublicConfig, ServerState, TelemetryRow } from '../types';
import { FeatureKey, severityFromZ } from '../shared/contract';
import { limitSeverity, MaintenanceRecord } from '../shared/settings';
import { INFO } from '../content/info';
import { Card, EmptyNote, InfoButton, SeverityBadge } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { ago, clockTime, currentImbalance, fmt } from '../lib/format';
import { useNow } from '../components/Shell';
import { AlertRow } from './Alerts';
import { allViews, featureViews, maxCurrent, ParamView } from '../lib/params';
import { can, canOpen } from '../lib/access';

export function featureSeverity(row: TelemetryRow | null, key: FeatureKey | string) {
  if (!row) return 'unavailable' as const;
  return severityFromZ((row.z as any)?.[key] ?? null, row.calibrated);
}

export function isStale(state: ServerState | null) {
  return !!state && state.activeSource === 'device' && state.deviceStatus !== 'LIVE';
}

type Overall = 'healthy' | 'warning' | 'critical' | 'unknown';

/** One combined status for the banner: the worst of baseline deviation, admin limits and model output. */
function overallStatus(r: TelemetryRow, views: ParamView[]): { level: Overall; reasons: string[] } {
  const reasons: string[] = [];
  let level: Overall = 'healthy';
  const raise = (l: Overall, why: string) => {
    reasons.push(why);
    if (l === 'critical' || (l === 'warning' && level !== 'critical')) level = l;
  };
  const sev = severityFromZ(r.z_max, r.calibrated);
  if (sev === 'critical') raise('critical', `baseline deviation |z| ${fmt(r.z_max, 1)}`);
  else if (sev === 'warning') raise('warning', `baseline deviation |z| ${fmt(r.z_max, 1)}`);
  for (const v of views) {
    const ls = limitSeverity(v.get(r), v.limits);
    if (ls === 'critical' || ls === 'warning') raise(ls, `${v.name} ${fmt(v.get(r), v.decimals)} ${v.unit === '—' ? '' : v.unit}`);
  }
  if (r.cls && !/^healthy$/i.test(r.cls)) raise('warning', `model output “${r.cls}”`);
  if (level === 'healthy' && sev !== 'normal' && !r.cls) level = 'unknown';
  return { level, reasons };
}

const BANNER: Record<Overall, { title: string; action: string; bg: string; ink: string; color: string; Icon: any }> = {
  healthy: {
    title: 'Motor running normally',
    action: 'No action needed. Keep watching for alerts.',
    bg: 'var(--good-soft)',
    ink: '#08700a',
    color: 'var(--good)',
    Icon: CheckCircle2,
  },
  warning: {
    title: 'Check the motor',
    action: 'Inspect the motor at the next opportunity (noise, smell, heat, loose mounting) and acknowledge the alert with what you found.',
    bg: 'var(--warn-soft)',
    ink: 'var(--warn-ink)',
    color: 'var(--warn)',
    Icon: AlertTriangle,
  },
  critical: {
    title: 'Critical — inspect now',
    action: 'Inform the engineer now. If it is safe to do so, stop the motor and inspect it before running it again.',
    bg: 'var(--crit-soft)',
    ink: '#a82626',
    color: 'var(--crit)',
    Icon: AlertOctagon,
  },
  unknown: {
    title: 'Health not available yet',
    action: 'The device has not sent a model output or baseline deviation yet.',
    bg: 'var(--none-soft)',
    ink: 'var(--text-2)',
    color: 'var(--none)',
    Icon: CircleDashed,
  },
};

function useMaintenanceSummary(token: string, tick: number) {
  const [s, setS] = useState<{ last: MaintenanceRecord | null; nextDue: string | null; overdue: boolean; today: string } | null>(null);
  useEffect(() => {
    fetch('/api/maintenance/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => {});
  }, [token, tick]);
  return s;
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
}

function niceDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Overview({
  token,
  user,
  rows,
  latest,
  state,
  config,
  alerts,
  clockOffset,
  maintenanceTick,
  onNavigate,
  onOpenParam,
}: {
  token: string;
  user: AuthUser;
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  state: ServerState | null;
  config: PublicConfig | null;
  alerts: Alert[];
  clockOffset: number;
  maintenanceTick: number;
  onNavigate: (p: PageKey) => void;
  onOpenParam: (k: string) => void;
}) {
  const now = useNow() + clockOffset;
  const stale = isStale(state);
  const recent = useMemo(() => rows.filter((r) => r.ts >= (latest?.ts ?? 0) - 5 * 60 * 1000), [rows, latest]);
  const sev = latest ? severityFromZ(latest.z_max, latest.calibrated) : 'unavailable';
  const imb = latest ? currentImbalance([latest.i_l1_a, latest.i_l2_a, latest.i_l3_a]) : null;
  const visibleAlerts = alerts.filter((a) => a.source === state?.activeSource).slice(-5).reverse();
  const maint = useMaintenanceSummary(token, maintenanceTick);
  const features = featureViews(config);
  const views = allViews(config);
  const customs = views.filter((v) => v.custom);
  const motor = state?.motor ?? config?.activeMotor;
  const ratedA = motor?.ratedCurrentA ?? null;
  const showDetails = canOpen(user, 'parameters');

  if (!latest) {
    return (
      <Card title="Motor health">
        <EmptyNote title="Waiting for the first data row">
          {state?.deviceStatus === 'NEVER_CONNECTED'
            ? `No device has sent data since the server started. Power Board B and check its Wi-Fi${can(user, 'demo.control') ? ', or start the demo from the Device page' : ''}.`
            : 'The device is connected but no row has arrived yet.'}
        </EmptyNote>
      </Card>
    );
  }

  const st = overallStatus(latest, views);
  const B = BANNER[stale ? 'unknown' : st.level];
  const meanA = [latest.i_l1_a, latest.i_l2_a, latest.i_l3_a].filter((x): x is number => x !== null);
  const iMean = meanA.length ? meanA.reduce((a, b) => a + b, 0) / meanA.length : null;
  const iMax = maxCurrent(latest);

  return (
    <div className="space-y-4">
      {/* One status for everyone — the operator's main view */}
      <section className="card p-0 overflow-hidden" aria-live="polite">
        <div className="flex flex-wrap items-start gap-4 p-4" style={{ background: B.bg }}>
          <B.Icon size={30} style={{ color: B.color }} className="shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-[20px] font-semibold tracking-tight" style={{ color: B.ink }}>
              {stale ? `Last values ${ago(now - (state?.device?.lastSeen ?? latest.ts))} — not current` : B.title}
            </div>
            <p className="text-[13px] text-[var(--text)] mt-0.5">
              {motor?.name ?? 'Motor'}
              {motor?.location ? ` · ${motor.location}` : ''}
              {st.reasons.length > 0 && !stale ? ` · ${st.reasons.join(', ')}` : ''}
            </p>
            {!stale && <p className="text-[12.5px] text-[var(--text-2)] mt-1">{B.action}</p>}
          </div>
          <div className="text-right text-[12px] text-[var(--text-2)] num">
            Updated {clockTime(latest.ts)}
            <br />
            {latest.model === 'demo' ? 'Demo data' : latest.model ? `Model ${latest.model}` : ''}
          </div>
        </div>
      </section>

      {/* Health summary */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Model output" info={INFO.cls}>
          <div className={stale ? 'opacity-60' : ''}>
            <div className="text-[24px] font-semibold tracking-tight text-[var(--text)] leading-tight">
              {latest.cls ?? <span className="text-[var(--muted)]">No output</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-2)]">
              {latest.vote_share !== null && (
                <span className="inline-flex items-center gap-1 num">
                  {Math.round(latest.vote_share * 100)}% tree agreement <InfoButton content={INFO.vote_share} />
                </span>
              )}
            </div>
            {latest.model === 'rules' && <p className="mt-2 text-[12px] text-[var(--muted)]">Rule-based fallback — trained model not loaded yet.</p>}
          </div>
        </Card>

        <Card title="Baseline deviation" info={INFO.z_max}>
          <div className={stale ? 'opacity-60' : ''}>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-semibold tracking-tight num text-[var(--text)]">{latest.z_max !== null ? fmt(latest.z_max, 1) : '—'}</span>
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
              <dd className="text-[18px] font-semibold num">{fmt(iMean, 2)}</dd>
              <dd className="text-[11.5px] text-[var(--muted)]">
                A mean{imb !== null ? ` · ${fmt(imb, 1)}% imb.` : ''}
                {ratedA && iMax !== null ? ` · ${Math.round((iMax / ratedA) * 100)}% of rated` : ''}
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Maintenance"
          info={INFO.maintenance}
          actions={
            canOpen(user, 'maintenance') && (
              <button type="button" className="btn" onClick={() => onNavigate('maintenance')}>
                {can(user, 'maintenance.edit') ? 'Record' : 'View'}
              </button>
            )
          }
        >
          {maint?.last ? (
            <div className="text-[13px] space-y-1">
              <div className="flex items-center gap-2">
                <Wrench size={15} className="text-[var(--text-2)]" aria-hidden />
                <span className="font-semibold">{niceDate(maint.last.date)}</span>
                <span className="text-[var(--muted)]">· {daysBetween(maint.last.date, maint.today)} days ago</span>
              </div>
              <p className="text-[12.5px] text-[var(--text-2)] line-clamp-2">
                {maint.last.type}: {maint.last.description}
              </p>
              {maint.nextDue && (
                <p className={`text-[12.5px] ${maint.overdue ? 'text-[#a82626] font-medium' : 'text-[var(--text-2)]'}`}>
                  Next due {niceDate(maint.nextDue)}
                  {maint.overdue ? ` — overdue by ${daysBetween(maint.nextDue, maint.today)} days` : ` · in ${daysBetween(maint.today, maint.nextDue)} days`}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">No maintenance recorded for this motor yet.</p>
          )}
        </Card>
      </section>

      {/* Six parameters (+ any custom ones) */}
      <section aria-label="Health parameters" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...features, ...customs].map((p) => {
          const v = p.get(latest);
          const s = p.feature ? featureSeverity(latest, p.key) : null;
          const ls = limitSeverity(v, p.limits);
          return (
            <article key={p.key} className="card p-4 flex flex-col gap-2 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1">
                  {p.name} <InfoButton content={p.info} />
                </h3>
                <span className="flex gap-1">
                  {ls && ls !== 'normal' && <SeverityBadge severity={ls} />}
                  {s && <SeverityBadge severity={s} />}
                  {!s && !ls && <span className="text-[11.5px] text-[var(--muted)]">Custom</span>}
                </span>
              </div>
              <div className={`flex items-baseline gap-1.5 ${stale ? 'opacity-60' : ''}`}>
                <span className="text-[24px] font-semibold tracking-tight num">{fmt(v, p.decimals)}</span>
                <span className="text-[12.5px] text-[var(--muted)]">{p.unit !== '—' ? p.unit : ''}</span>
                {(latest.z as any)?.[p.key] !== undefined && (
                  <span className="ml-auto text-[12px] text-[var(--muted)] num">z {fmt((latest.z as any)[p.key], 1)}</span>
                )}
              </div>
              <TrendChart
                compact
                height={40}
                ariaLabel={`${p.name}, last 5 minutes`}
                series={[{ key: p.key, label: p.name, color: 'var(--series-1)', points: recent.map((r) => [r.ts, p.get(r)]) }]}
              />
              <div className="flex items-center justify-between text-[11.5px] text-[var(--muted)]">
                <span className="num">Last 5 min · {clockTime(latest.ts)}</span>
                {showDetails && (
                  <button
                    type="button"
                    onClick={() => onOpenParam(p.key)}
                    className="inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline cursor-pointer"
                  >
                    Details <ArrowRight size={12} />
                  </button>
                )}
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
              <AlertRow key={a.id} alert={a} token={token} canAck={can(user, 'alerts.ack')} />
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
