/**
 * Telemetry storage.
 *
 *   live  — every row, last ~15 min (memory)            → Overview, live charts
 *   hist  — one row per 10 s, last 24 h (memory)         → 1 h / 6 h / 24 h charts
 *   long  — one row per 60 s, last `retentionDays` (memory) → 7-day / 30-day charts
 *   disk  — one row per 10 s, one file per calendar day  → one-day and date-range export
 *
 * Every stored row is a real row as received (no averaging), so an export is always
 * measured data. Charts over long ranges are averaged per bucket by `series()`.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { FEATURE_KEYS, FeatureKey, Source, TelemetryRow } from '../src/shared/contract';
import { dayKey, dayStart } from '../src/shared/settings';
import { dataPath } from './persist';

export const LIVE_CAP = 900;
export const HIST_BUCKET_MS = 10_000;
export const HIST_SPAN_MS = 24 * 3600 * 1000;
export const LONG_BUCKET_MS = 60_000;

const NUM_FIELDS = [
  'rpm',
  'jitter_pct',
  'rms_g',
  'peak_g',
  'crest',
  'kurtosis',
  'temp_c',
  'temp_rise_c_min',
  'i_l1_a',
  'i_l2_a',
  'i_l3_a',
  'vote_share',
  'z_max',
] as const;

function r6(v: number | null | undefined) {
  return v === null || v === undefined ? null : Number(v.toPrecision(6));
}

// Compact one-line encoding for the day files (about 4× smaller than plain JSON)
function encode(r: TelemetryRow): string {
  return JSON.stringify([
    r.ts,
    r.device_id,
    r.seq,
    r.boot,
    r.fw,
    ...NUM_FIELDS.map((k) => r6(r[k] as number | null)),
    r.cls,
    r.model,
    r.calibrated === null ? null : r.calibrated ? 1 : 0,
    r.z ? FEATURE_KEYS.map((k) => r6(r.z![k] ?? null)) : null,
    r.quality.length ? r.quality : 0,
    r.extra && Object.keys(r.extra).length ? r.extra : 0,
  ]);
}

function decode(line: string, source: Source): TelemetryRow | null {
  try {
    const a = JSON.parse(line);
    const row: any = { ts: a[0], device_id: a[1], source, seq: a[2], boot: a[3], fw: a[4] };
    NUM_FIELDS.forEach((k, i) => (row[k] = a[5 + i]));
    const o = 5 + NUM_FIELDS.length;
    row.cls = a[o];
    row.model = a[o + 1];
    row.calibrated = a[o + 2] === null ? null : a[o + 2] === 1;
    if (Array.isArray(a[o + 3])) {
      const z: Partial<Record<FeatureKey, number>> = {};
      FEATURE_KEYS.forEach((k, i) => a[o + 3][i] !== null && (z[k] = a[o + 3][i]));
      row.z = z;
    } else row.z = null;
    row.quality = Array.isArray(a[o + 4]) ? a[o + 4] : [];
    row.extra = a[o + 5] && typeof a[o + 5] === 'object' ? a[o + 5] : null;
    row.sensors = null;
    return row as TelemetryRow;
  } catch {
    return null;
  }
}

function insertSorted(arr: TelemetryRow[], r: TelemetryRow) {
  if (!arr.length || arr[arr.length - 1].ts <= r.ts) {
    arr.push(r);
    return;
  }
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].ts <= r.ts) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, r);
}

/** A slimmer copy for the long tier (sensors and identity fields dropped to save memory). */
function slim(r: TelemetryRow): TelemetryRow {
  return { ...r, sensors: null, boot: null, fw: null, quality: [] };
}

export class RowStore {
  live: TelemetryRow[] = [];
  hist: TelemetryRow[] = [];
  long: TelemetryRow[] = [];
  private histBuckets = new Set<number>();
  private longBuckets = new Set<number>();
  private dir: string;

  constructor(
    public source: Source,
    private cfg: () => { retentionDays: number; tzOffsetMin: number },
  ) {
    this.dir = dataPath('rows', source);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(day: string) {
    return path.join(this.dir, `${day}.ndjson`);
  }

  /** Add a row. `persist` = also write to the day file (false while loading from disk). */
  /** Returns true when the row was stored (false = its 10 s slot was already filled). */
  add(r: TelemetryRow, opts: { live?: boolean; persist?: boolean } = {}): boolean {
    const { live = true, persist = true } = opts;
    let stored = false;
    if (live) {
      insertSorted(this.live, r);
      while (this.live.length > LIVE_CAP) this.live.shift();
    }
    const hb = Math.floor(r.ts / HIST_BUCKET_MS);
    if (!this.histBuckets.has(hb)) {
      this.histBuckets.add(hb);
      stored = true;
      if (persist) fs.appendFileSync(this.fileFor(dayKey(r.ts, this.cfg().tzOffsetMin)), encode(r) + '\n');
      const newest = Math.max(this.hist[this.hist.length - 1]?.ts ?? 0, Date.now());
      if (r.ts >= newest - HIST_SPAN_MS) {
        insertSorted(this.hist, r);
        while (this.hist.length && this.hist[0].ts < newest - HIST_SPAN_MS) {
          this.histBuckets.delete(Math.floor(this.hist.shift()!.ts / HIST_BUCKET_MS));
        }
      }
    }
    const lb = Math.floor(r.ts / LONG_BUCKET_MS);
    if (!this.longBuckets.has(lb)) {
      this.longBuckets.add(lb);
      const keepFrom = Date.now() - this.cfg().retentionDays * 86400e3;
      if (r.ts >= keepFrom) insertSorted(this.long, slim(r));
    }
    return stored;
  }

  /** Remove everything older than the retention period (memory and day files). */
  prune() {
    const { retentionDays, tzOffsetMin } = this.cfg();
    const keepFrom = Date.now() - retentionDays * 86400e3;
    while (this.long.length && this.long[0].ts < keepFrom) {
      this.longBuckets.delete(Math.floor(this.long.shift()!.ts / LONG_BUCKET_MS));
    }
    const firstDay = dayKey(keepFrom, tzOffsetMin);
    for (const d of this.days()) if (d < firstDay) fs.rmSync(this.fileFor(d), { force: true });
  }

  clear() {
    this.live = [];
    this.hist = [];
    this.long = [];
    this.histBuckets.clear();
    this.longBuckets.clear();
    for (const d of this.days()) fs.rmSync(this.fileFor(d), { force: true });
  }

  /** Calendar days that have a day file, oldest first. */
  days(): string[] {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => /^\d{4}-\d\d-\d\d\.ndjson$/.test(f))
        .map((f) => f.slice(0, 10))
        .sort();
    } catch {
      return [];
    }
  }

  /** Rows of one day file, sorted, duplicates (same 10 s bucket) removed. */
  readDay(day: string): TelemetryRow[] {
    let text = '';
    try {
      text = fs.readFileSync(this.fileFor(day), 'utf8');
    } catch {
      return [];
    }
    const rows: TelemetryRow[] = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      const r = decode(line, this.source);
      if (r) rows.push(r);
    }
    rows.sort((a, b) => a.ts - b.ts);
    const seen = new Set<number>();
    return rows.filter((r) => {
      const b = Math.floor(r.ts / HIST_BUCKET_MS);
      if (seen.has(b)) return false;
      seen.add(b);
      return true;
    });
  }

  /** All stored rows between two timestamps, day by day (for exports). */
  *range(from: number, to: number): Generator<TelemetryRow> {
    const { tzOffsetMin } = this.cfg();
    const first = dayKey(from, tzOffsetMin);
    const last = dayKey(to, tzOffsetMin);
    for (const d of this.days()) {
      if (d < first || d > last) continue;
      for (const r of this.readDay(d)) if (r.ts >= from && r.ts <= to) yield r;
    }
  }

  /** Load the retention window from the day files at start-up. */
  async loadFromDisk() {
    const { retentionDays, tzOffsetMin } = this.cfg();
    const firstDay = dayKey(Date.now() - retentionDays * 86400e3, tzOffsetMin);
    let n = 0;
    for (const d of this.days()) {
      if (d < firstDay) continue;
      const rl = readline.createInterface({ input: fs.createReadStream(this.fileFor(d)) });
      for await (const line of rl) {
        if (!line) continue;
        const r = decode(line, this.source);
        if (r) {
          this.add(r, { live: false, persist: false });
          n++;
        }
      }
    }
    return n;
  }

  stats() {
    const days = this.days();
    let bytes = 0;
    for (const d of days) {
      try {
        bytes += fs.statSync(this.fileFor(d)).size;
      } catch {}
    }
    return {
      liveRows: this.live.length,
      histRows: this.hist.length,
      longRows: this.long.length,
      days: days.length,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
      diskBytes: bytes,
    };
  }

  /** Rows for a chart: picks the finest tier that covers the span, then averages into ≤ `points` buckets. */
  series(from: number, to: number, points: number) {
    const span = to - from;
    const tier = span <= 15 * 60e3 + 5e3 ? this.live : span <= HIST_SPAN_MS + 60e3 ? this.hist : this.long;
    const tierName = tier === this.live ? 'live' : tier === this.hist ? 'hist' : 'long';
    const src = tier.filter((r) => r.ts >= from && r.ts <= to);
    const step = Math.max(1, Math.ceil(span / Math.max(10, points)));
    if (src.length <= points) return { tier: tierName, bucketMs: null, rows: src };
    return { tier: tierName, bucketMs: step, rows: aggregate(src, step) };
  }
}

/** Mean of each value per bucket; z values keep the largest |z| so a short spike is not hidden. */
export function aggregate(rows: TelemetryRow[], step: number): TelemetryRow[] {
  const out: TelemetryRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const b = Math.floor(rows[i].ts / step);
    let j = i;
    while (j < rows.length && Math.floor(rows[j].ts / step) === b) j++;
    const grp = rows.slice(i, j);
    const last = grp[grp.length - 1];
    const o: any = { ...last, ts: grp[0].ts, sensors: null, quality: [] };
    for (const k of NUM_FIELDS) {
      if (k === 'z_max') continue;
      let s = 0;
      let n = 0;
      for (const r of grp) {
        const v = r[k] as number | null;
        if (v !== null && v !== undefined) {
          s += v;
          n++;
        }
      }
      o[k] = n ? s / n : null;
    }
    let zm: number | null = null;
    const z: Partial<Record<FeatureKey, number>> = {};
    const extra: Record<string, number> = {};
    const exN: Record<string, number> = {};
    for (const r of grp) {
      if (r.z_max !== null) zm = Math.max(zm ?? 0, r.z_max);
      if (r.z) for (const k of FEATURE_KEYS) if (r.z[k] !== undefined) z[k] = Math.max(Math.abs(z[k] ?? 0), Math.abs(r.z[k]!));
      if (r.extra)
        for (const [k, v] of Object.entries(r.extra)) {
          extra[k] = (extra[k] ?? 0) + v;
          exN[k] = (exN[k] ?? 0) + 1;
        }
    }
    for (const k of Object.keys(extra)) extra[k] /= exN[k];
    o.z_max = zm;
    o.z = Object.keys(z).length ? z : null;
    o.extra = Object.keys(extra).length ? extra : null;
    o.n = grp.length;
    out.push(o);
    i = j;
  }
  return out;
}

export { dayStart };
