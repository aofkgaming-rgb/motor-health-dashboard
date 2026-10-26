import { useEffect, useState } from 'react';
import type { Source, TelemetryRow } from '../types';

export const RANGES = [
  { key: '15m', label: '15 min', ms: 15 * 60e3, long: false },
  { key: '1h', label: '1 h', ms: 3600e3, long: false },
  { key: '6h', label: '6 h', ms: 6 * 3600e3, long: false },
  { key: '24h', label: '24 h', ms: 24 * 3600e3, long: false },
  { key: '7d', label: '7 days', ms: 7 * 86400e3, long: true },
  { key: '30d', label: '30 days', ms: 30 * 86400e3, long: true },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];

export function resolutionText(tier: string | null, bucketMs: number | null) {
  if (!tier) return '';
  if (bucketMs) {
    const m = bucketMs / 60000;
    return m >= 60 ? `averaged per ${+(m / 60).toFixed(1)} h` : m >= 1 ? `averaged per ${Math.round(m)} min` : `averaged per ${Math.round(bucketMs / 1000)} s`;
  }
  return tier === 'live' ? 'every row' : tier === 'hist' ? 'one row per 10 s' : 'one row per minute';
}

/**
 * Chart rows for the last `ms` milliseconds (server picks the resolution and averages long ranges).
 * Refreshes every 15 s for short ranges, every 2 min for 7/30 days.
 */
export function useSeries(token: string, source: Source | undefined, ms: number, enabled = true, refreshKey = 0) {
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [meta, setMeta] = useState<{ tier: string | null; bucketMs: number | null }>({ tier: null, bucketMs: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !source) return;
    let alive = true;
    const load = () => {
      const to = Date.now();
      fetch(`/api/series?source=${source}&from=${Math.floor(to - ms)}&to=${to}&points=720`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || `Server returned ${r.status}`);
          return d;
        })
        .then((d) => {
          if (!alive) return;
          setRows(d.rows || []);
          setMeta({ tier: d.tier ?? null, bucketMs: d.bucketMs ?? null });
          setError(null);
        })
        .catch((e) => alive && setError(e.message || 'Could not load the chart data.'))
        .finally(() => alive && setLoading(false));
    };
    setLoading(true);
    load();
    const t = setInterval(load, ms > 86400e3 ? 120_000 : 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token, source, ms, enabled, refreshKey]);

  return { rows, loading, error, ...meta };
}
