import React, { useEffect, useState } from 'react';
import { Activity, Bell, BrainCircuit, Cpu, Gauge, History, LogOut, WifiOff, FlaskConical } from 'lucide-react';
import type { AuthUser, PageKey, ServerState } from '../types';
import { INFO } from '../content/info';
import { InfoButton } from './ui';
import { ago } from '../lib/format';

const NAV: { key: PageKey; label: string; Icon: any }[] = [
  { key: 'overview', label: 'Overview', Icon: Gauge },
  { key: 'parameters', label: 'Parameters', Icon: Activity },
  { key: 'ai', label: 'Edge AI', Icon: BrainCircuit },
  { key: 'alerts', label: 'Alerts', Icon: Bell },
  { key: 'history', label: 'History & export', Icon: History },
  { key: 'device', label: 'Device', Icon: Cpu },
];

export const PAGE_TITLES: Record<PageKey, string> = Object.fromEntries(NAV.map((n) => [n.key, n.label])) as any;

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
      {text}
      <InfoButton content={INFO.freshness} />
    </span>
  );
}

export function Shell({
  page,
  onNavigate,
  user,
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
  onLogout: () => void;
  state: ServerState | null;
  connected: boolean;
  clockOffset: number;
  alertCount: number;
  children: React.ReactNode;
}) {
  const isDemo = state?.activeSource === 'demo';
  return (
    <div className="min-h-full flex flex-col lg:flex-row">
      {/* Sidebar (wide) / top nav (narrow) */}
      <nav
        aria-label="Main"
        className="bg-[var(--rail)] text-[var(--rail-text)] lg:w-56 lg:shrink-0 lg:min-h-screen flex lg:flex-col"
      >
        <div className="hidden lg:block px-4 pt-5 pb-4 border-b border-white/10">
          <div className="text-white font-semibold text-[15px] tracking-tight">MHM</div>
          <div className="text-[11.5px] text-slate-400 leading-snug">Motor Health Monitor</div>
        </div>
        <ul className="flex lg:flex-col overflow-x-auto lg:overflow-visible px-2 py-2 gap-0.5 w-full">
          {NAV.map(({ key, label, Icon }) => {
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
                    <span className="ml-auto text-[11px] num text-slate-300">{alertCount}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="hidden lg:block mt-auto px-4 py-4 border-t border-white/10 text-[11.5px] text-slate-400 leading-relaxed">
          Benn 0.75 kW · 415 V Δ · 1400 rpm
          <br />
          Inference on ESP32 (Board B)
        </div>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-[var(--surface)] border-b border-[var(--border)] px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
          <h1 className="text-[15px] font-semibold text-[var(--text)] truncate">{PAGE_TITLES[page]}</h1>
          <div className="flex items-center gap-4">
            <StatusIndicator state={state} clockOffset={clockOffset} />
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-[var(--border)]">
              <span
                className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] text-[11px] font-semibold flex items-center justify-center"
                aria-hidden
              >
                {user.initials}
              </span>
              <div className="leading-tight">
                <div className="text-[12.5px] font-medium text-[var(--text)]">{user.name}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {user.id} · {user.role.toLowerCase()}
                </div>
              </div>
            </div>
            <button type="button" className="btn" onClick={onLogout} aria-label="Sign out">
              <LogOut size={14} />
              <span className="hidden md:inline">Sign out</span>
            </button>
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
            style={{
              background:
                'repeating-linear-gradient(135deg, #eef1f5 0 10px, #e6eaf0 10px 20px)',
            }}
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
