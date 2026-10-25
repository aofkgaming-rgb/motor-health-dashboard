import React, { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { Alert, ServerState } from '../types';
import { Card, EmptyNote } from '../components/ui';
import { dateTime } from '../lib/format';

const SEV_STYLE = {
  critical: { Icon: AlertOctagon, color: 'var(--crit)', label: 'Critical' },
  warning: { Icon: AlertTriangle, color: 'var(--warn)', label: 'Warning' },
  info: { Icon: Info, color: 'var(--accent)', label: 'Info' },
};

const CATEGORY_LABEL: Record<Alert['category'], string> = {
  health: 'Health',
  model: 'Model',
  device: 'Device',
  sensor: 'Sensor',
  data: 'Data quality',
};

export const AlertRow: React.FC<{ alert: Alert }> = ({ alert }) => {
  const s = SEV_STYLE[alert.severity];
  return (
    <li className="flex gap-3 px-4 py-3">
      <s.Icon size={16} style={{ color: s.color }} className="mt-0.5 shrink-0" aria-label={s.label} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[13px] font-medium text-[var(--text)]">{alert.title}</p>
          <span className="text-[11.5px] text-[var(--muted)] num whitespace-nowrap">{dateTime(alert.ts)}</span>
        </div>
        <p className="text-[12.5px] text-[var(--text-2)] mt-0.5">{alert.detail}</p>
        <p className="text-[11.5px] text-[var(--muted)] mt-1">
          {s.label} · {CATEGORY_LABEL[alert.category]} · {alert.source === 'demo' ? 'Demo data' : alert.device_id}
        </p>
      </div>
    </li>
  );
};

export function Alerts({ alerts, state }: { alerts: Alert[]; state: ServerState | null }) {
  const [sev, setSev] = useState<'all' | Alert['severity']>('all');
  const [cat, setCat] = useState<'all' | Alert['category']>('all');
  const [src, setSrc] = useState<'active' | 'all'>('active');

  const list = useMemo(
    () =>
      alerts
        .filter((a) => (src === 'all' ? true : a.source === state?.activeSource))
        .filter((a) => (sev === 'all' ? true : a.severity === sev))
        .filter((a) => (cat === 'all' ? true : a.category === cat))
        .slice()
        .reverse(),
    [alerts, sev, cat, src, state?.activeSource],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Severity">
          {(['all', 'critical', 'warning', 'info'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={sev === k} onClick={() => setSev(k)}>
              {k === 'all' ? 'All severities' : SEV_STYLE[k].label}
            </button>
          ))}
        </div>
        <label className="text-[12.5px] text-[var(--text-2)] flex items-center gap-2">
          Category
          <select className="field h-8 w-auto text-[12.5px]" value={cat} onChange={(e) => setCat(e.target.value as any)}>
            <option value="all">All</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="seg ml-auto" role="group" aria-label="Data source">
          <button type="button" aria-pressed={src === 'active'} onClick={() => setSrc('active')}>
            Current source
          </button>
          <button type="button" aria-pressed={src === 'all'} onClick={() => setSrc('all')}>
            Include demo
          </button>
        </div>
      </div>

      <Card title={`${list.length} alert${list.length === 1 ? '' : 's'}`} bodyClass="p-0">
        {list.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {list.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </ul>
        ) : (
          <div className="px-4">
            <EmptyNote title="No alerts match these filters">
              Alerts are created when the device’s model output, baseline deviation or sensor status changes, or when the device goes
              offline. They are kept in server memory and reset if the server restarts.
            </EmptyNote>
          </div>
        )}
      </Card>
    </div>
  );
}
