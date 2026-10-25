import { useEffect, useState } from 'react';
import type { Source, TelemetryRow } from '../types';

/** 24-hour history at 10 s resolution, refreshed every 30 s while in use. */
export function useHistory(token: string, source: Source | undefined, enabled: boolean) {
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !source) return;
    let alive = true;
    const load = () => {
      setLoading(true);
      fetch(`/api/telemetry?source=${source}&res=hist&limit=10000`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server returned ${r.status}`))))
        .then((d) => {
          if (!alive) return;
          setRows(d.rows || []);
          setError(null);
        })
        .catch(() => alive && setError('Could not load history. It will retry in 30 s.'))
        .finally(() => alive && setLoading(false));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token, source, enabled]);

  return { rows, loading, error };
}
