import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import type { AuthUser } from '../../types';
import { ROLES, ROLE_LABEL, Role } from '../../shared/rbac';
import { Card, EmptyNote } from '../../components/ui';
import { api } from '../../lib/useLive';
import { ago, dateTime } from '../../lib/format';
import { Banner, Field, Msg } from './common';

interface UserRow {
  id: string;
  name: string;
  role: Role;
  roleTitle: string;
  initials: string;
  enabled: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  online: boolean;
}
interface SessionRow {
  sid: string;
  userId: string;
  userName: string;
  role: Role | null;
  createdAt: number;
  lastSeen: number;
  ip: string;
  agent: string;
  live: boolean;
  current: boolean;
}

function browser(agent: string) {
  const b = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' · ');
}

export function AdminUsers({ token, user }: { token: string; user: AuthUser }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ id: '', name: '', role: 'OPERATOR' as Role, roleTitle: '', initials: '', password: '' });
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'signout' | 'session'; id: string; label: string } | null>(null);

  const apply = (d: { users: UserRow[]; sessions: SessionRow[] }) => {
    setUsers(d.users);
    setSessions(d.sessions);
  };
  const load = useCallback(() => api(token, '/api/admin/users').then(apply).catch((e) => setMsg({ ok: false, text: e.message })), [token]);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      apply(await fn());
      setMsg({ ok: true, text: ok });
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    const c = confirm;
    const ok =
      c.kind === 'delete'
        ? await run(() => api(token, `/api/admin/users/${c.id}`, { method: 'DELETE' }), `Deleted ${c.label}.`)
        : c.kind === 'signout'
          ? await run(() => api(token, `/api/admin/users/${c.id}/signout`, { method: 'POST' }), `${c.label} was signed out everywhere.`)
          : await run(() => api(token, `/api/admin/sessions/${c.id}`, { method: 'DELETE' }), `${c.label} was signed out.`);
    if (ok) setConfirm(null);
  };

  const ConfirmBar = ({ forId }: { forId: string }) =>
    confirm && confirm.id === forId ? (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="text-[12.5px]">
          {confirm.kind === 'delete'
            ? `Delete ${confirm.label}? Their sessions end and the account cannot sign in again.`
            : `Sign out ${confirm.label}? Their dashboard returns to the sign-in page at once.`}
        </span>
        <button type="button" className="btn" onClick={() => setConfirm(null)}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={doConfirm}>
          {confirm.kind === 'delete' ? `Delete ${confirm.label}` : `Sign out ${confirm.label}`}
        </button>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <Banner msg={msg} />

      <Card
        title={`Active sessions (${sessions.length})`}
        bodyClass="p-0 overflow-x-auto"
        actions={<span className="text-[12px] text-[var(--muted)]">Refreshes every 10 s</span>}
      >
        {sessions.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Signed in</th>
                <th>Last activity</th>
                <th>Device</th>
                <th>IP</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sid}>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.live ? 'var(--good)' : 'var(--none)' }} aria-label={s.live ? 'Dashboard open' : 'Dashboard closed'} />
                      <span className="font-medium">{s.userName}</span>
                      <span className="text-[var(--muted)] text-[12px]">{s.userId}</span>
                    </span>
                    {s.current && <span className="ml-1.5 text-[11px] text-[var(--accent-ink)]">this is you</span>}
                    <ConfirmBar forId={s.sid} />
                  </td>
                  <td>{s.role ? ROLE_LABEL[s.role] : '—'}</td>
                  <td className="whitespace-nowrap num">{dateTime(s.createdAt)}</td>
                  <td className="whitespace-nowrap">{ago(Date.now() - s.lastSeen)}</td>
                  <td className="whitespace-nowrap text-[var(--text-2)]">{browser(s.agent)}</td>
                  <td className="num text-[var(--text-2)]">{s.ip || '—'}</td>
                  <td className="text-right">
                    {!s.current && (
                      <button type="button" className="btn" onClick={() => setConfirm({ kind: 'session', id: s.sid, label: s.userName })}>
                        <LogOut size={13} /> Sign out
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4">
            <EmptyNote title="No one is signed in" />
          </div>
        )}
      </Card>

      <Card
        title={`Accounts (${users.length})`}
        bodyClass="p-0 overflow-x-auto"
        actions={
          !adding && (
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add user
            </button>
          )
        }
      >
        {adding && (
          <form
            className="p-4 border-b border-[var(--border)] bg-[var(--surface-2)] space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api(token, '/api/admin/users', { method: 'POST', body: JSON.stringify(nu) }), `Added ${nu.id.toUpperCase()}. Give them the password in person.`)) {
                setAdding(false);
                setNu({ id: '', name: '', role: 'OPERATOR', roleTitle: '', initials: '', password: '' });
              }
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="User ID" value={nu.id} onChange={(v) => setNu({ ...nu, id: v.toUpperCase() })} hint="e.g. OP-203" maxLength={20} />
              <Field label="Name" value={nu.name} onChange={(v) => setNu({ ...nu, name: v })} maxLength={60} />
              <label className="block text-[12.5px] font-medium">
                Role
                <select className="field h-9 mt-1" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Job title (optional)" value={nu.roleTitle} onChange={(v) => setNu({ ...nu, roleTitle: v })} maxLength={60} />
              <Field label="Initials (optional)" value={nu.initials} onChange={(v) => setNu({ ...nu, initials: v.toUpperCase() })} maxLength={3} />
              <Field label="Password" type="password" autoComplete="new-password" value={nu.password} onChange={(v) => setNu({ ...nu, password: v })} hint="At least 8 characters" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Create account
              </button>
            </div>
          </form>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {edit?.id === u.id ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-[420px]">
                      <Field label="Name" value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
                      <Field label="Job title" value={edit.roleTitle} onChange={(v) => setEdit({ ...edit, roleTitle: v })} />
                      <Field label="Initials" value={edit.initials} onChange={(v) => setEdit({ ...edit, initials: v.toUpperCase() })} maxLength={3} />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium">
                        {u.name} <span className="text-[12px] text-[var(--muted)] num">{u.id}</span>
                        {u.online && <span className="ml-1.5 text-[11px] text-[#08700a]">online</span>}
                      </div>
                      <div className="text-[12px] text-[var(--text-2)]">{u.roleTitle}</div>
                    </>
                  )}
                  {pwFor === u.id && (
                    <form
                      className="flex flex-wrap items-end gap-2 mt-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await run(() => api(token, `/api/admin/users/${u.id}/password`, { method: 'POST', body: JSON.stringify({ password: pw }) }), `New password set for ${u.id}. Their other sessions were signed out.`)) {
                          setPwFor(null);
                          setPw('');
                        }
                      }}
                    >
                      <Field label={`New password for ${u.name}`} type="password" autoComplete="new-password" value={pw} onChange={setPw} hint="At least 8 characters" />
                      <button type="button" className="btn" onClick={() => setPwFor(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={busy || pw.length < 8}>
                        Set password
                      </button>
                    </form>
                  )}
                  <ConfirmBar forId={u.id} />
                </td>
                <td>
                  <select
                    className="field h-8 w-auto text-[12.5px]"
                    aria-label={`Role of ${u.name}`}
                    value={u.role}
                    disabled={busy || u.id === user.id}
                    onChange={(e) =>
                      run(
                        () => api(token, `/api/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ role: e.target.value }) }),
                        `${u.name} is now ${ROLE_LABEL[e.target.value as Role]}. Their dashboard updates at once.`,
                      )
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={u.enabled}
                      disabled={busy || u.id === user.id}
                      onChange={(e) =>
                        run(
                          () => api(token, `/api/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) }),
                          e.target.checked ? `${u.name} can sign in again.` : `${u.name} is disabled and was signed out.`,
                        )
                      }
                    />
                    {u.enabled ? 'Enabled' : 'Disabled'}
                  </label>
                </td>
                <td className="whitespace-nowrap text-[var(--text-2)]">{u.lastLoginAt ? ago(Date.now() - u.lastLoginAt) : 'Never'}</td>
                <td className="text-right whitespace-nowrap">
                  {edit?.id === u.id ? (
                    <span className="inline-flex gap-2">
                      <button type="button" className="btn" onClick={() => setEdit(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={async () => {
                          if (await run(() => api(token, `/api/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ name: edit.name, roleTitle: edit.roleTitle, initials: edit.initials }) }), 'Saved.'))
                            setEdit(null);
                        }}
                      >
                        Save
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-1.5">
                      <button type="button" className="btn" title="Edit name and title" aria-label={`Edit ${u.name}`} onClick={() => setEdit(u)}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="btn" title="Set a new password" aria-label={`Reset password of ${u.name}`} onClick={() => setPwFor(u.id)}>
                        <KeyRound size={13} />
                      </button>
                      {u.id !== user.id && (
                        <>
                          <button type="button" className="btn" title="Sign out everywhere" aria-label={`Sign out ${u.name} everywhere`} onClick={() => setConfirm({ kind: 'signout', id: u.id, label: u.name })}>
                            <UserX size={13} />
                          </button>
                          <button type="button" className="btn btn-danger" title="Delete account" aria-label={`Delete ${u.name}`} onClick={() => setConfirm({ kind: 'delete', id: u.id, label: u.name })}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[12px] text-[var(--muted)] border-t border-[var(--border)]">
          Passwords are stored only as scrypt hashes. Changing a role, disabling an account or resetting a password takes effect on that person’s open
          dashboard at once. You cannot remove your own admin role, and at least one admin always remains.
        </p>
      </Card>
    </div>
  );
}
