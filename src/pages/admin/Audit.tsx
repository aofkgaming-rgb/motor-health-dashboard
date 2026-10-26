import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { AuthUser } from '../../types';
import { ROLE_LABEL } from '../../shared/rbac';
import { Card, EmptyNote } from '../../components/ui';
import { api, download } from '../../lib/useLive';
import { dateTime } from '../../lib/format';
import { Banner, Msg } from './common';

interface Entry {
  id: string;
  ts: number;
  userId: string;
  userName: string;
  role: string;
  action: string;
  summary: string;
  detail?: any;
  ip: string;
}

const ACTIONS: [string, string][] = [
  ['', 'All actions'],
  ['auth', 'Sign-in and sign-out'],
  ['session', 'Sessions ended by admin'],
  ['user', 'User accounts'],
  ['settings', 'Settings and permissions'],
  ['maintenance', 'Maintenance records'],
  ['alert', 'Alert acknowledgements'],
  ['data', 'Exports, imports, clearing'],
  ['demo', 'Demo control'],
  ['backup', 'Backup and restore'],
  ['access', 'Blocked requests'],
];

export function AdminAudit({ token }: { token: string; user: AuthUser }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [userIds, setUserIds] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(() => {
    api<{ entries: Entry[]; total: number }>(token, `/api/admin/audit?user=${encodeURIComponent(who)}&action=${encodeURIComponent(action)}`)
      .then((d) => {
        setEntries(d.entries);
        setTotal(d.total);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [token, who, action]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    api<{ users: { id: string; name: string }[] }>(token, '/api/admin/users')
      .then((d) => setUserIds(d.users))
      .catch(() => {});
  }, [token]);

  return (
    <div className="space-y-4">
      <Banner msg={msg} />
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="text-[12.5px] text-[var(--text-2)] flex items-center gap-2">
          User
          <select className="field h-8 w-auto text-[12.5px]" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {userIds.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] text-[var(--text-2)] flex items-center gap-2">
          Action
          <select className="field h-8 w-auto text-[12.5px]" value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[12.5px] text-[var(--muted)] num">
          {entries.length} shown · {total} kept
        </span>
        <button
          type="button"
          className="btn ml-auto"
          onClick={() => download(token, '/api/admin/audit.csv', 'MHM_audit.csv').catch((e) => setMsg({ ok: false, text: e.message }))}
        >
          <Download size={14} /> Download full log (CSV)
        </button>
      </div>

      <Card title="Who did what, and when" bodyClass="p-0 overflow-x-auto">
        {entries.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>What happened</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap num text-[var(--text-2)]">{dateTime(e.ts)}</td>
                  <td className="whitespace-nowrap">
                    <span className="font-medium">{e.userName}</span>{' '}
                    <span className="text-[12px] text-[var(--muted)]">{(ROLE_LABEL as any)[e.role] ?? ''}</span>
                  </td>
                  <td className="font-mono text-[12px] whitespace-nowrap">{e.action}</td>
                  <td>
                    {e.summary}
                    {e.detail && (
                      <>
                        {' '}
                        <button type="button" className="text-[12px] text-[var(--accent-ink)] hover:underline cursor-pointer" onClick={() => setOpen(open === e.id ? null : e.id)}>
                          {open === e.id ? 'Hide details' : 'Details'}
                        </button>
                        {open === e.id && (
                          <pre className="mt-1 text-[11.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded p-2 overflow-x-auto max-w-[640px]">
                            {JSON.stringify(e.detail, null, 1)}
                          </pre>
                        )}
                      </>
                    )}
                  </td>
                  <td className="num text-[var(--text-2)]">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4">
            <EmptyNote title="No entries match these filters" />
          </div>
        )}
        <p className="px-4 py-3 text-[12px] text-[var(--muted)] border-t border-[var(--border)]">
          Every sign-in, failed sign-in, change of settings, users or permissions, maintenance edit, alert acknowledgement, export and blocked request is
          recorded. The log cannot be edited from the dashboard.
        </p>
      </Card>
    </div>
  );
}
