/**
 * MHM data contract — shared by the server (server.ts) and the dashboard (src/).
 *
 * ONE naming scheme end to end:
 *   Board B JSON packet  ==  SD-card CSV columns  ==  dashboard CSV export columns.
 * Change a name here and every layer changes with it.
 */

export const SCHEMA_VERSION = 1;

/** The six health features computed on the device (Board A). */
export type FeatureKey =
  | 'rms_g'
  | 'peak_g'
  | 'crest'
  | 'kurtosis'
  | 'jitter_pct'
  | 'temp_rise_c_min';

export const FEATURE_KEYS: FeatureKey[] = [
  'rms_g',
  'peak_g',
  'crest',
  'kurtosis',
  'jitter_pct',
  'temp_rise_c_min',
];

export type Source = 'device' | 'demo';

/** One feature row, exactly as stored and exported. Missing values are null — never 0. */
export interface TelemetryRow {
  ts: number; // unix milliseconds, UTC
  device_id: string;
  source: Source;
  seq: number | null; // monotonic counter from Board B (duplicate detection)
  boot: string | null; // changes every reboot of Board B
  fw: string | null; // firmware version string
  rpm: number | null;
  jitter_pct: number | null;
  rms_g: number | null;
  peak_g: number | null;
  crest: number | null;
  kurtosis: number | null; // Pearson kurtosis: Gaussian = 3.0
  temp_c: number | null;
  temp_rise_c_min: number | null;
  i_l1_a: number | null;
  i_l2_a: number | null;
  i_l3_a: number | null;
  cls: string | null; // class label produced by the on-device model
  vote_share: number | null; // votes for cls / trees in the Random Forest, 0..1
  model: string | null; // model id, e.g. "rf-v1" or "rules" for the fallback
  z_max: number | null; // largest |z| against the calibrated healthy baseline
  z: Partial<Record<FeatureKey, number>> | null; // per-feature z-scores
  calibrated: boolean | null; // has the 2-hour healthy baseline been captured?
  sensors: Record<string, string> | null; // e.g. { adxl: "ok", mlx: "ok", ct: "fault" }
  quality: string[]; // data-quality flags added by the server
  /** Admin-registered custom parameters (Administration → Motor & parameters). Not in the 21 SD columns. */
  extra?: Record<string, number> | null;
}

/** Plausibility limits. A value outside them is stored as null and flagged — not clipped. */
const LIMITS: Record<string, [number, number]> = {
  rpm: [0, 10000],
  jitter_pct: [0, 100],
  rms_g: [0, 16], // ADXL345 full scale is ±16 g
  peak_g: [0, 16],
  crest: [0, 100],
  kurtosis: [0, 1000],
  temp_c: [-40, 200],
  temp_rise_c_min: [-50, 50],
  i_l1_a: [0, 50],
  i_l2_a: [0, 50],
  i_l3_a: [0, 50],
  z_max: [0, 1000],
};

const NUMERIC_FIELDS = Object.keys(LIMITS) as (keyof TelemetryRow)[];

const EARLIEST_VALID_TS = Date.UTC(2024, 0, 1);

function toNum(v: unknown): number | null | 'bad' {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 'bad';
}

function toStr(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Validate and normalise one incoming packet.
 * Returns an error string when the packet cannot be stored at all.
 */
export function normalizeIncoming(
  raw: any,
  source: Source,
  nowMs: number,
  extraKeys: string[] = [],
): { row?: TelemetryRow; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'row must be a JSON object' };
  }
  const device_id = toStr(raw.device_id, 40);
  if (!device_id) return { error: 'device_id is required' };

  const quality: string[] = [];

  // Timestamp: device sends unix seconds (DS3231 / NTP). Accept ms too.
  let ts: number;
  const tsRaw = toNum(raw.ts);
  if (typeof tsRaw === 'number') {
    ts = tsRaw < 1e11 ? tsRaw * 1000 : tsRaw;
    if (ts < EARLIEST_VALID_TS || ts > nowMs + 5 * 60 * 1000) {
      ts = nowMs;
      quality.push('ts_invalid_server_time_used');
    }
  } else {
    ts = nowMs;
    quality.push('ts_missing_server_time_used');
  }

  const row: TelemetryRow = {
    ts,
    device_id,
    source,
    seq: null,
    boot: toStr(raw.boot, 40),
    fw: toStr(raw.fw, 40),
    rpm: null,
    jitter_pct: null,
    rms_g: null,
    peak_g: null,
    crest: null,
    kurtosis: null,
    temp_c: null,
    temp_rise_c_min: null,
    i_l1_a: null,
    i_l2_a: null,
    i_l3_a: null,
    cls: toStr(raw.cls, 40),
    vote_share: null,
    model: toStr(raw.model, 40),
    z_max: null,
    z: null,
    calibrated:
      raw.calibrated === true || raw.calibrated === 1
        ? true
        : raw.calibrated === false || raw.calibrated === 0
          ? false
          : null,
    sensors: null,
    quality,
  };

  const seq = toNum(raw.seq);
  if (typeof seq === 'number' && Number.isInteger(seq) && seq >= 0) row.seq = seq;

  for (const f of NUMERIC_FIELDS) {
    const v = toNum(raw[f]);
    if (v === 'bad') {
      quality.push(`not_a_number:${String(f)}`);
      continue;
    }
    if (v === null) continue;
    const [lo, hi] = LIMITS[f as string];
    if (v < lo || v > hi) {
      quality.push(`out_of_range:${String(f)}`);
      continue;
    }
    (row as any)[f] = v;
  }

  const votes = toNum(raw.votes);
  const trees = toNum(raw.trees);
  if (typeof votes === 'number' && typeof trees === 'number' && trees > 0 && votes >= 0 && votes <= trees) {
    row.vote_share = votes / trees;
  }

  if (raw.z && typeof raw.z === 'object') {
    const z: Partial<Record<FeatureKey, number>> = {};
    for (const k of FEATURE_KEYS) {
      const v = toNum(raw.z[k]);
      if (typeof v === 'number') z[k] = v;
    }
    if (Object.keys(z).length) row.z = z;
  }

  if (raw.sensors && typeof raw.sensors === 'object') {
    const s: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.sensors).slice(0, 12)) {
      const key = toStr(k, 16);
      const val = toStr(v, 16);
      if (key && val) s[key] = val.toLowerCase();
    }
    if (Object.keys(s).length) row.sensors = s;
  }

  // Custom parameters registered by the admin: numeric fields with those names are kept.
  if (extraKeys.length) {
    const extra: Record<string, number> = {};
    for (const k of extraKeys) {
      const v = toNum(raw[k]);
      if (typeof v === 'number') extra[k] = v;
      else if (v === 'bad') quality.push(`not_a_number:${k}`);
    }
    if (Object.keys(extra).length) row.extra = extra;
  }

  return { row };
}

// ---------------------------------------------------------------------------
// Severity — from the device's own baseline deviation, never from invented limits
// ---------------------------------------------------------------------------

export type Severity = 'normal' | 'warning' | 'critical' | 'uncalibrated' | 'unavailable';

/** Project defaults for |z| against the healthy baseline. Statistical, not from a standard. */
export const Z_WARN = 3;
export const Z_CRIT = 5;

/** Thresholds in use. The server sets them from the admin settings; the dashboard from the server state. */
export const THRESHOLDS = { zWarn: Z_WARN, zCrit: Z_CRIT };

export function severityFromZ(
  z: number | null | undefined,
  calibrated: boolean | null,
  t: { zWarn: number; zCrit: number } = THRESHOLDS,
): Severity {
  if (calibrated === false) return 'uncalibrated';
  if (z === null || z === undefined || !Number.isFinite(z)) return 'unavailable';
  const a = Math.abs(z);
  if (a >= t.zCrit) return 'critical';
  if (a >= t.zWarn) return 'warning';
  return 'normal';
}

// ---------------------------------------------------------------------------
// CSV — identical to the SD-card log on Board B
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  'timestamp_utc',
  'device_id',
  'source',
  'seq',
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
  'class',
  'vote_share',
  'model',
  'z_max',
  'calibrated',
  'quality',
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(Number(v.toPrecision(8))) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV header: the 21 standard columns, then any custom parameters, then nothing else. */
export function csvHeader(extraKeys: string[] = [], columns: readonly string[] = CSV_COLUMNS): string {
  return [...columns, ...extraKeys].join(',');
}

export function rowToCells(r: TelemetryRow): unknown[] {
  return [
    new Date(r.ts).toISOString(),
    r.device_id,
    r.source,
    r.seq,
    r.rpm,
    r.jitter_pct,
    r.rms_g,
    r.peak_g,
    r.crest,
    r.kurtosis,
    r.temp_c,
    r.temp_rise_c_min,
    r.i_l1_a,
    r.i_l2_a,
    r.i_l3_a,
    r.cls,
    r.vote_share,
    r.model,
    r.z_max,
    r.calibrated === null ? null : r.calibrated ? 1 : 0,
    r.quality.join(';'),
  ];
}

export function rowToCsvLine(r: TelemetryRow, extraKeys: string[] = [], columns: readonly string[] = CSV_COLUMNS): string {
  const all = rowToCells(r);
  const cells = columns.map((c) => all[CSV_COLUMNS.indexOf(c as any)]);
  for (const k of extraKeys) cells.push(r.extra?.[k] ?? null);
  return cells.map(csvCell).join(',');
}

/** Parse one SD-card CSV line (same 21 columns) back into a row. Used by the admin SD-card import. */
export function csvLineToRaw(header: string[], line: string): Record<string, any> | null {
  const cells: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  if (cells.length < 2) return null;
  const o: Record<string, any> = {};
  header.forEach((h, i) => (o[h.trim()] = cells[i] ?? ''));
  const raw: Record<string, any> = { ...o };
  if (o.timestamp_utc) {
    const t = Date.parse(o.timestamp_utc.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(o.timestamp_utc) ? o.timestamp_utc : o.timestamp_utc + 'Z');
    raw.ts = Number.isFinite(t) ? t : undefined;
  }
  if (o.class !== undefined) raw.cls = o.class;
  if (o.vote_share !== undefined && o.vote_share !== '') {
    raw.votes = Math.round(Number(o.vote_share) * 1000);
    raw.trees = 1000;
  }
  if (o.calibrated !== undefined && o.calibrated !== '') raw.calibrated = o.calibrated === '1' || o.calibrated === 'true';
  return raw;
}

// ---------------------------------------------------------------------------
// The monitored machine and the acquisition settings (single source of truth)
// ---------------------------------------------------------------------------

export const MOTOR = {
  id: 'MHM-BENCH-01',
  make: 'Benn Electricals, Mumbai',
  type: 'Three-phase squirrel-cage induction motor (TEFC)',
  power: '0.75 kW / 1.0 HP',
  voltage: '415 V, 3-phase, 50 Hz',
  connection: 'Delta (as wired on the bench; nameplate shows star)',
  ratedCurrent: '2.0 A (line)',
  ratedRpm: 1400,
  poles: 4,
  frame: '80',
  insulation: 'Class B',
};

export const ACQUISITION = {
  vibrationSensor: 'ADXL345 (3-axis MEMS accelerometer, I²C)',
  sampleRateHz: 3200,
  featureWindowS: 1,
  jitterWindowRevs: 50,
  shaftHz: 1400 / 60, // 23.3 Hz
  revPeriodMs: 60000 / 1400, // 42.9 ms
  kurtosisConvention: 'Pearson (Gaussian = 3.0, not excess)',
  vibrationUnit: 'g (acceleration)',
  inferenceLocation: 'On-device: ESP32 Board B (Random Forest, exported to C++)',
};
