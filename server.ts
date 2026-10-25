/**
 * MHM — Motor Health Monitor dashboard server.
 *
 * Role in the system: DISPLAY ONLY.
 *   Board A (ESP32) computes the six features. Board B (ESP32) runs the Random Forest,
 *   decides the health class, logs every row to its SD card, and POSTs rows here.
 *   This server never re-computes or overrides the device's decision.
 *
 * Storage: in memory only (Render free tier has no persistent disk).
 *   - live buffer: every row, last ~15 minutes
 *   - history buffer: one row per 10 s, last 24 hours
 *   The SD card on Board B is the permanent record.
 */
import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  ACQUISITION,
  CSV_COLUMNS,
  MOTOR,
  SCHEMA_VERSION,
  Severity,
  Source,
  TelemetryRow,
  FEATURE_KEYS,
  normalizeIncoming,
  rowToCsvLine,
  severityFromZ,
  Z_CRIT,
  Z_WARN,
} from './src/shared/contract';

// ---------------------------------------------------------------------------
// Configuration (Render → Environment)
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const DEVICE_KEY = process.env.DEVICE_KEY || ''; // shared secret, also flashed into Board B
const DEMO_AUTOSTART = (process.env.DEMO_AUTOSTART || 'true') !== 'false';
const STALE_AFTER_MS = 15_000; // no row for 15 s → STALE
const OFFLINE_AFTER_MS = 60_000; // no row for 60 s → OFFLINE
const LIVE_CAP = 900; // ~15 min at 1 row/s
const HIST_BUCKET_MS = 10_000; // history resolution
const HIST_SPAN_MS = 24 * 3600 * 1000;
const MAX_ROWS_PER_POST = 500;

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
class RowStore {
  live: TelemetryRow[] = [];
  hist: TelemetryRow[] = [];
  private buckets = new Set<number>();

  private static insertSorted(arr: TelemetryRow[], r: TelemetryRow) {
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

  add(r: TelemetryRow) {
    RowStore.insertSorted(this.live, r);
    while (this.live.length > LIVE_CAP) this.live.shift();

    const bucket = Math.floor(r.ts / HIST_BUCKET_MS);
    if (!this.buckets.has(bucket)) {
      this.buckets.add(bucket);
      RowStore.insertSorted(this.hist, r);
    }
    const newest = this.hist[this.hist.length - 1]?.ts ?? r.ts;
    while (this.hist.length && this.hist[0].ts < newest - HIST_SPAN_MS) {
      const old = this.hist.shift()!;
      this.buckets.delete(Math.floor(old.ts / HIST_BUCKET_MS));
    }
  }

  clear() {
    this.live = [];
    this.hist = [];
    this.buckets.clear();
  }
}

const stores: Record<Source, RowStore> = { device: new RowStore(), demo: new RowStore() };

// Duplicate detection (Board B re-sends its buffer after a Wi-Fi drop)
const seenKeys = new Set<string>();
const seenQueue: string[] = [];
function isDuplicate(r: TelemetryRow): boolean {
  if (r.seq === null) return false;
  const key = `${r.device_id}|${r.boot ?? ''}|${r.seq}`;
  if (seenKeys.has(key)) return true;
  seenKeys.add(key);
  seenQueue.push(key);
  if (seenQueue.length > 50_000) seenKeys.delete(seenQueue.shift()!);
  return false;
}

// ---------------------------------------------------------------------------
// Device state
// ---------------------------------------------------------------------------
interface DeviceInfo {
  device_id: string;
  fw: string | null;
  boot: string | null;
  model: string | null;
  calibrated: boolean | null;
  sensors: Record<string, string> | null;
  firstSeen: number;
  lastSeen: number; // server clock
  lastRowTs: number; // device clock
  rowsAccepted: number;
  rowsDuplicate: number;
  rowsRejected: number;
}

const devices = new Map<string, DeviceInfo>();
let primaryDeviceId: string | null = null;

type DeviceStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'NEVER_CONNECTED';
function deviceStatus(now = Date.now()): DeviceStatus {
  const d = primaryDeviceId ? devices.get(primaryDeviceId) : undefined;
  if (!d) return 'NEVER_CONNECTED';
  const age = now - d.lastSeen;
  if (age < STALE_AFTER_MS) return 'LIVE';
  if (age < OFFLINE_AFTER_MS) return 'STALE';
  return 'OFFLINE';
}

// ---------------------------------------------------------------------------
// Demo simulator — labelled DEMO everywhere, stored separately, never exported as device data
// ---------------------------------------------------------------------------
type Scenario = 'cycle' | 'healthy' | 'imbalance' | 'impulsive' | 'thermal';
let demoRunning = false;
let demoScenario: Scenario = 'cycle';
let demoSeq = 0;
let demoTemp = 38;
const demoBoot = crypto.randomBytes(4).toString('hex');

// Demo baseline (what a calibration run might produce). Illustrative only.
const DEMO_BASE: Record<string, [number, number]> = {
  rms_g: [0.05, 0.006],
  peak_g: [0.17, 0.02],
  crest: [3.3, 0.25],
  kurtosis: [3.0, 0.2],
  jitter_pct: [0.2, 0.04],
  temp_rise_c_min: [0.02, 0.06],
};

// Demo class labels are placeholders until the real class scheme is fixed after training.
const CYCLE: { s: Exclude<Scenario, 'cycle'>; secs: number }[] = [
  { s: 'healthy', secs: 40 },
  { s: 'imbalance', secs: 30 },
  { s: 'healthy', secs: 20 },
  { s: 'impulsive', secs: 30 },
  { s: 'healthy', secs: 20 },
  { s: 'thermal', secs: 30 },
];
let cycleIdx = 0;
let cycleT = 0;

function gauss(sd: number) {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}

function demoRow(now: number): TelemetryRow {
  let s: Exclude<Scenario, 'cycle'>;
  if (demoScenario === 'cycle') {
    cycleT++;
    if (cycleT >= CYCLE[cycleIdx].secs) {
      cycleT = 0;
      cycleIdx = (cycleIdx + 1) % CYCLE.length;
    }
    s = CYCLE[cycleIdx].s;
  } else s = demoScenario;

  let rms = DEMO_BASE.rms_g[0] + gauss(0.004);
  let crest = DEMO_BASE.crest[0] + gauss(0.15);
  let kurt = DEMO_BASE.kurtosis[0] + gauss(0.12);
  let jitter = DEMO_BASE.jitter_pct[0] + gauss(0.03);
  let rpm = 1438 + gauss(1.5); // light load on the bench → speed near synchronous
  let iBase = 1.3;
  let tempTarget = 38;
  let cls = 'Healthy';
  let votes = 44 + Math.round(gauss(2));

  if (s === 'imbalance') {
    rms = 0.12 + gauss(0.008);
    crest = 2.9 + gauss(0.12);
    jitter = 0.75 + gauss(0.08);
    cls = 'Imbalance';
    votes = 39 + Math.round(gauss(3));
  } else if (s === 'impulsive') {
    rms = 0.075 + gauss(0.006);
    crest = 5.6 + gauss(0.4);
    kurt = 6.4 + gauss(0.5);
    cls = 'Bearing fault';
    votes = 33 + Math.round(gauss(4));
  } else if (s === 'thermal') {
    iBase = 2.3;
    rpm = 1395 + gauss(2);
    tempTarget = 70;
  }

  demoTemp += (tempTarget - demoTemp) * (s === 'thermal' ? 0.0008 : 0.002) + gauss(0.003);
  // slope over the last ~60 s, like the firmware's sliding window
  const live = stores.demo.live;
  let prev: TelemetryRow | undefined;
  for (let i = live.length - 1; i >= 0; i--) {
    if (now - live[i].ts >= 60_000) {
      prev = live[i];
      break;
    }
  }
  const trise = prev && prev.temp_c !== null ? (demoTemp - prev.temp_c) / ((now - prev.ts) / 60000) : 0.05;

  const peak = rms * crest;
  const f: Record<string, number> = {
    rms_g: rms,
    peak_g: peak,
    crest,
    kurtosis: kurt,
    jitter_pct: Math.max(0.02, jitter),
    temp_rise_c_min: trise,
  };
  const z: Record<string, number> = {};
  let zmax = 0;
  for (const k of FEATURE_KEYS) {
    const [m, sd] = DEMO_BASE[k];
    z[k] = (f[k] - m) / sd;
    zmax = Math.max(zmax, Math.abs(z[k]));
  }

  return {
    ts: now,
    device_id: 'DEMO',
    source: 'demo',
    seq: ++demoSeq,
    boot: demoBoot,
    fw: 'demo',
    rpm,
    jitter_pct: f.jitter_pct,
    rms_g: rms,
    peak_g: peak,
    crest,
    kurtosis: kurt,
    temp_c: demoTemp,
    temp_rise_c_min: trise,
    i_l1_a: iBase + gauss(0.02),
    i_l2_a: iBase + 0.03 + gauss(0.02),
    i_l3_a: iBase - 0.02 + gauss(0.02),
    cls,
    vote_share: Math.max(26, Math.min(50, votes)) / 50,
    model: 'demo',
    z_max: zmax,
    z,
    calibrated: true,
    sensors: { adxl: 'ok', mlx: 'ok', hall: 'ok', ct: 'ok', sd: 'ok', rtc: 'ok' },
    quality: [],
  };
}

// ---------------------------------------------------------------------------
// Alerts — derived from what the device reports
// ---------------------------------------------------------------------------
interface Alert {
  id: string;
  ts: number;
  source: Source;
  device_id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'health' | 'device' | 'sensor' | 'model' | 'data';
  title: string;
  detail: string;
}
const alerts: Alert[] = [];

// A new class or severity must hold for this many consecutive rows before it raises an alert,
// so a single noisy window does not make alerts flap.
const DEBOUNCE_ROWS = 3;

interface Track<T> {
  committed: T;
  pending: T;
  count: number;
}
const tracks: Record<string, { cls: Track<string | null>; sev: Track<Severity>; sensorsBad: string; q: string }> = {};

function raise(a: Omit<Alert, 'id'>) {
  const alert: Alert = { id: crypto.randomBytes(6).toString('hex'), ...a };
  alerts.push(alert);
  if (alerts.length > 300) alerts.shift();
  broadcast({ type: 'alert', alert });
}

/** Returns the previous committed value when `next` has just been confirmed, otherwise undefined. */
function step<T>(t: Track<T>, next: T): { from: T } | undefined {
  if (next === t.committed) {
    t.pending = next;
    t.count = 0;
    return;
  }
  if (next === t.pending) t.count++;
  else {
    t.pending = next;
    t.count = 1;
  }
  if (t.count >= DEBOUNCE_ROWS) {
    const from = t.committed;
    t.committed = next;
    t.count = 0;
    return { from };
  }
}

function deriveAlerts(r: TelemetryRow) {
  const key = `${r.source}|${r.device_id}`;
  const sev = severityFromZ(r.z_max, r.calibrated);
  const sensorsBad = r.sensors
    ? Object.entries(r.sensors)
        .filter(([, v]) => v !== 'ok')
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')
    : '';
  const q = r.quality.join(', ');
  const base = { ts: r.ts, source: r.source, device_id: r.device_id };

  const t = tracks[key];
  if (!t) {
    tracks[key] = {
      cls: { committed: r.cls, pending: r.cls, count: 0 },
      sev: { committed: sev, pending: sev, count: 0 },
      sensorsBad,
      q,
    };
    return;
  }

  if (r.cls !== null) {
    const c = step(t.cls, r.cls);
    if (c) {
      const healthy = /^healthy$/i.test(r.cls);
      raise({
        ...base,
        severity: healthy ? 'info' : 'warning',
        category: 'model',
        title: `Model output changed: ${c.from ?? '—'} → ${r.cls}`,
        detail:
          (r.vote_share !== null ? `${Math.round(r.vote_share * 100)}% of trees agree. ` : '') +
          `Held for ${DEBOUNCE_ROWS} consecutive rows. A prediction is not a confirmed diagnosis — inspect the motor before acting.`,
      });
    }
  }

  const bad = (x: Severity) => x === 'warning' || x === 'critical';
  const sc = step(t.sev, sev);
  if (sc && (bad(sev) || (sev === 'normal' && bad(sc.from)))) {
    raise({
      ...base,
      severity: sev === 'critical' ? 'critical' : sev === 'warning' ? 'warning' : 'info',
      category: 'health',
      title: `Baseline deviation ${sc.from} → ${sev}`,
      detail:
        r.z_max !== null
          ? `Largest feature deviation |z| = ${r.z_max.toFixed(1)} (warning ≥ ${Z_WARN}, critical ≥ ${Z_CRIT}), held for ${DEBOUNCE_ROWS} rows.`
          : 'Deviation value unavailable.',
    });
  }

  if (sensorsBad && sensorsBad !== t.sensorsBad) {
    raise({ ...base, severity: 'warning', category: 'sensor', title: 'Sensor reported a problem', detail: sensorsBad });
  }
  if (q && r.source === 'device' && q !== t.q) {
    raise({ ...base, severity: 'info', category: 'data', title: 'Data-quality flag on incoming row', detail: q });
  }
  t.sensorsBad = sensorsBad;
  t.q = q;
}

// ---------------------------------------------------------------------------
// WebSocket broadcast
// ---------------------------------------------------------------------------
const sockets = new Set<WebSocket>();
function broadcast(msg: unknown) {
  const s = JSON.stringify(msg);
  sockets.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(s));
}

function activeSource(): Source {
  return demoRunning ? 'demo' : 'device';
}

function stateSnapshot() {
  const d = primaryDeviceId ? devices.get(primaryDeviceId) : undefined;
  return {
    serverTime: Date.now(),
    schema: SCHEMA_VERSION,
    activeSource: activeSource(),
    demo: { running: demoRunning, scenario: demoScenario },
    deviceStatus: deviceStatus(),
    device: d ?? null,
    ingestionConfigured: !!DEVICE_KEY,
    thresholds: { zWarn: Z_WARN, zCrit: Z_CRIT },
    staleAfterMs: STALE_AFTER_MS,
    offlineAfterMs: OFFLINE_AFTER_MS,
    motor: MOTOR,
    acquisition: ACQUISITION,
  };
}

let lastStatus: DeviceStatus = deviceStatus();
setInterval(() => {
  const now = Date.now();
  if (demoRunning) {
    const r = demoRow(now);
    stores.demo.add(r);
    deriveAlerts(r);
    broadcast({ type: 'rows', source: 'demo', rows: [r] });
  }
  const st = deviceStatus(now);
  if (st !== lastStatus && primaryDeviceId) {
    if (st === 'OFFLINE') {
      raise({
        ts: now,
        source: 'device',
        device_id: primaryDeviceId,
        severity: 'warning',
        category: 'device',
        title: 'Device offline',
        detail: `No data for ${OFFLINE_AFTER_MS / 1000} s. Board B keeps logging to SD and re-sends when Wi-Fi returns.`,
      });
    }
    lastStatus = st;
  }
  broadcast({ type: 'state', state: stateSnapshot() });
}, 1000);

if (DEMO_AUTOSTART) demoRunning = true;

// ---------------------------------------------------------------------------
// Authentication — three fixed accounts (unchanged), in-memory sessions
// ---------------------------------------------------------------------------
interface UserAccount {
  id: string;
  password: string;
  name: string;
  role: 'ENGINEER' | 'OPERATOR' | 'ADMIN';
  roleTitle: string;
  station: string;
  initials: string;
}

const REGISTERED_USERS: Record<string, UserAccount> = {
  'ENG-101': {
    id: 'ENG-101',
    password: 'password123',
    name: 'Jeet',
    role: 'ENGINEER',
    roleTitle: 'Lead Reliability Engineer',
    station: 'Motor Test Bench 01',
    initials: 'JT',
  },
  'OP-202': {
    id: 'OP-202',
    password: 'password123',
    name: 'Dhruchit',
    role: 'OPERATOR',
    roleTitle: 'Plant Condition Operator',
    station: 'Motor Test Bench 01',
    initials: 'DH',
  },
  'ADMIN-001': {
    id: 'ADMIN-001',
    password: 'admin123',
    name: 'Manav Sinh',
    role: 'ADMIN',
    roleTitle: 'Systems Administrator',
    station: 'Motor Test Bench 01',
    initials: 'MV',
  },
};

interface Session {
  user: Omit<UserAccount, 'password'>;
  token: string;
  expiresAt: number;
}
const sessions = new Map<string, Session>();

function sessionFromToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function bearer(req: express.Request) {
  const h = req.headers['authorization'];
  return h ? h.replace(/^Bearer\s+/i, '').trim() : null;
}

function requireAuth(roles?: UserAccount['role'][]): express.RequestHandler {
  return (req, res, next) => {
    const s = sessionFromToken(bearer(req));
    if (!s) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    if (roles && !roles.includes(s.user.role)) {
      return res.status(403).json({ error: `This action needs one of these roles: ${roles.join(', ')}.` });
    }
    (req as any).session = s;
    next();
  };
}

app.post('/api/auth/login', (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: 'Enter your ID and password.' });
  const user = REGISTERED_USERS[String(id).trim().toUpperCase()];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'That ID and password combination is not recognised.' });
  }
  const { password: _pw, ...pub } = user;
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user: pub, token, expiresAt: Date.now() + 24 * 3600 * 1000 });
  res.json({ status: 'success', user: { ...pub, token, loginTime: Date.now() } });
});

app.get('/api/auth/verify', (req, res) => {
  const s = sessionFromToken(bearer(req));
  if (!s) return res.status(401).json({ error: 'Session expired or invalid' });
  res.json({ status: 'authenticated', user: { ...s.user, token: s.token, loginTime: Date.now() } });
});

app.post('/api/auth/logout', (req, res) => {
  const t = bearer(req) || req.body?.token;
  if (t) sessions.delete(t);
  res.json({ status: 'logged_out' });
});

// ---------------------------------------------------------------------------
// Device ingestion — Board B → POST /api/v1/telemetry  (header X-Device-Key)
// ---------------------------------------------------------------------------
app.post('/api/v1/telemetry', (req, res) => {
  if (!DEVICE_KEY) {
    return res.status(503).json({ error: 'DEVICE_KEY is not set on the server. Add it in Render → Environment.' });
  }
  const key = String(req.headers['x-device-key'] || '');
  const a = Buffer.from(key);
  const b = Buffer.from(DEVICE_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid or missing X-Device-Key header.' });
  }

  const body = req.body;
  const rawRows: any[] = Array.isArray(body?.rows) ? body.rows : body ? [body] : [];
  if (!rawRows.length) return res.status(400).json({ error: 'Send one row object or { "rows": [...] }.' });
  if (rawRows.length > MAX_ROWS_PER_POST) {
    return res.status(413).json({ error: `At most ${MAX_ROWS_PER_POST} rows per request.` });
  }

  const now = Date.now();
  const accepted: TelemetryRow[] = [];
  const errors: { index: number; error: string }[] = [];
  let duplicates = 0;

  rawRows.forEach((raw, index) => {
    const { row, error } = normalizeIncoming(raw, 'device', now);
    if (!row) {
      errors.push({ index, error: error! });
      return;
    }
    let d = devices.get(row.device_id);
    if (!d) {
      d = {
        device_id: row.device_id,
        fw: null,
        boot: null,
        model: null,
        calibrated: null,
        sensors: null,
        firstSeen: now,
        lastSeen: now,
        lastRowTs: row.ts,
        rowsAccepted: 0,
        rowsDuplicate: 0,
        rowsRejected: 0,
      };
      devices.set(row.device_id, d);
    }
    if (isDuplicate(row)) {
      duplicates++;
      d.rowsDuplicate++;
      return;
    }
    d.lastSeen = now;
    d.lastRowTs = Math.max(d.lastRowTs, row.ts);
    d.rowsAccepted++;
    d.fw = row.fw ?? d.fw;
    d.boot = row.boot ?? d.boot;
    d.model = row.model ?? d.model;
    d.calibrated = row.calibrated ?? d.calibrated;
    d.sensors = row.sensors ?? d.sensors;
    stores.device.add(row);
    deriveAlerts(row);
    accepted.push(row);
  });

  if (accepted.length) {
    const wasOnline = lastStatus === 'LIVE' || lastStatus === 'STALE';
    primaryDeviceId = accepted[accepted.length - 1].device_id;
    if (demoRunning) {
      demoRunning = false; // real data always wins over the demo
      raise({
        ts: now,
        source: 'device',
        device_id: primaryDeviceId,
        severity: 'info',
        category: 'device',
        title: 'Live device data received — demo stopped',
        detail: 'The dashboard now shows only real measurements from the device.',
      });
    } else if (!wasOnline) {
      raise({
        ts: now,
        source: 'device',
        device_id: primaryDeviceId,
        severity: 'info',
        category: 'device',
        title: 'Device online',
        detail: `Receiving data from ${primaryDeviceId}.`,
      });
    }
    lastStatus = deviceStatus(now);
    broadcast({ type: 'rows', source: 'device', rows: accepted });
  }
  const pd = primaryDeviceId ? devices.get(primaryDeviceId) : undefined;
  if (pd && errors.length) pd.rowsRejected += errors.length;

  res.status(errors.length && !accepted.length ? 400 : 200).json({
    accepted: accepted.length,
    duplicates,
    rejected: errors.length,
    errors: errors.slice(0, 20),
    schema: SCHEMA_VERSION,
  });
});

// ---------------------------------------------------------------------------
// Dashboard API (requires sign-in)
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'MHM dashboard', schema: SCHEMA_VERSION, uptimeS: Math.round(process.uptime()) });
});

app.get('/api/state', requireAuth(), (_req, res) => res.json(stateSnapshot()));

function pickSource(q: unknown): Source {
  return q === 'demo' ? 'demo' : q === 'device' ? 'device' : activeSource();
}

app.get('/api/telemetry', requireAuth(), (req, res) => {
  const source = pickSource(req.query.source);
  const res_ = req.query.res === 'hist' ? 'hist' : 'live';
  const rows = stores[source][res_];
  const limit = Math.min(10_000, Math.max(1, parseInt(String(req.query.limit || '600'), 10) || 600));
  res.json({ source, resolution: res_, rows: rows.slice(-limit) });
});

app.get('/api/alerts', requireAuth(), (_req, res) => res.json({ alerts: alerts.slice(-200) }));

app.get('/api/export.csv', requireAuth(), (req, res) => {
  const source = pickSource(req.query.source);
  const res_ = req.query.res === 'live' ? 'live' : 'hist';
  const from = Number(req.query.from) || 0;
  const to = Number(req.query.to) || Number.MAX_SAFE_INTEGER;
  const rows = stores[source][res_].filter((r) => r.ts >= from && r.ts <= to);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const who = source === 'demo' ? 'DEMO-DATA' : primaryDeviceId || 'device';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="MHM_${who}_${res_ === 'hist' ? '10s' : 'full'}_${stamp}_v${SCHEMA_VERSION}.csv"`,
  );
  res.setHeader('X-Row-Count', String(rows.length));
  res.write(CSV_COLUMNS.join(',') + '\r\n');
  for (const r of rows) res.write(rowToCsvLine(r) + '\r\n');
  res.end();
});

app.post('/api/demo', requireAuth(['ENGINEER', 'ADMIN']), (req, res) => {
  const { action, scenario } = req.body || {};
  if (action === 'start') {
    if (deviceStatus() === 'LIVE') {
      return res.status(409).json({ error: 'A real device is sending data. Demo mode is blocked while it is live.' });
    }
    demoRunning = true;
  } else if (action === 'stop') {
    demoRunning = false;
  }
  if (['cycle', 'healthy', 'imbalance', 'impulsive', 'thermal'].includes(scenario)) {
    demoScenario = scenario;
    cycleIdx = 0;
    cycleT = 0;
  }
  broadcast({ type: 'state', state: stateSnapshot() });
  res.json(stateSnapshot());
});

app.delete('/api/buffer', requireAuth(['ADMIN']), (req, res) => {
  const source = req.query.source === 'demo' ? 'demo' : 'device';
  const n = stores[source].hist.length;
  stores[source].clear();
  broadcast({ type: 'cleared', source });
  res.json({ cleared: source, historyRowsRemoved: n, note: 'Server memory only. The SD card on Board B is not affected.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://x');
    if (url.pathname !== '/ws') return; // leave other upgrades (e.g. Vite HMR) alone
    const s = sessionFromToken(url.searchParams.get('token'));
    if (!s) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws: WebSocket) => {
    sockets.add(ws);
    const src = activeSource();
    ws.send(
      JSON.stringify({
        type: 'snapshot',
        state: stateSnapshot(),
        rows: stores[src].live.slice(-300),
        source: src,
        alerts: alerts.slice(-100),
      }),
    );
    ws.on('close', () => sockets.delete(ws));
    ws.on('error', () => sockets.delete(ws));
  });

  const distPath = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
    ? path.join(process.cwd(), 'dist')
    : __dirname;

  if (fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MHM dashboard server on http://0.0.0.0:${PORT}`);
    if (!DEVICE_KEY) console.warn('DEVICE_KEY not set — device ingestion is disabled until it is configured.');

    // Keep the Render free instance awake (it sleeps after ~15 min idle).
    const publicUrl = process.env.RENDER_EXTERNAL_URL;
    if (publicUrl) {
      setInterval(() => {
        try {
          (publicUrl.startsWith('https') ? https : http)
            .get(`${publicUrl}/api/health`, (r: any) => r.resume())
            .on('error', () => {});
        } catch {}
      }, 14 * 60 * 1000);
    }
  });
}

start();
