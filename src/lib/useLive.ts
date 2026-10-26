import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alert, ServerState, Source, TelemetryRow } from '../types';
import { THRESHOLDS } from '../shared/contract';

const LIVE_CAP = 900;

export interface LiveData {
  state: ServerState | null;
  rows: TelemetryRow[];
  latest: TelemetryRow | null;
  alerts: Alert[];
  connected: boolean;
  /** server clock minus browser clock, so ages are right even if the PC clock is off */
  clockOffset: number;
  refreshRows: () => void;
  /** increases when the admin changes settings, my permissions, or maintenance records */
  ticks: { config: number; me: number; maintenance: number; cleared: number };
}

export function useLive(token: string | null, onSignedOut: (reason: string) => void): LiveData {
  const [state, setState] = useState<ServerState | null>(null);
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [ticks, setTicks] = useState({ config: 0, me: 0, maintenance: 0, cleared: 0 });
  const sourceRef = useRef<Source | null>(null);
  const outRef = useRef(onSignedOut);
  outRef.current = onSignedOut;
  const bump = (k: keyof LiveData['ticks']) => setTicks((t) => ({ ...t, [k]: t[k] + 1 }));

  const loadRows = useCallback(
    (source: Source) => {
      if (!token) return;
      fetch(`/api/telemetry?source=${source}&res=live&limit=${LIVE_CAP}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (r.status === 401) {
            outRef.current('Your session has ended. Sign in again.');
            throw new Error('unauthorized');
          }
          return r.json();
        })
        .then((d) => {
          if (sourceRef.current === source) setRows(d.rows || []);
        })
        .catch(() => {});
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let attempts = 0;

    const applyState = (s: ServerState) => {
      setState(s);
      THRESHOLDS.zWarn = s.thresholds.zWarn;
      THRESHOLDS.zCrit = s.thresholds.zCrit;
      setClockOffset(s.serverTime - Date.now());
      if (sourceRef.current !== s.activeSource) {
        sourceRef.current = s.activeSource;
        setRows([]);
        loadRows(s.activeSource);
      }
    };

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        attempts = 0;
        setConnected(true);
        clearInterval(ping);
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('p'), 60_000);
      };
      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'snapshot') {
          sourceRef.current = msg.source;
          setRows(msg.rows || []);
          setAlerts(msg.alerts || []);
          applyState(msg.state);
        } else if (msg.type === 'state') {
          applyState(msg.state);
        } else if (msg.type === 'rows') {
          if (msg.source !== sourceRef.current) return;
          setRows((prev) => {
            const next = prev.concat(msg.rows);
            next.sort((a, b) => a.ts - b.ts);
            return next.length > LIVE_CAP ? next.slice(next.length - LIVE_CAP) : next;
          });
        } else if (msg.type === 'alert') {
          setAlerts((prev) => {
            const next = prev.concat(msg.alert);
            return next.length > 300 ? next.slice(next.length - 300) : next;
          });
        } else if (msg.type === 'alert_update') {
          setAlerts((prev) => prev.map((a) => (a.id === msg.alert.id ? msg.alert : a)));
        } else if (msg.type === 'cleared') {
          if (msg.source === sourceRef.current) loadRows(msg.source);
          bump('cleared');
        } else if (msg.type === 'config') {
          bump('config');
        } else if (msg.type === 'me_changed') {
          bump('me');
        } else if (msg.type === 'maintenance') {
          bump('maintenance');
        } else if (msg.type === 'signed_out') {
          closed = true;
          outRef.current(msg.reason || 'You were signed out.');
        }
      };
      ws.onclose = () => {
        setConnected(false);
        clearInterval(ping);
        if (closed) return;
        attempts++;
        // A rejected token comes back as a failed upgrade: check the session once in a while.
        if (attempts === 2) {
          fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
            if (r.status === 401) {
              closed = true;
              outRef.current('Your session has ended. Sign in again.');
            }
          });
        }
        retry = setTimeout(connect, Math.min(10_000, 1000 * attempts));
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
    };
  }, [token, loadRows]);

  const latest = rows.length ? rows[rows.length - 1] : null;
  const refreshRows = useCallback(() => {
    if (sourceRef.current) loadRows(sourceRef.current);
  }, [loadRows]);

  return { state, rows, latest, alerts, connected, clockOffset, refreshRows, ticks };
}

export async function api<T = any>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}). Try again.`);
  return data as T;
}

/** Download a file from an authenticated URL. Returns the row count header when present. */
export async function download(token: string, url: string, fallbackName: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Download failed (${res.status}).`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const count = res.headers.get('X-Row-Count');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return { name, count: count === null ? null : Number(count) };
}
