import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  BrainCircuit,
  ChevronDown,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  History,
  KeyRound,
  LogOut,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
  WifiOff,
  Wrench,
} from 'lucide-react';
import type { AuthUser, PageKey, Permission, PublicConfig, ServerState } from '../types';
import { INFO } from '../content/info';
import { InfoButton } from './ui';
import { ago } from '../lib/format';
import { canOpen } from '../lib/access';
import { api } from '../lib/useLive';
import { PERMISSIONS, ROLE_PURPOSE } from '../shared/rbac';

type NavItem = { key: PageKey; label: string; Icon: any };

const MONITOR: NavItem[] = [
  { key: 'overview', label: 'Overview', Icon: Gauge },
  { key: 'parameters', label: 'Parameters', Icon: Activity },
  { key: 'ai', label: 'Edge AI', Icon: BrainCircuit },
  { key: 'alerts', label: 'Alerts', Icon: Bell },
  { key: 'history', label: 'History & export', Icon: History },
  { key: 'maintenance', label: 'Maintenance', Icon: Wrench },
  { key: 'device', label: 'Device', Icon: Cpu },
];

const ADMIN: NavItem[] = [
  { key: 'admin-users', label: 'Users & sessions', Icon: Users },
  { key: 'admin-motor', label: 'Motor & parameters', Icon: Settings2 },
  { key: 'admin-permissions', label: 'Permissions', Icon: ShieldCheck },
  { key: 'admin-audit', label: 'Audit log', Icon: ScrollText },
  { key: 'admin-system', label: 'System & data', Icon: Database },
];

export const PAGE_TITLES: Record<PageKey, string> = Object.fromEntries([...MONITOR, ...ADMIN].map((n) => [n.key, n.label])) as any;

const ROLE_STYLE: Record<AuthUser['role'], { bg: string; fg: string }> = {
  OPERATOR: { bg: 'rgba(255,255,255,0.08)', fg: '#e2e8f0' },
  ENGINEER: { bg: 'rgba(42,120,214,0.28)', fg: '#cfe3fb' },
  ADMIN: { bg: '#f8fafc', fg: '#0f172a' },
};

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function StatusIndicator({ state, clockOffset }: { state: ServerState | null; clockOffset: number }) {
  const now = useNow() + clockOffset;
  if (!state) return <span className="text-[12.5px] text-[var(--muted)]">Connecting…</span>;
  let dot = 'var(--none)';
  let text = 'No device connected';
  if (state.activeSource === 'demo') {
    dot = 'var(--text-2)';
    text = 'Demo data';
  } else if (state.device) {
    const age = ago(now - state.device.lastSeen);
    if (state.deviceStatus === 'LIVE') {
      dot = 'var(--good)';
      text = `Live · ${state.device.device_id}`;
    } else if (state.deviceStatus === 'STALE') {
      dot = 'var(--warn)';
      text = `Stale · last row ${age}`;
    } else {
      dot = 'var(--crit)';
      text = `Offline · last row ${age}`;
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text)]">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} aria-hidden />
      <span className="hidden sm:inline">{text}</span>
      <InfoButton content={INFO.freshness} />
    </span>
  );
}

function NavList({
  items,
  page,
  onNavigate,
  alertCount,
}: {
  items: NavItem[];
  page: PageKey;
  onNavigate: (p: PageKey) => void;
  alertCount: number;
}) {
  return (
    <>
      {items.map(({ key, label, Icon }) => {
        const active = page === key;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onNavigate(key)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 rounded-md px-3 h-9 text-[13px] whitespace-nowrap cursor-pointer ${
                active ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={16} aria-hidden />
              <span>{label}</span>
              {key === 'alerts' && alertCount > 0 && (
                <span className="ml-auto text-[11px] num rounded px-1.5 bg-white/10 text-slate-200" aria-label={`${alertCount} open alerts`}>
                  {alertCount}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </>
  );
}

/** Account menu: who am I, what can I do, change password, sign out. */
function AccountMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const allowed = user.role === 'ADMIN' ? PERMISSIONS : PERMISSIONS.filter((p) => user.permissions.includes(p.key as Permission));

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api(user.token, '/api/me/password', { method: 'POST', body: JSON.stringify({ current: cur, next }) });
      setMsg({ ok: true, text: `Password changed.${r.otherSessionsEnded ? ` ${r.otherSessionsEnded} other session(s) were signed out.` : ''}` });
      setCur('');
      setNext('');
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 pl-3 sm:pl-4 sm:border-l border-[var(--border)] h-10 cursor-pointer"
      >
        <span
          className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] text-[11px] font-semibold flex items-center justify-center"
          aria-hidden
        >
          {user.initials}
        </span>
        <span className="hidden sm:block leading-tight text-left">
          <span className="block text-[12.5px] font-medium text-[var(--text)]">{user.name}</span>
          <span className="block text-[11px] text-[var(--muted)]">
            {user.roleLabel} · {user.id}
          </span>
        </span>
        <ChevronDown size={14} className="text-[var(--muted)]" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Your account" className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-1.5rem))] card p-0 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="text-[13px] font-semibold">{user.name}</div>
            <div className="text-[12px] text-[var(--text-2)]">
              {user.roleTitle} · {user.roleLabel}
            </div>
            <div className="text-[12px] text-[var(--muted)] mt-1">{ROLE_PURPOSE[user.role]}.</div>
          </div>
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="eyebrow mb-1.5 flex items-center gap-1">
              What your role can do <InfoButton content={INFO.access} />
            </div>
            <ul className="text-[12.5px] text-[var(--text-2)] space-y-0.5 max-h-40 overflow-y-auto">
              <li>View live data, the overview and alerts</li>
              {allowed.map((p) => (
                <li key={p.key}>{p.label}</li>
              ))}
              {user.role === 'ADMIN' && <li className="font-medium text-[var(--text)]">All administration pages</li>}
            </ul>
          </div>
          <div className="px-4 py-3 border-b border-[var(--border)]">
            {!pwOpen ? (
              <button type="button" className="btn w-full justify-center" onClick={() => setPwOpen(true)}>
                <KeyRound size={14} /> Change my password
              </button>
            ) : (
              <form onSubmit={changePw} className="space-y-2">
                <label className="block text-[12px] font-medium">
                  Current password
                  <input type="password" className="field h-9 mt-1" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
                </label>
                <label className="block text-[12px] font-medium">
                  New password (at least 8 characters)
                  <input type="password" className="field h-9 mt-1" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                </label>
                {msg && <p className={`text-[12px] ${msg.ok ? 'text-[#08700a]' : 'text-[#a82626]'}`}>{msg.text}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setPwOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !cur || !next}>
                    {busy ? 'Saving…' : 'Save new password'}
                  </button>
                </div>
              </form>
            )}
          </div>
          <div className="px-4 py-3">
            <button type="button" className="btn w-full justify-center" onClick={onLogout}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Shell({
  page,
  onNavigate,
  user,
  config,
  onLogout,
  state,
  connected,
  clockOffset,
  alertCount,
  children,
}: {
  page: PageKey;
  onNavigate: (p: PageKey) => void;
  user: AuthUser;
  config: PublicConfig | null;
  onLogout: () => void;
  state: ServerState | null;
  connected: boolean;
  clockOffset: number;
  alertCount: number;
  children: React.ReactNode;
}) {
  const isDemo = state?.activeSource === 'demo';
  const monitor = MONITOR.filter((n) => canOpen(user, n.key));
  const isAdmin = user.role === 'ADMIN';
  const m = state?.motor ?? config?.activeMotor;
  const rs = ROLE_STYLE[user.role];

  return (
    <div className="min-h-full flex flex-col lg:flex-row">
      {/* Sidebar (wide) / top nav (narrow) */}
      <nav aria-label="Main" className="bg-[var(--rail)] text-[var(--rail-text)] lg:w-60 lg:shrink-0 lg:min-h-screen flex lg:flex-col">
        <div className="hidden lg:block px-4 pt-5 pb-4 border-b border-white/10">
          <div className="text-white font-semibold text-[15px] tracking-tight">MHM</div>
          <div className="text-[11.5px] text-slate-400 leading-snug">{config?.site.station || 'Motor Health Monitor'}</div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ background: rs.bg, color: rs.fg }}>
              {user.roleLabel}
            </span>
            <span className="text-[12px] text-slate-300 truncate">{user.name}</span>
          </div>
        </div>
        <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible w-full">
          <ul className="flex lg:flex-col px-2 py-2 gap-0.5 lg:w-full">
            <li className="hidden lg:block px-3 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Monitoring</li>
            <NavList items={monitor} page={page} onNavigate={onNavigate} alertCount={alertCount} />
          </ul>
          {isAdmin && (
            <ul className="flex lg:flex-col px-2 py-2 gap-0.5 lg:w-full lg:border-t border-white/10 border-l lg:border-l-0">
              <li className="hidden lg:block px-3 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Administration</li>
              <NavList items={ADMIN} page={page} onNavigate={onNavigate} alertCount={0} />
            </ul>
          )}
        </div>
        <div className="hidden lg:block mt-auto px-4 py-4 border-t border-white/10 text-[11.5px] text-slate-400 leading-relaxed">
          {m ? (
            <>
              <span className="text-slate-300">{m.name}</span>
              <br />
              {[m.power, m.voltage?.split(',')[0], m.ratedRpm ? `${m.ratedRpm} rpm` : ''].filter(Boolean).join(' · ')}
            </>
          ) : (
            'Motor profile loading…'
          )}
          <br />
          Inference on ESP32 (Board B)
        </div>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-[var(--surface)] border-b border-[var(--border)] px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
          <h1 className="text-[15px] font-semibold text-[var(--text)] truncate">{PAGE_TITLES[page]}</h1>
          <div className="flex items-center gap-3">
            <StatusIndicator state={state} clockOffset={clockOffset} />
            <AccountMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        {!connected && state && (
          <div role="status" className="flex items-center gap-2 px-4 lg:px-6 py-2 text-[12.5px] bg-[var(--warn-soft)] text-[var(--warn-ink)] border-b border-[var(--border)]">
            <WifiOff size={14} /> Lost connection to the dashboard server. Reconnecting automatically — values below may be out of date.
          </div>
        )}
        {isDemo && (
          <div
            role="status"
            className="flex items-center gap-2 px-4 lg:px-6 py-2 text-[12.5px] text-[var(--text)] border-b border-[var(--border)]"
            style={{ background: 'repeating-linear-gradient(135deg, #eef1f5 0 10px, #e6eaf0 10px 20px)' }}
          >
            <FlaskConical size={14} className="text-[var(--text-2)]" />
            <span>
              <strong className="font-semibold">Demo data.</strong> Simulated by the server — not measured on the motor.
            </span>
            <InfoButton content={INFO.demo} />
          </div>
        )}

        <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
