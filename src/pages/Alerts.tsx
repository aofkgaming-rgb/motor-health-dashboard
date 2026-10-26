import React, { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCheck, Info } from 'lucide-react';
import type { Alert, AuthUser, ServerState } from '../types';
import { Card, EmptyNote } from '../components/ui';
import { dateTime } from '../lib/format';
import { api } from '../lib/useLive';
import { can } from '../lib/access';

const SEV_STYLE = {
  critical: { Icon: AlertOctagon, color: 'var(--crit)', label: 'Critical' },
  warning: { Icon: AlertTriangle, color: 'var(--warn)', label: 'Warning' },
  info: { Icon: Info, color: 'var(--accent)', label: 'Info' },
};

const CATEGORY_LABEL: Record<Alert['category'], string> = {
  health: 'Baseline',
  limit: 'Limit',
  model: 'Model',
  device: 'Device',
  sensor: 'Sensor',
  data: 'Data quality',
  system: 'System',
};

/** One alert. When `token` is given and the user may acknowledge, an Acknowledge control is shown. */
export const AlertRow: React.FC<{ alert: Alert; token?: string; canAck?: boolean }> = ({ alert, token, canAck }) => {
  const s = SEV_STYLE[alert.severity];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsAck = alert.severity !== 'info' && !alert.ack;

  const ack = async () => {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await api(token, `/api/alerts/${alert.id}/ack`, { method: 'POST', body: JSON.stringify({ note }) });
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex gap-3 px-4 py-3">
      <s.Icon size={16} style={{ color: s.color }} className="mt-0.5 shrink-0" aria-label={s.label} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[13px] font-medium text-[var(--text)]">{alert.title}</p>
          <span className="text-[11.5px] text-[var(--muted)] num whitespace-nowrap">{dateTime(alert.ts)}</span>
        </div>
        <p className="text-[12.5px] text-[var(--text-2)] mt-0.5">{alert.detail}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <p className="text-[11.5px] text-[var(--muted)]">
            {s.label} · {CATEGORY_LABEL[alert.category] ?? alert.category} · {alert.source === 'demo' ? 'Demo data' : alert.device_id}
          </p>
          {alert.ack ? (
            <p className="text-[11.5px] text-[#08700a] inline-flex items-center gap-1">
              <CheckCheck size={13} /> Acknowledged by {alert.ack.name} · {dateTime(alert.ack.at)}
              {alert.ack.note ? ` · “${alert.ack.note}”` : ''}
            </p>
          ) : (
            needsAck &&
            canAck &&
            token &&
            !open && (
              <button type="button" className="text-[12px] font-medium text-[var(--accent-ink)] hover:underline cursor-pointer" onClick={() => setOpen(true)}>
                Acknowledge…
              </button>
            )
          )}
        </div>
        {open && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`note-${alert.id}`}>
              Note (optional)
            </label>
            <input
              id={`note-${alert.id}`}
              className="field h-8 text-[12.5px] flex-1 min-w-[180px]"
              placeholder="e.g. Checked on site, belt guard loose"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={ack}>
              {busy ? 'Saving…' : 'Acknowledge alert'}
            </button>
            {err && <p className="w-full text-[12px] text-[#a82626]">{err}</p>}
          </div>
        )}
      </div>
    </li>
  );
};

export function Alerts({ alerts, state, user, token }: { alerts: Alert[]; state: ServerState | null; user: AuthUser; token: string }) {
  const [sev, setSev] = useState<'all' | Alert['severity']>('all');
  const [cat, setCat] = useState<'all' | Alert['category']>('all');
  const [src, setSrc] = useState<'active' | 'all'>('active');
  const [open, setOpen] = useState(false);
  const canAck = can(user, 'alerts.ack');

  const list = useMemo(
    () =>
      alerts
        .filter((a) => (src === 'all' ? true : a.source === state?.activeSource))
        .filter((a) => (sev === 'all' ? true : a.severity === sev))
        .filter((a) => (cat === 'all' ? true : a.category === cat))
        .filter((a) => (!open ? true : a.severity !== 'info' && !a.ack))
        .slice()
        .reverse(),
    [alerts, sev, cat, src, open, state?.activeSource],
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
        <label className="text-[12.5px] text-[var(--text-2)] flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          Only not acknowledged
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
              <AlertRow key={a.id} alert={a} token={token} canAck={canAck} />
            ))}
          </ul>
        ) : (
          <div className="px-4">
            <EmptyNote title="No alerts match these filters">
              Alerts are created when the device’s model output, baseline deviation, a limit set by the admin, or sensor status changes, or
              when the device goes offline. Warnings and critical alerts stay open until someone acknowledges them.
            </EmptyNote>
          </div>
        )}
      </Card>
      {!canAck && <p className="text-[12px] text-[var(--muted)]">Your role cannot acknowledge alerts.</p>}
    </div>
  );
}
