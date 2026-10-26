import React, { useCallback, useEffect, useState } from 'react';
import type { Settings, MotorProfile } from '../../shared/settings';
import { api } from '../../lib/useLive';

export type Msg = { ok: boolean; text: string } | null;

export function Banner({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={`text-[12.5px] rounded-md px-3 py-2 ${msg.ok ? 'bg-[var(--good-soft)] text-[#08700a]' : 'bg-[var(--crit-soft)] text-[#a82626]'}`}>
      {msg.text}
    </p>
  );
}

/** Full settings (admin only), with a save helper that reports the result. */
export function useAdminSettings(token: string) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<{ settings: Settings }>(token, '/api/admin/settings')
      .then((d) => setSettings(d.settings))
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [token]);
  useEffect(load, [load]);

  const save = async (method: string, url: string, body: unknown, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api<{ settings: Settings; activeMotor: MotorProfile }>(token, url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      if (d.settings) setSettings(d.settings);
      setMsg({ ok: true, text: ok });
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { settings, setSettings, msg, setMsg, busy, save, reload: load };
}

/** Text field with a visible label. */
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  className = '',
  ...rest
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className={`block text-[12.5px] font-medium ${className}`}>
      {label}
      <input type={type} className="field h-9 mt-1" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <span className="block text-[11.5px] font-normal text-[var(--muted)] mt-0.5">{hint}</span>}
    </label>
  );
}

/** '' → null, otherwise a number (kept as text while typing). */
export function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A small number cell for tables; empty means "not used". */
export function NumCell({
  value,
  onChange,
  label,
  step = 'any',
}: {
  value: number | string | null;
  onChange: (v: string) => void;
  label: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      aria-label={label}
      className="field h-8 w-[88px] text-[12.5px] num px-2"
      value={value ?? ''}
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
