/**
 * MHM — Motor Health Monitor dashboard server.
 *
 * Role in the system: DISPLAY ONLY.
 *   Board A (ESP32) computes the six features. Board B (ESP32) runs the Random Forest,
 *   decides the health class, logs every row to its SD card, and POSTs rows here.
 *   This server never re-computes or overrides the device's decision.
 *
 * Access: role-based (Operator / Engineer / Admin). Every API route checks the role
 *   on the server (server/auth.ts). The admin edits the motor profile, parameters,
 *   information text, users and permissions from the dashboard — no code change needed.
 *
 * Storage (server/rowsdb.ts): 15 min of every row, 24 h at 10 s, 31 days at 1 min in
 *   memory, and one file per day at 10 s in DATA_DIR for exports. The SD card on
 *   Board B remains the permanent record.
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
  SCHEMA_VERSION,
  Severity,
  Source,
  TelemetryRow,
  FEATURE_KEYS,
  csvLineToRaw,
  normalizeIncoming,
  severityFromZ,
} from './src/shared/contract';
import { ROLE_LABEL, permissionsFor } from './src/shared/rbac';
import { METRIC_KEYS, dayKey, dayStart, limitSeverity, MaintenanceRecord, Settings } from './src/shared/settings';
import { DATA_DIR, dirSizeBytes, readJson, writeJsonSoon } from './server/persist';
import { RowStore, HIST_BUCKET_MS } from './server/rowsdb';
import { sendExport } from './server/exporter';
import * as A from './server/auth';
import * as C from './server/config';

// ---------------------------------------------------------------------------
// Configuration (Render → Environment). Everything else is set in the dashboard.
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const DEVICE_KEY = process.env.DEVICE_KEY || ''; // shared secret, also flashed into Board B
const DEMO_AUTOSTART = (process.env.DEMO_AUTOSTART || 'true') !== 'false';
const MAX_ROWS_PER_POST = 500;

C.loadSettings();
C.loadMaintenance();
A.loadUsers();
A.loadAudit();
A.useMatrix(() => C.settings.matrix);

const S = () => C.settings;
const cfg = () => ({ retentionDays: S().retentionDays, tzOffsetMin: S().tzOffsetMin });

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap a handler so input errors become clear 400 messages instead of crashes. */
const h =
  (fn: (req: A.AuthedRequest, res: express.Response) => any): express.RequestHandler =>
  async (req, res) => {
    try {
      await fn(req as A.AuthedRequest, res);
    } catch (e) {
      if (e instanceof C.InputError) return res.status(400).json({ error: e.message });
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: 'The server could not complete this. Try again; if it repeats, check the server log.' });
      else res.end();
    }
  };

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const stores: Record<Source, RowStore> = { device: new RowStore('device', cfg), demo: new RowStore('demo', cfg) };

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
  if (age < S().staleAfterS * 1000) return 'LIVE';
  if (age < S().offlineAfterS * 1000) return 'STALE';
  return 'OFFLINE';
}

// ---------------------------------------------------------------------------
// Demo simulator — labelled DEMO everywhere, stored separately, never exported as device data
// ---------------------------------------------------------------------------
type Scenario = 'cycle' | 'healthy' | 'imbalance' | 'impulsive' | 'thermal';
type Phase = Exclude<Scenario, 'cycle'>;
let demoRunning = false;
let demoScenario: Scenario = 'cycle';

// Demo baseline (what a calibration run might produce). Illustrative only.
const DEMO_BASE: Record<string, [number, number]> = {
  rms_g: [0.05, 0.006],
  peak_g: [0.17, 0.02],
  crest: [3.3, 0.25],
  kurtosis: [3.0, 0.2],
  jitter_pct: [0.2, 0.04],
  temp_rise_c_min: [0.02, 0.06],
};

// Live demo cycle: 40 s healthy → 30 s imbalance → 20 s healthy → 30 s impulsive → 20 s healthy → 30 s thermal (150 s total)
const CYCLE: { s: Phase; secs: number }[] = [
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

class DemoGen {
  seq = 0;
  temp = 38;
  boot = crypto.randomBytes(4).toString('hex');
  temps: [number, number][] = []; // [ts, temp] for the 60 s slope

  row(now: number, s: Phase, tempBias = 0): TelemetryRow {
    let rms = DEMO_BASE.rms_g[0] + gauss(0.004);
    let crest = DEMO_BASE.crest[0] + gauss(0.15);
    let kurt = DEMO_BASE.kurtosis[0] + gauss(0.12);
    let jitter = DEMO_BASE.jitter_pct[0] + gauss(0.03);
    let rpm = 1438 + gauss(1.5); // light load on the bench → speed near synchronous
    let iBase = 1.3;
    let tempTarget = 38 + tempBias;
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
      tempTarget = 70 + tempBias;
    }

    const dtS = this.temps.length ? Math.min(600, (now - this.temps[this.temps.length - 1][0]) / 1000) : 1;
    const rate = (s === 'thermal' ? 0.0008 : 0.002) * dtS;
    this.temp += (tempTarget - this.temp) * Math.min(1, rate) + gauss(0.003);
    this.temps.push([now, this.temp]);
    while (this.temps.length > 2 && now - this.temps[1][0] >= 60_000) this.temps.shift();
    const prev = this.temps[0];
    const trise = now - prev[0] >= 30_000 ? (this.temp - prev[1]) / ((now - prev[0]) / 60000) : 0.05;

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
      seq: ++this.seq,
      boot: this.boot,
      fw: 'demo',
      rpm,
      jitter_pct: f.jitter_pct,
      rms_g: rms,
      peak_g: peak,
      crest,
      kurtosis: kurt,
      temp_c: this.temp,
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
}
const liveDemo = new DemoGen();

function nextLivePhase(): Phase {
  if (demoScenario !== 'cycle') return demoScenario;
  cycleT++;
  if (cycleT >= CYCLE[cycleIdx].secs) {
    cycleT = 0;
    cycleIdx = (cycleIdx + 1) % CYCLE.length;
  }
  return CYCLE[cycleIdx].s;
}

/**
 * Fill the demo history with `days` of simulated rows (one per minute) so the 7-day and 30-day
 * views can be shown before the hardware exists. Story: healthy running with a daily
 * temperature swing, one imbalance episode about 10 days ago, and a short impulsive period
 * in the last two days. Everything is stored as DEMO.
 */
function backfillDemo(days: number) {
  const gen = new DemoGen();
  const end = Date.now() - 60_000;
  const start = end - days * 86400e3;
  let n = 0;
  for (let t = start; t < end; t += 60_000) {
    const ageD = (end - t) / 86400e3;
    const hour = new Date(t + S().tzOffsetMin * 60000).getUTCHours();
    let s: Phase = 'healthy';
    if (ageD > 9.6 && ageD < 10.2 && hour >= 10 && hour < 16) s = 'imbalance';
    if (ageD < 2 && hour >= 11 && hour < 13) s = 'impulsive';
    const bias = 3 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    const r = gen.row(t, s, bias);
    stores.demo.add(r, { live: false });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Alerts — derived from what the device reports (+ optional absolute limits set by the admin)
// ---------------------------------------------------------------------------
interface Alert {
  id: string;
  ts: number;
  source: Source;
  device_id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'health' | 'device' | 'sensor' | 'model' | 'data' | 'limit' | 'system';
  title: string;
  detail: string;
  ack?: { by: string; name: string; at: number; note: string } | null;
}
const alerts: Alert[] = readJson<Alert[]>('alerts.json', []);
const ALERT_CAP = 500;
const saveAlerts = () => writeJsonSoon('alerts.json', () => alerts, 3000);

interface Track<T> {
  committed: T;
  pending: T;
  count: number;
}
const tracks: Record<
  string,
  { cls: Track<string | null>; sev: Track<Severity>; lim: Record<string, Track<string>>; sensorsBad: string; q: string }
> = {};

function raise(a: Omit<Alert, 'id'>) {
  const alert: Alert = { id: crypto.randomBytes(6).toString('hex'), ack: null, ...a };
  alerts.push(alert);
  if (alerts.length > ALERT_CAP) alerts.shift();
  saveAlerts();
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
  if (t.count >= S().thresholds.debounceRows) {
    const from = t.committed;
    t.committed = next;
    t.count = 0;
    return { from };
  }
}

/** Every limit-checked value in a row: the built-in metrics plus admin custom parameters. */
function limitValues(r: TelemetryRow) {
  const out: { key: string; label: string; unit: string; v: number | null; l: any }[] = [];
  for (const k of METRIC_KEYS) {
    const p = S().params[k];
    const v =
      k === 'current'
        ? Math.max(...[r.i_l1_a, r.i_l2_a, r.i_l3_a].map((x) => (x === null ? -Infinity : x)))
        : (r[k as keyof TelemetryRow] as number | null);
    out.push({ key: k, label: p.label, unit: p.unit, v: Number.isFinite(v as number) ? (v as number) : null, l: p });
  }
  for (const c of S().customParams) out.push({ key: c.key, label: c.label, unit: c.unit, v: r.extra?.[c.key] ?? null, l: c });
  return out;
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
  const n = S().thresholds.debounceRows;

  let t = tracks[key];
  if (!t) {
    t = tracks[key] = {
      cls: { committed: r.cls, pending: r.cls, count: 0 },
      sev: { committed: sev, pending: sev, count: 0 },
      lim: {},
      sensorsBad,
      q,
    };
  } else {
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
            `Held for ${n} consecutive rows. A prediction is not a confirmed diagnosis — inspect the motor before acting.`,
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
            ? `Largest feature deviation |z| = ${r.z_max.toFixed(1)} (warning ≥ ${S().thresholds.zWarn}, critical ≥ ${S().thresholds.zCrit}), held for ${n} rows.`
            : 'Deviation value unavailable.',
      });
    }

    if (sensorsBad && sensorsBad !== t.sensorsBad) {
      raise({ ...base, severity: 'warning', category: 'sensor', title: 'Sensor reported a problem', detail: sensorsBad });
    }
    if (q && r.source === 'device' && q !== t.q) {
      raise({ ...base, severity: 'info', category: 'data', title: 'Data-quality flag on incoming row', detail: q });
    }
  }
  t.sensorsBad = sensorsBad;
  t.q = q;

  // Absolute limits (only for values the admin has given limits)
  for (const x of limitValues(r)) {
    const ls = limitSeverity(x.v, x.l);
    if (ls === null) continue;
    const tr = (t.lim[x.key] ||= { committed: ls, pending: ls, count: 0 });
    const c = step(tr, ls);
    if (c && (ls !== 'normal' || c.from !== 'normal')) {
      const lim = x.l;
      const parts = [
        lim.warnHigh !== null && `warning ≥ ${lim.warnHigh}`,
        lim.critHigh !== null && `critical ≥ ${lim.critHigh}`,
        lim.warnLow !== null && `warning ≤ ${lim.warnLow}`,
        lim.critLow !== null && `critical ≤ ${lim.critLow}`,
      ].filter(Boolean);
      raise({
        ...base,
        severity: ls === 'critical' ? 'critical' : ls === 'warning' ? 'warning' : 'info',
        category: 'limit',
        title: ls === 'normal' ? `${x.label} back within limits` : `${x.label} outside ${ls} limit`,
        detail: `${x.label} = ${x.v!.toFixed(3)} ${x.unit === '—' ? '' : x.unit} (limits set by the admin: ${parts.join(', ')}), held for ${n} rows.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// WebSocket — live rows, alerts, state; also used to sign a user out instantly
// ---------------------------------------------------------------------------
const sockets = new Map<WebSocket, string>(); // socket → session token
function broadcast(msg: unknown) {
  const s = JSON.stringify(msg);
  sockets.forEach((_t, ws) => ws.readyState === WebSocket.OPEN && ws.send(s));
}
function sendToUser(userId: string, msg: unknown) {
  const s = JSON.stringify(msg);
  sockets.forEach((token, ws) => {
    if (A.sessions.get(token)?.userId === userId && ws.readyState === WebSocket.OPEN) ws.send(s);
  });
}
A.onSessionEnd((s, reason) => {
  sockets.forEach((token, ws) => {
    if (token === s.token) {
      try {
        ws.send(JSON.stringify({ type: 'signed_out', reason }));
        ws.close(4001, 'signed out');
      } catch {}
      sockets.delete(ws);
    }
  });
});
const configChanged = () => {
  broadcast({ type: 'config', version: S().version });
  broadcast({ type: 'state', state: stateSnapshot() });
};

function activeSource(): Source {
  return demoRunning ? 'demo' : 'device';
}

function stateSnapshot() {
  const d = primaryDeviceId ? devices.get(primaryDeviceId) : undefined;
  const m = C.activeMotor();
  return {
    serverTime: Date.now(),
    schema: SCHEMA_VERSION,
    activeSource: activeSource(),
    demo: { running: demoRunning, scenario: demoScenario },
    deviceStatus: deviceStatus(),
    device: d ?? null,
    ingestionConfigured: !!DEVICE_KEY,
    thresholds: { zWarn: S().thresholds.zWarn, zCrit: S().thresholds.zCrit },
    staleAfterMs: S().staleAfterS * 1000,
    offlineAfterMs: S().offlineAfterS * 1000,
    configVersion: S().version,
    motor: m,
    acquisition: {
      ...ACQUISITION,
      shaftHz: (m.ratedRpm || 1400) / 60,
      revPeriodMs: 60000 / (m.ratedRpm || 1400),
    },
  };
}

let lastStatus: DeviceStatus = deviceStatus();
setInterval(() => {
  const now = Date.now();
  if (demoRunning) {
    const r = liveDemo.row(now, nextLivePhase());
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
        detail: `No data for ${S().offlineAfterS} s. Board B keeps logging to SD and re-sends when Wi-Fi returns.`,
      });
    }
    lastStatus = st;
  }
  broadcast({ type: 'state', state: stateSnapshot() });
}, 1000);

// Daily housekeeping: drop data older than the retention period
setInterval(() => Object.values(stores).forEach((s) => s.prune()), 3600e3);

if (DEMO_AUTOSTART) demoRunning = true;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
function meJson(a: { s: A.Session; u: A.User }) {
  return {
    ...A.publicUser(a.u),
    token: a.s.token,
    sid: a.s.sid,
    loginTime: a.s.createdAt,
    roleLabel: ROLE_LABEL[a.u.role],
    station: S().site.station,
    permissions: A.userPermissions(a.u),
  };
}

app.get('/api/auth/accounts', (_req, res) => {
  if (!S().showAccountsOnLogin) return res.json({ accounts: [] });
  res.json({
    accounts: [...A.users.values()]
      .filter((u) => u.enabled)
      .map((u) => ({ id: u.id, name: u.name, role: ROLE_LABEL[u.role] })),
  });
});

app.post(
  '/api/auth/login',
  h((req, res) => {
    const { id, password } = req.body || {};
    if (!id || !password) return res.status(400).json({ error: 'Enter your ID and password.' });
    const uid = String(id).trim().toUpperCase().slice(0, 20);
    const wait = A.lockedFor(uid);
    if (wait) {
      return res.status(429).json({ error: `Too many wrong passwords for ${uid}. Try again in ${Math.ceil(wait / 60000)} min, or ask the admin.` });
    }
    const u = A.users.get(uid);
    if (!u || !A.checkPassword(String(password), u.pwHash)) {
      A.noteFailure(uid);
      A.audit(u ? u : { id: uid, name: '—', role: '—' as any }, 'auth.failed', `Wrong ID or password for ${uid}`, undefined, req);
      return res.status(401).json({ error: 'That ID and password combination is not recognised.' });
    }
    if (!u.enabled) {
      A.audit(u, 'auth.blocked', 'Sign-in attempt on a disabled account', undefined, req);
      return res.status(403).json({ error: 'This account is disabled. Ask the admin to enable it.' });
    }
    A.clearFailures(uid);
    const s = A.createSession(u, req, S().sessionHours);
    u.lastLoginAt = Date.now();
    A.saveUsers();
    A.audit(u, 'auth.login', `Signed in as ${ROLE_LABEL[u.role]}`, { sid: s.sid }, req);
    res.json({ status: 'success', user: meJson({ s, u }) });
  }),
);

app.get('/api/auth/verify', A.requireAuth(), (req, res) => {
  res.json({ status: 'authenticated', user: meJson((req as A.AuthedRequest).auth) });
});

app.post('/api/auth/logout', (req, res) => {
  const t = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const a = A.sessionFromToken(t);
  if (a) {
    A.audit(a.u, 'auth.logout', 'Signed out', { sid: a.s.sid }, req);
    A.endSession(t, 'You signed out.');
  }
  res.json({ status: 'logged_out' });
});

app.post(
  '/api/me/password',
  A.requireAuth(),
  h((req, res) => {
    const { current, next } = req.body || {};
    if (!A.checkPassword(String(current || ''), req.auth.u.pwHash)) throw new HttpError(400, 'Your current password is not correct.');
    const p = A.passwordProblem(next);
    if (p) throw new HttpError(400, p);
    req.auth.u.pwHash = A.hashPassword(next);
    req.auth.u.pwChangedAt = Date.now();
    A.saveUsers();
    const n = A.endSessionsOf(req.auth.u.id, 'Your password was changed. Sign in again.', req.auth.s.token);
    A.audit(req.auth.u, 'user.password.self', 'Changed own password', { otherSessionsEnded: n }, req);
    res.json({ ok: true, otherSessionsEnded: n });
  }),
);

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
  const extraKeys = C.customKeys();

  rawRows.forEach((raw, index) => {
    const { row, error } = normalizeIncoming(raw, 'device', now, extraKeys);
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
// Dashboard data (signed in)
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'MHM dashboard', schema: SCHEMA_VERSION, uptimeS: Math.round(process.uptime()) });
});

app.get('/api/state', A.requireAuth(), (_req, res) => res.json(stateSnapshot()));
app.get('/api/config', A.requireAuth(), (_req, res) => res.json(C.publicConfig()));

function pickSource(q: unknown): Source {
  return q === 'demo' ? 'demo' : q === 'device' ? 'device' : activeSource();
}

app.get('/api/telemetry', A.requireAuth(), (req, res) => {
  const source = pickSource(req.query.source);
  const res_ = req.query.res === 'hist' ? 'hist' : 'live';
  const rows = stores[source][res_];
  const limit = Math.min(10_000, Math.max(1, parseInt(String(req.query.limit || '600'), 10) || 600));
  res.json({ source, resolution: res_, rows: rows.slice(-limit) });
});

/** Chart data for any range. Longer than 24 h needs the "history.long" permission. */
app.get(
  '/api/series',
  A.requireAuth(),
  h((req, res) => {
    const source = pickSource(req.query.source);
    const to = Math.min(Number(req.query.to) || Date.now(), Date.now() + 60e3);
    const from = Number(req.query.from) || to - 3600e3;
    if (from >= to) throw new HttpError(400, 'The start must be before the end.');
    const span = to - from;
    if (span > 24 * 3600e3 + 60e3 && !A.can(req.auth.u, 'history.long')) {
      throw new HttpError(403, 'Your role can view up to 24 hours. Ask the admin for 7-day and 30-day trends.');
    }
    if (span > (S().retentionDays + 1) * 86400e3) throw new HttpError(400, `Data is kept for ${S().retentionDays} days.`);
    const points = Math.min(2000, Math.max(50, Number(req.query.points) || 720));
    res.json({ source, from, to, ...stores[source].series(from, to, points) });
  }),
);

app.get('/api/alerts', A.requireAuth(), (_req, res) => res.json({ alerts: alerts.slice(-300) }));

app.post(
  '/api/alerts/:id/ack',
  A.requireAuth('alerts.ack'),
  h((req, res) => {
    const a = alerts.find((x) => x.id === req.params.id);
    if (!a) throw new HttpError(404, 'That alert is no longer held by the server.');
    if (a.ack) throw new HttpError(409, `Already acknowledged by ${a.ack.name}.`);
    const note = C.str(req.body?.note, 300, 'Note');
    a.ack = { by: req.auth.u.id, name: req.auth.u.name, at: Date.now(), note };
    saveAlerts();
    A.audit(req.auth.u, 'alert.ack', `Acknowledged “${a.title}”`, { alert: a.id, note }, req);
    broadcast({ type: 'alert_update', alert: a });
    res.json({ alert: a });
  }),
);

// ---------------------------------------------------------------------------
// Export — one day, or a date range ("selective export"), as CSV or Excel
// ---------------------------------------------------------------------------
app.get('/api/export/days', A.requireAuth('export.data'), (req, res) => {
  const source = pickSource(req.query.source);
  res.json({ source, days: stores[source].days(), tzOffsetMin: S().tzOffsetMin, retentionDays: S().retentionDays });
});

app.get(
  '/api/export',
  A.requireAuth('export.data'),
  h(async (req, res) => {
    const source = pickSource(req.query.source);
    const tz = S().tzOffsetMin;
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const d1 = C.date(req.query.day || req.query.from, 'From date', true);
    const d2 = req.query.day ? d1 : C.date(req.query.to, 'To date', true);
    if (d2 < d1) throw new HttpError(400, 'The “to” date must be on or after the “from” date.');
    const from = dayStart(d1, tz);
    const to = dayStart(d2, tz) + 86400e3 - 1;
    const days = Math.round((to + 1 - from) / 86400e3);
    if (days > S().retentionDays + 1) throw new HttpError(400, `Choose at most ${S().retentionDays} days.`);
    const stepS = [10, 60, 600, 3600].includes(Number(req.query.step)) ? Number(req.query.step) : 10;

    let columns = [...CSV_COLUMNS] as string[];
    if (req.query.columns) {
      const want = String(req.query.columns).split(',');
      columns = CSV_COLUMNS.filter((c) => c === 'timestamp_utc' || want.includes(c));
    }
    const extraAll = C.customKeys();
    const extraKeys = req.query.extra === '0' ? [] : req.query.columns ? extraAll.filter((k) => String(req.query.columns).split(',').includes(k)) : extraAll;

    const pick = function* () {
      let lastB = -1;
      for (const r of stores[source].range(from, to)) {
        const b = Math.floor(r.ts / (stepS * 1000));
        if (stepS > HIST_BUCKET_MS / 1000 && b === lastB) continue;
        lastB = b;
        yield r;
      }
    };
    let count = 0;
    for (const _ of pick()) count++;
    if (!count) {
      throw new HttpError(404, `No ${source === 'demo' ? 'demo' : 'device'} rows between ${d1} and ${d2}. Pick days that have data.`);
    }
    const who = source === 'demo' ? 'DEMO-DATA' : primaryDeviceId || C.activeMotor().id;
    const res_ = stepS === 10 ? '10s' : stepS === 60 ? '1min' : stepS === 600 ? '10min' : '1h';
    const name = `MHM_${who}_${d1 === d2 ? d1 : `${d1}_to_${d2}`}_${res_}_v${SCHEMA_VERSION}`;
    res.setHeader('X-Row-Count', String(count));
    res.setHeader('Access-Control-Expose-Headers', 'X-Row-Count, Content-Disposition');
    A.audit(req.auth.u, 'data.export', `Exported ${count} ${source} rows, ${d1}${d1 === d2 ? '' : ` → ${d2}`}, ${format.toUpperCase()}, ${res_}`, {
      source,
      columns: columns.length,
    }, req);
    await sendExport(res, pick(), {
      format,
      filename: name,
      columns,
      extraKeys,
      meta: {
        title: d1 === d2 ? `One day: ${d1}` : `Date range: ${d1} to ${d2}`,
        source,
        device: who,
        from,
        to,
        resolution: stepS === 10 ? 'One row per 10 s (as stored)' : `One measured row per ${res_} (others skipped, not averaged)`,
        generatedBy: `${req.auth.u.name} (${req.auth.u.id})`,
        tzOffsetMin: tz,
        schema: SCHEMA_VERSION,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Maintenance records
// ---------------------------------------------------------------------------
function maintenanceSummary() {
  const list = C.maintenance.filter((m) => m.motorId === S().activeMotorId);
  const last = list[0] ?? null;
  const today = dayKey(Date.now(), S().tzOffsetMin);
  const upcoming = list.filter((m) => m.nextDue).map((m) => m.nextDue).sort();
  const nextDue = upcoming.find((d) => d >= today) ?? upcoming[upcoming.length - 1] ?? null;
  return { last, nextDue, overdue: !!nextDue && nextDue < today, count: list.length, today };
}

app.get('/api/maintenance/summary', A.requireAuth(), (_req, res) => res.json(maintenanceSummary()));

/** Maintenance dates for chart markers (any signed-in user who can see charts). */
app.get('/api/maintenance/markers', A.requireAuth(), (_req, res) =>
  res.json({ markers: C.maintenance.filter((m) => m.motorId === S().activeMotorId).map((m) => ({ date: m.date, type: m.type, id: m.id })) }),
);

app.get('/api/maintenance', A.requireAuth('page.maintenance'), (_req, res) =>
  res.json({ records: C.maintenance, summary: maintenanceSummary(), types: undefined }),
);

app.post(
  '/api/maintenance',
  A.requireAuth('maintenance.edit'),
  h((req, res) => {
    const r = C.upsertMaintenance(req.body, req.auth.u.name);
    A.audit(req.auth.u, 'maintenance.add', `Added maintenance ${r.date}: ${r.type}`, { id: r.id, motor: r.motorId }, req);
    broadcast({ type: 'maintenance' });
    res.json({ record: r });
  }),
);

app.put(
  '/api/maintenance/:id',
  A.requireAuth('maintenance.edit'),
  h((req, res) => {
    const before = C.maintenance.find((x) => x.id === req.params.id);
    const prev = before ? { ...before } : null;
    const r = C.upsertMaintenance(req.body, req.auth.u.name, req.params.id);
    A.audit(req.auth.u, 'maintenance.edit', `Edited maintenance ${r.date}: ${r.type}`, { id: r.id, before: prev, after: r }, req);
    broadcast({ type: 'maintenance' });
    res.json({ record: r });
  }),
);

app.delete(
  '/api/maintenance/:id',
  A.requireAuth('maintenance.edit'),
  h((req, res) => {
    const r = C.deleteMaintenance(req.params.id);
    A.audit(req.auth.u, 'maintenance.delete', `Deleted maintenance ${r.date}: ${r.type}`, { record: r }, req);
    broadcast({ type: 'maintenance' });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Thresholds and limits (Engineer with permission, or Admin)
// ---------------------------------------------------------------------------
app.put(
  '/api/settings/thresholds',
  A.requireAuth('thresholds.edit'),
  h((req, res) => {
    const out: string[] = [];
    if (req.body?.thresholds) out.push(C.setThresholds(req.body.thresholds));
    if (req.body?.limits) {
      const merged: any = {};
      for (const k of METRIC_KEYS) {
        const l = req.body.limits[k];
        if (l) merged[k] = { ...S().params[k], warnHigh: l.warnHigh, critHigh: l.critHigh, warnLow: l.warnLow, critLow: l.critLow };
      }
      const ch = C.setParams(merged);
      if (ch.length) out.push(`limits changed for ${ch.join(', ')}`);
    }
    if (req.body?.customLimits) {
      const list = S().customParams.map((c) => {
        const l = req.body.customLimits[c.key];
        return l ? { ...c, warnHigh: l.warnHigh, critHigh: l.critHigh, warnLow: l.warnLow, critLow: l.critLow } : c;
      });
      out.push(C.setCustomParams(list));
    }
    A.audit(req.auth.u, 'settings.thresholds', out.join('; ') || 'No change', undefined, req);
    configChanged();
    res.json({ ok: true, config: C.publicConfig() });
  }),
);

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------
app.post(
  '/api/demo',
  A.requireAuth('demo.control'),
  h((req, res) => {
    const { action, scenario } = req.body || {};
    if (action === 'start') {
      if (deviceStatus() === 'LIVE') throw new HttpError(409, 'A real device is sending data. Demo mode is blocked while it is live.');
      demoRunning = true;
    } else if (action === 'stop') {
      demoRunning = false;
    }
    if (['cycle', 'healthy', 'imbalance', 'impulsive', 'thermal'].includes(scenario)) {
      demoScenario = scenario;
      cycleIdx = 0;
      cycleT = 0;
    }
    A.audit(req.auth.u, 'demo.control', `Demo ${action || 'scenario'}${scenario ? ` (${scenario})` : ''}`, undefined, req);
    broadcast({ type: 'state', state: stateSnapshot() });
    res.json(stateSnapshot());
  }),
);

// ---------------------------------------------------------------------------
// Administration (ADMIN only)
// ---------------------------------------------------------------------------
const admin = express.Router();
admin.use(A.requireAuth('admin'));

admin.get('/settings', (_req, res) => res.json({ settings: S(), activeMotor: C.activeMotor() }));

// --- users and sessions ---
function usersPayload(currentToken: string) {
  const now = Date.now();
  return {
    users: [...A.users.values()].map((u) => ({
      ...A.publicUser(u),
      permissions: permissionsFor(u.role, S().matrix),
      online: [...A.sessions.values()].some((s) => s.userId === u.id && now - s.lastSeen < 120e3),
    })),
    sessions: [...A.sessions.values()]
      .filter((s) => s.expiresAt > now)
      .map((s) => ({
        sid: s.sid,
        userId: s.userId,
        userName: A.users.get(s.userId)?.name ?? s.userId,
        role: A.users.get(s.userId)?.role ?? null,
        createdAt: s.createdAt,
        lastSeen: s.lastSeen,
        ip: s.ip,
        agent: s.agent,
        live: [...sockets.values()].includes(s.token),
        current: s.token === currentToken,
      }))
      .sort((a, b) => b.lastSeen - a.lastSeen),
  };
}

admin.get('/users', (req, res) => res.json(usersPayload((req as A.AuthedRequest).auth.s.token)));

admin.post(
  '/users',
  h((req, res) => {
    const b = req.body || {};
    const id = C.str(b.id, 20, 'User ID').toUpperCase();
    if (!A.USER_ID_RE.test(id)) throw new HttpError(400, 'User ID: 3–20 capital letters, digits or dashes, starting with a letter (for example OP-203).');
    if (A.users.has(id)) throw new HttpError(409, `${id} already exists.`);
    if (!A.isRole(b.role)) throw new HttpError(400, 'Choose a role.');
    const name = C.str(b.name, 60, 'Name');
    if (!name) throw new HttpError(400, 'Enter the person’s name.');
    const p = A.passwordProblem(b.password);
    if (p) throw new HttpError(400, p);
    const u: A.User = {
      id,
      name,
      role: b.role,
      roleTitle: C.str(b.roleTitle, 60, 'Job title') || ROLE_LABEL[b.role as keyof typeof ROLE_LABEL],
      initials: (C.str(b.initials, 3, 'Initials') || name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2)).toUpperCase(),
      enabled: true,
      pwHash: A.hashPassword(b.password),
      createdAt: Date.now(),
      lastLoginAt: null,
      pwChangedAt: Date.now(),
    };
    A.users.set(id, u);
    A.saveUsers();
    A.audit(req.auth.u, 'user.add', `Added ${id} (${name}) as ${ROLE_LABEL[u.role]}`, undefined, req);
    res.json(usersPayload(req.auth.s.token));
  }),
);

admin.put(
  '/users/:id',
  h((req, res) => {
    const u = A.users.get(req.params.id);
    if (!u) throw new HttpError(404, 'That user was not found.');
    const b = req.body || {};
    const before = A.publicUser(u);
    const self = u.id === req.auth.u.id;
    if (b.role !== undefined && !A.isRole(b.role)) throw new HttpError(400, 'Choose a role.');
    if (self && b.role && b.role !== 'ADMIN') throw new HttpError(400, 'You cannot remove your own admin role. Ask another admin.');
    if (self && b.enabled === false) throw new HttpError(400, 'You cannot disable your own account.');
    const losesAdmin = u.role === 'ADMIN' && ((b.role && b.role !== 'ADMIN') || b.enabled === false);
    if (losesAdmin && A.adminCount(u.id) === 0) throw new HttpError(400, 'At least one enabled admin account must remain.');
    if (b.name !== undefined) u.name = C.str(b.name, 60, 'Name') || u.name;
    if (b.roleTitle !== undefined) u.roleTitle = C.str(b.roleTitle, 60, 'Job title');
    if (b.initials !== undefined) u.initials = (C.str(b.initials, 3, 'Initials') || u.initials).toUpperCase();
    if (b.role) u.role = b.role;
    if (b.enabled !== undefined) u.enabled = !!b.enabled;
    A.saveUsers();
    const changes = Object.keys(before).filter((k) => (before as any)[k] !== (A.publicUser(u) as any)[k]);
    if (!u.enabled) A.endSessionsOf(u.id, 'Your account was disabled by the admin.');
    else if (changes.includes('role')) sendToUser(u.id, { type: 'me_changed' });
    A.audit(req.auth.u, 'user.edit', `Edited ${u.id}: ${changes.join(', ') || 'no change'}`, { before, after: A.publicUser(u) }, req);
    res.json(usersPayload(req.auth.s.token));
  }),
);

admin.post(
  '/users/:id/password',
  h((req, res) => {
    const u = A.users.get(req.params.id);
    if (!u) throw new HttpError(404, 'That user was not found.');
    const p = A.passwordProblem(req.body?.password);
    if (p) throw new HttpError(400, p);
    u.pwHash = A.hashPassword(req.body.password);
    u.pwChangedAt = Date.now();
    A.saveUsers();
    const n = A.endSessionsOf(u.id, 'Your password was reset by the admin. Sign in with the new password.', req.auth.s.token);
    A.audit(req.auth.u, 'user.password.reset', `Reset the password of ${u.id}`, { sessionsEnded: n }, req);
    res.json(usersPayload(req.auth.s.token));
  }),
);

admin.delete(
  '/users/:id',
  h((req, res) => {
    const u = A.users.get(req.params.id);
    if (!u) throw new HttpError(404, 'That user was not found.');
    if (u.id === req.auth.u.id) throw new HttpError(400, 'You cannot delete your own account.');
    if (u.role === 'ADMIN' && A.adminCount(u.id) === 0) throw new HttpError(400, 'At least one enabled admin account must remain.');
    A.endSessionsOf(u.id, 'Your account was removed by the admin.');
    A.users.delete(u.id);
    A.saveUsers();
    A.audit(req.auth.u, 'user.delete', `Deleted ${u.id} (${u.name})`, undefined, req);
    res.json(usersPayload(req.auth.s.token));
  }),
);

admin.post(
  '/users/:id/signout',
  h((req, res) => {
    const u = A.users.get(req.params.id);
    if (!u) throw new HttpError(404, 'That user was not found.');
    const n = A.endSessionsOf(u.id, 'You were signed out by the admin.', req.auth.s.token);
    A.audit(req.auth.u, 'session.end', `Signed out ${u.id} (${u.name}) from ${n} session${n === 1 ? '' : 's'}`, undefined, req);
    res.json(usersPayload(req.auth.s.token));
  }),
);

admin.delete(
  '/sessions/:sid',
  h((req, res) => {
    const s = [...A.sessions.values()].find((x) => x.sid === req.params.sid);
    if (!s) throw new HttpError(404, 'That session has already ended.');
    if (s.token === req.auth.s.token) throw new HttpError(400, 'This is your own session. Use “Sign out” at the top instead.');
    const u = A.users.get(s.userId);
    A.endSession(s.token, 'You were signed out by the admin.');
    A.audit(req.auth.u, 'session.end', `Signed out ${u?.id ?? s.userId} (${u?.name ?? '—'}), session ${s.sid}`, undefined, req);
    res.json(usersPayload(req.auth.s.token));
  }),
);

// --- motors, parameters, information, system, permissions ---
const done = (req: A.AuthedRequest, res: express.Response, action: string, summary: string, detail?: any) => {
  A.audit(req.auth.u, action, summary, detail, req);
  configChanged();
  res.json({ settings: S(), activeMotor: C.activeMotor() });
};

admin.post('/motors', h((req, res) => done(req, res, 'settings.motor', C.setMotor(req.body, true).summary)));
admin.put('/motors/:id', h((req, res) => done(req, res, 'settings.motor', C.setMotor({ ...req.body, id: req.params.id }, false).summary)));
admin.delete(
  '/motors/:id',
  h((req, res) => {
    C.deleteMotor(req.params.id);
    done(req, res, 'settings.motor', `Deleted motor ${req.params.id}`);
  }),
);
admin.post(
  '/motors/:id/activate',
  h((req, res) => {
    const { prev, motor } = C.setActiveMotor(req.params.id);
    raise({
      ts: Date.now(),
      source: activeSource(),
      device_id: primaryDeviceId || 'server',
      severity: 'warning',
      category: 'system',
      title: `Monitored motor changed to ${motor.name} (${motor.id})`,
      detail: `Changed by ${req.auth.u.name}. Capture a new healthy baseline on Board B before trusting z-scores and model outputs for this motor.`,
    });
    done(req, res, 'settings.motor.activate', `Active motor ${prev} → ${motor.id}`);
  }),
);
admin.put(
  '/params',
  h((req, res) => {
    const ch = C.setParams(req.body?.params);
    let s = ch.length ? `Changed ${ch.join(', ')}` : 'No change to built-in parameters';
    if (req.body?.customParams) s += '; ' + C.setCustomParams(req.body.customParams);
    done(req, res, 'settings.params', s);
  }),
);
admin.put('/thresholds', h((req, res) => done(req, res, 'settings.thresholds', C.setThresholds(req.body))));
admin.put('/system', h((req, res) => done(req, res, 'settings.system', C.setSystem(req.body))));
admin.put('/info', h((req, res) => done(req, res, 'settings.info', C.setInfo(req.body))));
admin.get('/permissions', (_req, res) => res.json({ matrix: S().matrix }));
admin.put(
  '/permissions',
  h((req, res) => {
    const { before, after } = C.setMatrix(req.body?.matrix);
    const diff: string[] = [];
    for (const role of ['OPERATOR', 'ENGINEER'] as const) {
      const add = after[role].filter((p) => !before[role].includes(p));
      const rem = before[role].filter((p) => !after[role].includes(p));
      if (add.length) diff.push(`${ROLE_LABEL[role]} +${add.join(', +')}`);
      if (rem.length) diff.push(`${ROLE_LABEL[role]} −${rem.join(', −')}`);
    }
    // Everyone re-reads their own permissions
    A.sessions.forEach((s) => sendToUser(s.userId, { type: 'me_changed' }));
    done(req, res, 'settings.permissions', diff.join('; ') || 'No change', { before, after });
  }),
);

// --- audit log ---
admin.get('/audit', (req, res) => {
  const user = String(req.query.user || '');
  const action = String(req.query.action || '');
  const list = A.auditLog
    .filter((e) => (!user || e.userId === user) && (!action || e.action.startsWith(action)))
    .slice(-1000)
    .reverse();
  res.json({ entries: list, total: A.auditLog.length });
});
admin.get('/audit.csv', (req, res) => {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="MHM_audit_${dayKey(Date.now(), S().tzOffsetMin)}.csv"`);
  res.write('timestamp_utc,user_id,user_name,role,action,summary,ip,detail\r\n');
  for (const e of A.auditLog) {
    res.write([new Date(e.ts).toISOString(), e.userId, e.userName, e.role, e.action, e.summary, e.ip, e.detail].map(esc).join(',') + '\r\n');
  }
  A.audit((req as A.AuthedRequest).auth.u, 'audit.export', 'Downloaded the audit log', undefined, req);
  res.end();
});

// --- data management ---
admin.get('/storage', (_req, res) =>
  res.json({
    dataDir: DATA_DIR,
    totalBytes: dirSizeBytes(DATA_DIR),
    device: stores.device.stats(),
    demo: stores.demo.stats(),
    retentionDays: S().retentionDays,
    renderFree: !!process.env.RENDER && !process.env.DATA_DIR,
  }),
);

admin.delete(
  '/buffer',
  h((req, res) => {
    const source = req.query.source === 'demo' ? 'demo' : 'device';
    const st = stores[source].stats();
    stores[source].clear();
    broadcast({ type: 'cleared', source });
    A.audit(req.auth.u, 'data.clear', `Cleared all ${source} history (${st.days} day files)`, undefined, req);
    res.json({ cleared: source, note: 'Server data only. The SD card on Board B is not affected.' });
  }),
);

admin.post(
  '/demo/backfill',
  h((req, res) => {
    const days = Math.round(C.num(req.body?.days ?? 30, 'Days', 1, Math.min(60, S().retentionDays))!);
    stores.demo.clear();
    const n = backfillDemo(days);
    A.audit(req.auth.u, 'demo.backfill', `Generated ${days} days of demo history (${n} rows, 1 per minute)`, undefined, req);
    broadcast({ type: 'cleared', source: 'demo' });
    res.json({ rows: n, days });
  }),
);

/** Import an SD-card CSV file from Board B (same columns) into the device history. */
admin.post(
  '/import',
  express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '25mb' }),
  h((req, res) => {
    const text = typeof req.body === 'string' ? req.body : '';
    if (!text.trim()) throw new HttpError(400, 'The file is empty. Choose a CSV file from the SD card.');
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const header = lines[0].split(',').map((x) => x.trim());
    if (!header.includes('timestamp_utc') || !header.includes('device_id')) {
      throw new HttpError(400, 'This does not look like an MHM SD-card file: the first line must contain timestamp_utc and device_id.');
    }
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    let bad = 0;
    const before = stores.device.stats().days;
    for (const line of lines.slice(1)) {
      const raw = csvLineToRaw(header, line);
      if (!raw || raw.ts === undefined) {
        bad++;
        continue;
      }
      const { row } = normalizeIncoming(raw, 'device', now, C.customKeys());
      if (!row || row.quality.some((q) => q.startsWith('ts_'))) {
        bad++;
        continue;
      }
      row.quality.push('imported_from_sd');
      if (stores.device.add(row, { live: false })) added++;
      else skipped++;
    }
    A.audit(req.auth.u, 'data.import', `Imported SD-card CSV: ${added} rows added, ${skipped} already present, ${bad} unreadable`, {
      lines: lines.length - 1,
    }, req);
    broadcast({ type: 'cleared', source: 'device' });
    res.json({ added, skipped, bad, daysBefore: before, daysAfter: stores.device.stats().days });
  }),
);

// --- backup / restore (settings, users with password hashes, maintenance) ---
admin.get('/backup', (req, res) => {
  const body = {
    kind: 'mhm-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    settings: S(),
    users: [...A.users.values()],
    maintenance: C.maintenance,
  };
  A.audit((req as A.AuthedRequest).auth.u, 'backup.download', 'Downloaded a settings backup', undefined, req);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="MHM_backup_${dayKey(Date.now(), S().tzOffsetMin)}.json"`);
  res.send(JSON.stringify(body, null, 1));
});

admin.post(
  '/restore',
  express.json({ limit: '5mb' }),
  h((req, res) => {
    const b = req.body;
    if (b?.kind !== 'mhm-backup' || !b.settings || !Array.isArray(b.users)) throw new HttpError(400, 'This is not an MHM backup file.');
    const list: A.User[] = b.users.filter((u: any) => u && A.USER_ID_RE.test(u.id) && A.isRole(u.role) && typeof u.pwHash === 'string');
    if (!list.some((u) => u.role === 'ADMIN' && u.enabled)) throw new HttpError(400, 'The backup has no enabled admin account, so it was not restored.');
    C.replaceAll(b.settings as Settings, (b.maintenance || []) as MaintenanceRecord[]);
    A.users.clear();
    list.forEach((u) => A.users.set(u.id, u));
    A.saveUsers();
    for (const s of [...A.sessions.values()]) {
      if (!A.users.has(s.userId) || s.token !== req.auth.s.token) A.endSession(s.token, 'Settings were restored from a backup. Sign in again.');
    }
    A.audit(A.users.get(req.auth.u.id) ?? req.auth.u, 'backup.restore', `Restored settings, ${list.length} users and ${(b.maintenance || []).length} maintenance records from a backup made ${b.createdAt}`, undefined, req);
    configChanged();
    res.json({ ok: true, stillSignedIn: A.users.has(req.auth.u.id) });
  }),
);

app.use('/api/admin', admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  const t0 = Date.now();
  const nd = await stores.device.loadFromDisk();
  const nm = await stores.demo.loadFromDisk();
  console.log(`Loaded ${nd} device and ${nm} demo rows from ${DATA_DIR} in ${Date.now() - t0} ms`);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://x');
    if (url.pathname !== '/ws') return; // leave other upgrades (e.g. Vite HMR) alone
    const token = url.searchParams.get('token');
    const a = A.sessionFromToken(token);
    if (!a) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(ws, a.s.token);
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const src = activeSource();
    ws.send(
      JSON.stringify({
        type: 'snapshot',
        state: stateSnapshot(),
        rows: stores[src].live.slice(-300),
        source: src,
        alerts: alerts.slice(-150),
      }),
    );
    ws.on('message', () => {
      const t = sockets.get(ws);
      if (t) A.sessionFromToken(t); // keeps "last seen" fresh
    });
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
