import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alert, ServerState, Source, TelemetryRow } from '../types';

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
}

export function useLive(token: string | null, onUnauthorized: () => void): LiveData {
  const [state, setState] = useState<ServerState | null>(null);
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const sourceRef = useRef<Source | null>(null);
  const unauthRef = useRef(onUnauthorized);
  unauthRef.current = onUnauthorized;

  const loadRows = useCallback(
    (source: Source) => {
      if (!token) return;
      fetch(`/api/telemetry?source=${source}&res=live&limit=${LIVE_CAP}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (r.status === 401) {
            unauthRef.current();
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
    let closed = false;
    let attempts = 0;

    const applyState = (s: ServerState) => {
      setState(s);
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
        } else if (msg.type === 'cleared') {
          if (msg.source === sourceRef.current) setRows([]);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        attempts++;
        // A rejected token comes back as a failed upgrade: check the session once in a while.
        if (attempts === 3) {
          fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
            if (r.status === 401) unauthRef.current();
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
      ws?.close();
    };
  }, [token, loadRows]);

  const latest = rows.length ? rows[rows.length - 1] : null;
  const refreshRows = useCallback(() => {
    if (sourceRef.current) loadRows(sourceRef.current);
  }, [loadRows]);

  return { state, rows, latest, alerts, connected, clockOffset, refreshRows };
}

export async function api<T = any>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}). Try again.`);
  return data as T;
}
