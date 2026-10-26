import React, { useEffect, useState } from 'react';
import type { AuthUser } from '../../types';
import { DEFAULT_MATRIX, Permission, PermissionMatrix, PERMISSIONS, ROLE_LABEL, ROLE_PURPOSE } from '../../shared/rbac';
import { INFO } from '../../content/info';
import { Card } from '../../components/ui';
import { api } from '../../lib/useLive';
import { Banner, Msg } from './common';

const EDITABLE = ['OPERATOR', 'ENGINEER'] as const;

export function AdminPermissions({ token }: { token: string; user: AuthUser }) {
  const [saved, setSaved] = useState<PermissionMatrix | null>(null);
  const [m, setM] = useState<PermissionMatrix | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ matrix: PermissionMatrix }>(token, '/api/admin/permissions')
      .then((d) => {
        setSaved(d.matrix);
        setM(JSON.parse(JSON.stringify(d.matrix)));
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [token]);

  if (!m || !saved) return <p className="text-[13px] text-[var(--text-2)]">Loading permissions…</p>;
  const dirty = JSON.stringify(m) !== JSON.stringify(saved);
  const toggle = (role: (typeof EDITABLE)[number], p: Permission) =>
    setM({ ...m, [role]: m[role].includes(p) ? m[role].filter((x) => x !== p) : [...m[role], p] });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api<{ settings: { matrix: PermissionMatrix } }>(token, '/api/admin/permissions', { method: 'PUT', body: JSON.stringify({ matrix: m }) });
      setSaved(d.settings.matrix);
      setM(JSON.parse(JSON.stringify(d.settings.matrix)));
      setMsg({ ok: true, text: 'Permissions saved. Every signed-in user’s menu and buttons update now; the change is in the audit log.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const groups = ['Pages', 'Data', 'Actions'] as const;

  return (
    <div className="space-y-4">
      <Banner msg={msg} />
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['OPERATOR', 'ENGINEER', 'ADMIN'] as const).map((r) => (
          <div key={r} className="card p-4">
            <div className="text-[13px] font-semibold">{ROLE_LABEL[r]}</div>
            <p className="text-[12.5px] text-[var(--text-2)] mt-0.5">{ROLE_PURPOSE[r]}.</p>
            <p className="text-[12px] text-[var(--muted)] mt-2 num">
              {r === 'ADMIN' ? 'Everything, always' : `${m[r].length} of ${PERMISSIONS.length} permissions`}
            </p>
          </div>
        ))}
      </section>

      <Card title="What each role may do" info={INFO.access} bodyClass="p-0 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Permission</th>
              {EDITABLE.map((r) => (
                <th key={r} className="text-center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
              <th className="text-center">Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="font-medium">Overview, live values and alerts</div>
                <div className="text-[12px] text-[var(--muted)]">Every signed-in user</div>
              </td>
              {[0, 1, 2].map((i) => (
                <td key={i} className="text-center">
                  <input type="checkbox" checked disabled aria-label="Always allowed" />
                </td>
              ))}
            </tr>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr>
                  <td colSpan={4} className="eyebrow bg-[var(--surface-2)]">
                    {g}
                  </td>
                </tr>
                {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key}>
                    <td>
                      <div className="font-medium">{p.label}</div>
                      <div className="text-[12px] text-[var(--muted)]">{p.help}</div>
                    </td>
                    {EDITABLE.map((r) => (
                      <td key={r} className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`${ROLE_LABEL[r]}: ${p.label}`}
                          checked={m[r].includes(p.key)}
                          onChange={() => toggle(r, p.key)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                    ))}
                    <td className="text-center">
                      <input type="checkbox" checked disabled aria-label={`Admin: ${p.label} (always)`} />
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr>
              <td>
                <div className="font-medium">Administration pages</div>
                <div className="text-[12px] text-[var(--muted)]">Users, motor & parameters, permissions, audit log, system & data</div>
              </td>
              <td className="text-center">
                <input type="checkbox" disabled aria-label="Not available" />
              </td>
              <td className="text-center">
                <input type="checkbox" disabled aria-label="Not available" />
              </td>
              <td className="text-center">
                <input type="checkbox" checked disabled aria-label="Always" />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save permissions'}
          </button>
          <button type="button" className="btn" disabled={!dirty} onClick={() => setM(JSON.parse(JSON.stringify(saved)))}>
            Discard changes
          </button>
          <button type="button" className="btn" onClick={() => setM(JSON.parse(JSON.stringify(DEFAULT_MATRIX)))}>
            Use project defaults
          </button>
          <span className="text-[12px] text-[var(--muted)]">The server checks these on every request; the admin column cannot be changed.</span>
        </div>
      </Card>
    </div>
  );
}
