export function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(decimals);
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function dateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${clockTime(ts)}`;
}

export function ago(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Phase-current imbalance: largest deviation from the mean, as % of the mean. */
export function currentImbalance(a: (number | null)[]): number | null {
  const v = a.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 3) return null;
  const mean = (v[0] + v[1] + v[2]) / 3;
  if (mean <= 0.05) return null;
  return (Math.max(...v.map((x) => Math.abs(x - mean))) / mean) * 100;
}
