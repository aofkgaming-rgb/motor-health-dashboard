var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_https = __toESM(require("https"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_ws = require("ws");
var import_vite = require("vite");

// src/shared/contract.ts
var SCHEMA_VERSION = 1;
var FEATURE_KEYS = [
  "rms_g",
  "peak_g",
  "crest",
  "kurtosis",
  "jitter_pct",
  "temp_rise_c_min"
];
var LIMITS = {
  rpm: [0, 1e4],
  jitter_pct: [0, 100],
  rms_g: [0, 16],
  // ADXL345 full scale is ±16 g
  peak_g: [0, 16],
  crest: [0, 100],
  kurtosis: [0, 1e3],
  temp_c: [-40, 200],
  temp_rise_c_min: [-50, 50],
  i_l1_a: [0, 50],
  i_l2_a: [0, 50],
  i_l3_a: [0, 50],
  z_max: [0, 1e3]
};
var NUMERIC_FIELDS = Object.keys(LIMITS);
var EARLIEST_VALID_TS = Date.UTC(2024, 0, 1);
function toNum(v) {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : "bad";
}
function toStr(v, max) {
  if (v === null || v === void 0) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function normalizeIncoming(raw, source, nowMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "row must be a JSON object" };
  }
  const device_id = toStr(raw.device_id, 40);
  if (!device_id) return { error: "device_id is required" };
  const quality = [];
  let ts;
  const tsRaw = toNum(raw.ts);
  if (typeof tsRaw === "number") {
    ts = tsRaw < 1e11 ? tsRaw * 1e3 : tsRaw;
    if (ts < EARLIEST_VALID_TS || ts > nowMs + 5 * 60 * 1e3) {
      ts = nowMs;
      quality.push("ts_invalid_server_time_used");
    }
  } else {
    ts = nowMs;
    quality.push("ts_missing_server_time_used");
  }
  const row = {
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
    calibrated: raw.calibrated === true || raw.calibrated === 1 ? true : raw.calibrated === false || raw.calibrated === 0 ? false : null,
    sensors: null,
    quality
  };
  const seq = toNum(raw.seq);
  if (typeof seq === "number" && Number.isInteger(seq) && seq >= 0) row.seq = seq;
  for (const f of NUMERIC_FIELDS) {
    const v = toNum(raw[f]);
    if (v === "bad") {
      quality.push(`not_a_number:${String(f)}`);
      continue;
    }
    if (v === null) continue;
    const [lo, hi] = LIMITS[f];
    if (v < lo || v > hi) {
      quality.push(`out_of_range:${String(f)}`);
      continue;
    }
    row[f] = v;
  }
  const votes = toNum(raw.votes);
  const trees = toNum(raw.trees);
  if (typeof votes === "number" && typeof trees === "number" && trees > 0 && votes >= 0 && votes <= trees) {
    row.vote_share = votes / trees;
  }
  if (raw.z && typeof raw.z === "object") {
    const z = {};
    for (const k of FEATURE_KEYS) {
      const v = toNum(raw.z[k]);
      if (typeof v === "number") z[k] = v;
    }
    if (Object.keys(z).length) row.z = z;
  }
  if (raw.sensors && typeof raw.sensors === "object") {
    const s = {};
    for (const [k, v] of Object.entries(raw.sensors).slice(0, 12)) {
      const key = toStr(k, 16);
      const val = toStr(v, 16);
      if (key && val) s[key] = val.toLowerCase();
    }
    if (Object.keys(s).length) row.sensors = s;
  }
  return { row };
}
var Z_WARN = 3;
var Z_CRIT = 5;
function severityFromZ(z, calibrated) {
  if (calibrated === false) return "uncalibrated";
  if (z === null || z === void 0 || !Number.isFinite(z)) return "unavailable";
  const a = Math.abs(z);
  if (a >= Z_CRIT) return "critical";
  if (a >= Z_WARN) return "warning";
  return "normal";
}
var CSV_COLUMNS = [
  "timestamp_utc",
  "device_id",
  "source",
  "seq",
  "rpm",
  "jitter_pct",
  "rms_g",
  "peak_g",
  "crest",
  "kurtosis",
  "temp_c",
  "temp_rise_c_min",
  "i_l1_a",
  "i_l2_a",
  "i_l3_a",
  "class",
  "vote_share",
  "model",
  "z_max",
  "calibrated",
  "quality"
];
function csvCell(v) {
  if (v === null || v === void 0) return "";
  const s = typeof v === "number" ? String(Number(v.toPrecision(8))) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowToCsvLine(r) {
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
    r.quality.join(";")
  ].map(csvCell).join(",");
}
var MOTOR = {
  id: "MHM-BENCH-01",
  make: "Benn Electricals, Mumbai",
  type: "Three-phase squirrel-cage induction motor (TEFC)",
  power: "0.75 kW / 1.0 HP",
  voltage: "415 V, 3-phase, 50 Hz",
  connection: "Delta (as wired on the bench; nameplate shows star)",
  ratedCurrent: "2.0 A (line)",
  ratedRpm: 1400,
  poles: 4,
  frame: "80",
  insulation: "Class B"
};
var ACQUISITION = {
  vibrationSensor: "ADXL345 (3-axis MEMS accelerometer, I\xB2C)",
  sampleRateHz: 3200,
  featureWindowS: 1,
  jitterWindowRevs: 50,
  shaftHz: 1400 / 60,
  // 23.3 Hz
  revPeriodMs: 6e4 / 1400,
  // 42.9 ms
  kurtosisConvention: "Pearson (Gaussian = 3.0, not excess)",
  vibrationUnit: "g (acceleration)",
  inferenceLocation: "On-device: ESP32 Board B (Random Forest, exported to C++)"
};

// server.ts
var PORT = parseInt(process.env.PORT || "3000", 10);
var DEVICE_KEY = process.env.DEVICE_KEY || "";
var DEMO_AUTOSTART = (process.env.DEMO_AUTOSTART || "true") !== "false";
var STALE_AFTER_MS = 15e3;
var OFFLINE_AFTER_MS = 6e4;
var LIVE_CAP = 900;
var HIST_BUCKET_MS = 1e4;
var HIST_SPAN_MS = 24 * 3600 * 1e3;
var MAX_ROWS_PER_POST = 500;
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "1mb" }));
var RowStore = class _RowStore {
  constructor() {
    this.live = [];
    this.hist = [];
    this.buckets = /* @__PURE__ */ new Set();
  }
  static insertSorted(arr, r) {
    if (!arr.length || arr[arr.length - 1].ts <= r.ts) {
      arr.push(r);
      return;
    }
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (arr[mid].ts <= r.ts) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, r);
  }
  add(r) {
    _RowStore.insertSorted(this.live, r);
    while (this.live.length > LIVE_CAP) this.live.shift();
    const bucket = Math.floor(r.ts / HIST_BUCKET_MS);
    if (!this.buckets.has(bucket)) {
      this.buckets.add(bucket);
      _RowStore.insertSorted(this.hist, r);
    }
    const newest = this.hist[this.hist.length - 1]?.ts ?? r.ts;
    while (this.hist.length && this.hist[0].ts < newest - HIST_SPAN_MS) {
      const old = this.hist.shift();
      this.buckets.delete(Math.floor(old.ts / HIST_BUCKET_MS));
    }
  }
  clear() {
    this.live = [];
    this.hist = [];
    this.buckets.clear();
  }
};
var stores = { device: new RowStore(), demo: new RowStore() };
var seenKeys = /* @__PURE__ */ new Set();
var seenQueue = [];
function isDuplicate(r) {
  if (r.seq === null) return false;
  const key = `${r.device_id}|${r.boot ?? ""}|${r.seq}`;
  if (seenKeys.has(key)) return true;
  seenKeys.add(key);
  seenQueue.push(key);
  if (seenQueue.length > 5e4) seenKeys.delete(seenQueue.shift());
  return false;
}
var devices = /* @__PURE__ */ new Map();
var primaryDeviceId = null;
function deviceStatus(now = Date.now()) {
  const d = primaryDeviceId ? devices.get(primaryDeviceId) : void 0;
  if (!d) return "NEVER_CONNECTED";
  const age = now - d.lastSeen;
  if (age < STALE_AFTER_MS) return "LIVE";
  if (age < OFFLINE_AFTER_MS) return "STALE";
  return "OFFLINE";
}
var demoRunning = false;
var demoScenario = "cycle";
var demoSeq = 0;
var demoTemp = 38;
var demoBoot = import_crypto.default.randomBytes(4).toString("hex");
var DEMO_BASE = {
  rms_g: [0.05, 6e-3],
  peak_g: [0.17, 0.02],
  crest: [3.3, 0.25],
  kurtosis: [3, 0.2],
  jitter_pct: [0.2, 0.04],
  temp_rise_c_min: [0.02, 0.06]
};
var CYCLE = [
  { s: "healthy", secs: 40 },
  { s: "imbalance", secs: 30 },
  { s: "healthy", secs: 20 },
  { s: "impulsive", secs: 30 },
  { s: "healthy", secs: 20 },
  { s: "thermal", secs: 30 }
];
var cycleIdx = 0;
var cycleT = 0;
function gauss(sd) {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}
function demoRow(now) {
  let s;
  if (demoScenario === "cycle") {
    cycleT++;
    if (cycleT >= CYCLE[cycleIdx].secs) {
      cycleT = 0;
      cycleIdx = (cycleIdx + 1) % CYCLE.length;
    }
    s = CYCLE[cycleIdx].s;
  } else s = demoScenario;
  let rms = DEMO_BASE.rms_g[0] + gauss(4e-3);
  let crest = DEMO_BASE.crest[0] + gauss(0.15);
  let kurt = DEMO_BASE.kurtosis[0] + gauss(0.12);
  let jitter = DEMO_BASE.jitter_pct[0] + gauss(0.03);
  let rpm = 1438 + gauss(1.5);
  let iBase = 1.3;
  let tempTarget = 38;
  let cls = "Healthy";
  let votes = 44 + Math.round(gauss(2));
  if (s === "imbalance") {
    rms = 0.12 + gauss(8e-3);
    crest = 2.9 + gauss(0.12);
    jitter = 0.75 + gauss(0.08);
    cls = "Imbalance";
    votes = 39 + Math.round(gauss(3));
  } else if (s === "impulsive") {
    rms = 0.075 + gauss(6e-3);
    crest = 5.6 + gauss(0.4);
    kurt = 6.4 + gauss(0.5);
    cls = "Bearing fault";
    votes = 33 + Math.round(gauss(4));
  } else if (s === "thermal") {
    iBase = 2.3;
    rpm = 1395 + gauss(2);
    tempTarget = 70;
  }
  demoTemp += (tempTarget - demoTemp) * (s === "thermal" ? 8e-4 : 2e-3) + gauss(3e-3);
  const live = stores.demo.live;
  let prev;
  for (let i = live.length - 1; i >= 0; i--) {
    if (now - live[i].ts >= 6e4) {
      prev = live[i];
      break;
    }
  }
  const trise = prev && prev.temp_c !== null ? (demoTemp - prev.temp_c) / ((now - prev.ts) / 6e4) : 0.05;
  const peak = rms * crest;
  const f = {
    rms_g: rms,
    peak_g: peak,
    crest,
    kurtosis: kurt,
    jitter_pct: Math.max(0.02, jitter),
    temp_rise_c_min: trise
  };
  const z = {};
  let zmax = 0;
  for (const k of FEATURE_KEYS) {
    const [m, sd] = DEMO_BASE[k];
    z[k] = (f[k] - m) / sd;
    zmax = Math.max(zmax, Math.abs(z[k]));
  }
  return {
    ts: now,
    device_id: "DEMO",
    source: "demo",
    seq: ++demoSeq,
    boot: demoBoot,
    fw: "demo",
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
    model: "demo",
    z_max: zmax,
    z,
    calibrated: true,
    sensors: { adxl: "ok", mlx: "ok", hall: "ok", ct: "ok", sd: "ok", rtc: "ok" },
    quality: []
  };
}
var alerts = [];
var DEBOUNCE_ROWS = 3;
var tracks = {};
function raise(a) {
  const alert = { id: import_crypto.default.randomBytes(6).toString("hex"), ...a };
  alerts.push(alert);
  if (alerts.length > 300) alerts.shift();
  broadcast({ type: "alert", alert });
}
function step(t, next) {
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
function deriveAlerts(r) {
  const key = `${r.source}|${r.device_id}`;
  const sev = severityFromZ(r.z_max, r.calibrated);
  const sensorsBad = r.sensors ? Object.entries(r.sensors).filter(([, v]) => v !== "ok").map(([k, v]) => `${k}:${v}`).join(", ") : "";
  const q = r.quality.join(", ");
  const base = { ts: r.ts, source: r.source, device_id: r.device_id };
  const t = tracks[key];
  if (!t) {
    tracks[key] = {
      cls: { committed: r.cls, pending: r.cls, count: 0 },
      sev: { committed: sev, pending: sev, count: 0 },
      sensorsBad,
      q
    };
    return;
  }
  if (r.cls !== null) {
    const c = step(t.cls, r.cls);
    if (c) {
      const healthy = /^healthy$/i.test(r.cls);
      raise({
        ...base,
        severity: healthy ? "info" : "warning",
        category: "model",
        title: `Model output changed: ${c.from ?? "\u2014"} \u2192 ${r.cls}`,
        detail: (r.vote_share !== null ? `${Math.round(r.vote_share * 100)}% of trees agree. ` : "") + `Held for ${DEBOUNCE_ROWS} consecutive rows. A prediction is not a confirmed diagnosis \u2014 inspect the motor before acting.`
      });
    }
  }
  const bad = (x) => x === "warning" || x === "critical";
  const sc = step(t.sev, sev);
  if (sc && (bad(sev) || sev === "normal" && bad(sc.from))) {
    raise({
      ...base,
      severity: sev === "critical" ? "critical" : sev === "warning" ? "warning" : "info",
      category: "health",
      title: `Baseline deviation ${sc.from} \u2192 ${sev}`,
      detail: r.z_max !== null ? `Largest feature deviation |z| = ${r.z_max.toFixed(1)} (warning \u2265 ${Z_WARN}, critical \u2265 ${Z_CRIT}), held for ${DEBOUNCE_ROWS} rows.` : "Deviation value unavailable."
    });
  }
  if (sensorsBad && sensorsBad !== t.sensorsBad) {
    raise({ ...base, severity: "warning", category: "sensor", title: "Sensor reported a problem", detail: sensorsBad });
  }
  if (q && r.source === "device" && q !== t.q) {
    raise({ ...base, severity: "info", category: "data", title: "Data-quality flag on incoming row", detail: q });
  }
  t.sensorsBad = sensorsBad;
  t.q = q;
}
var sockets = /* @__PURE__ */ new Set();
function broadcast(msg) {
  const s = JSON.stringify(msg);
  sockets.forEach((ws) => ws.readyState === import_ws.WebSocket.OPEN && ws.send(s));
}
function activeSource() {
  return demoRunning ? "demo" : "device";
}
function stateSnapshot() {
  const d = primaryDeviceId ? devices.get(primaryDeviceId) : void 0;
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
    acquisition: ACQUISITION
  };
}
var lastStatus = deviceStatus();
setInterval(() => {
  const now = Date.now();
  if (demoRunning) {
    const r = demoRow(now);
    stores.demo.add(r);
    deriveAlerts(r);
    broadcast({ type: "rows", source: "demo", rows: [r] });
  }
  const st = deviceStatus(now);
  if (st !== lastStatus && primaryDeviceId) {
    if (st === "OFFLINE") {
      raise({
        ts: now,
        source: "device",
        device_id: primaryDeviceId,
        severity: "warning",
        category: "device",
        title: "Device offline",
        detail: `No data for ${OFFLINE_AFTER_MS / 1e3} s. Board B keeps logging to SD and re-sends when Wi-Fi returns.`
      });
    }
    lastStatus = st;
  }
  broadcast({ type: "state", state: stateSnapshot() });
}, 1e3);
if (DEMO_AUTOSTART) demoRunning = true;
var REGISTERED_USERS = {
  "ENG-101": {
    id: "ENG-101",
    password: "password123",
    name: "Jeet",
    role: "ENGINEER",
    roleTitle: "Lead Reliability Engineer",
    station: "Motor Test Bench 01",
    initials: "JT"
  },
  "OP-202": {
    id: "OP-202",
    password: "password123",
    name: "Dhruchit",
    role: "OPERATOR",
    roleTitle: "Plant Condition Operator",
    station: "Motor Test Bench 01",
    initials: "DH"
  },
  "ADMIN-001": {
    id: "ADMIN-001",
    password: "admin123",
    name: "Manav Sinh",
    role: "ADMIN",
    roleTitle: "Systems Administrator",
    station: "Motor Test Bench 01",
    initials: "MV"
  }
};
var sessions = /* @__PURE__ */ new Map();
function sessionFromToken(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return s;
}
function bearer(req) {
  const h = req.headers["authorization"];
  return h ? h.replace(/^Bearer\s+/i, "").trim() : null;
}
function requireAuth(roles) {
  return (req, res, next) => {
    const s = sessionFromToken(bearer(req));
    if (!s) return res.status(401).json({ error: "Your session has expired. Sign in again." });
    if (roles && !roles.includes(s.user.role)) {
      return res.status(403).json({ error: `This action needs one of these roles: ${roles.join(", ")}.` });
    }
    req.session = s;
    next();
  };
}
app.post("/api/auth/login", (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: "Enter your ID and password." });
  const user = REGISTERED_USERS[String(id).trim().toUpperCase()];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "That ID and password combination is not recognised." });
  }
  const { password: _pw, ...pub } = user;
  const token = import_crypto.default.randomBytes(32).toString("hex");
  sessions.set(token, { user: pub, token, expiresAt: Date.now() + 24 * 3600 * 1e3 });
  res.json({ status: "success", user: { ...pub, token, loginTime: Date.now() } });
});
app.get("/api/auth/verify", (req, res) => {
  const s = sessionFromToken(bearer(req));
  if (!s) return res.status(401).json({ error: "Session expired or invalid" });
  res.json({ status: "authenticated", user: { ...s.user, token: s.token, loginTime: Date.now() } });
});
app.post("/api/auth/logout", (req, res) => {
  const t = bearer(req) || req.body?.token;
  if (t) sessions.delete(t);
  res.json({ status: "logged_out" });
});
app.post("/api/v1/telemetry", (req, res) => {
  if (!DEVICE_KEY) {
    return res.status(503).json({ error: "DEVICE_KEY is not set on the server. Add it in Render \u2192 Environment." });
  }
  const key = String(req.headers["x-device-key"] || "");
  const a = Buffer.from(key);
  const b = Buffer.from(DEVICE_KEY);
  if (a.length !== b.length || !import_crypto.default.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Invalid or missing X-Device-Key header." });
  }
  const body = req.body;
  const rawRows = Array.isArray(body?.rows) ? body.rows : body ? [body] : [];
  if (!rawRows.length) return res.status(400).json({ error: 'Send one row object or { "rows": [...] }.' });
  if (rawRows.length > MAX_ROWS_PER_POST) {
    return res.status(413).json({ error: `At most ${MAX_ROWS_PER_POST} rows per request.` });
  }
  const now = Date.now();
  const accepted = [];
  const errors = [];
  let duplicates = 0;
  rawRows.forEach((raw, index) => {
    const { row, error } = normalizeIncoming(raw, "device", now);
    if (!row) {
      errors.push({ index, error });
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
        rowsRejected: 0
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
    const wasOnline = lastStatus === "LIVE" || lastStatus === "STALE";
    primaryDeviceId = accepted[accepted.length - 1].device_id;
    if (demoRunning) {
      demoRunning = false;
      raise({
        ts: now,
        source: "device",
        device_id: primaryDeviceId,
        severity: "info",
        category: "device",
        title: "Live device data received \u2014 demo stopped",
        detail: "The dashboard now shows only real measurements from the device."
      });
    } else if (!wasOnline) {
      raise({
        ts: now,
        source: "device",
        device_id: primaryDeviceId,
        severity: "info",
        category: "device",
        title: "Device online",
        detail: `Receiving data from ${primaryDeviceId}.`
      });
    }
    lastStatus = deviceStatus(now);
    broadcast({ type: "rows", source: "device", rows: accepted });
  }
  const pd = primaryDeviceId ? devices.get(primaryDeviceId) : void 0;
  if (pd && errors.length) pd.rowsRejected += errors.length;
  res.status(errors.length && !accepted.length ? 400 : 200).json({
    accepted: accepted.length,
    duplicates,
    rejected: errors.length,
    errors: errors.slice(0, 20),
    schema: SCHEMA_VERSION
  });
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "MHM dashboard", schema: SCHEMA_VERSION, uptimeS: Math.round(process.uptime()) });
});
app.get("/api/state", requireAuth(), (_req, res) => res.json(stateSnapshot()));
function pickSource(q) {
  return q === "demo" ? "demo" : q === "device" ? "device" : activeSource();
}
app.get("/api/telemetry", requireAuth(), (req, res) => {
  const source = pickSource(req.query.source);
  const res_ = req.query.res === "hist" ? "hist" : "live";
  const rows = stores[source][res_];
  const limit = Math.min(1e4, Math.max(1, parseInt(String(req.query.limit || "600"), 10) || 600));
  res.json({ source, resolution: res_, rows: rows.slice(-limit) });
});
app.get("/api/alerts", requireAuth(), (_req, res) => res.json({ alerts: alerts.slice(-200) }));
app.get("/api/export.csv", requireAuth(), (req, res) => {
  const source = pickSource(req.query.source);
  const res_ = req.query.res === "live" ? "live" : "hist";
  const from = Number(req.query.from) || 0;
  const to = Number(req.query.to) || Number.MAX_SAFE_INTEGER;
  const rows = stores[source][res_].filter((r) => r.ts >= from && r.ts <= to);
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const who = source === "demo" ? "DEMO-DATA" : primaryDeviceId || "device";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="MHM_${who}_${res_ === "hist" ? "10s" : "full"}_${stamp}_v${SCHEMA_VERSION}.csv"`
  );
  res.setHeader("X-Row-Count", String(rows.length));
  res.write(CSV_COLUMNS.join(",") + "\r\n");
  for (const r of rows) res.write(rowToCsvLine(r) + "\r\n");
  res.end();
});
app.post("/api/demo", requireAuth(["ENGINEER", "ADMIN"]), (req, res) => {
  const { action, scenario } = req.body || {};
  if (action === "start") {
    if (deviceStatus() === "LIVE") {
      return res.status(409).json({ error: "A real device is sending data. Demo mode is blocked while it is live." });
    }
    demoRunning = true;
  } else if (action === "stop") {
    demoRunning = false;
  }
  if (["cycle", "healthy", "imbalance", "impulsive", "thermal"].includes(scenario)) {
    demoScenario = scenario;
    cycleIdx = 0;
    cycleT = 0;
  }
  broadcast({ type: "state", state: stateSnapshot() });
  res.json(stateSnapshot());
});
app.delete("/api/buffer", requireAuth(["ADMIN"]), (req, res) => {
  const source = req.query.source === "demo" ? "demo" : "device";
  const n = stores[source].hist.length;
  stores[source].clear();
  broadcast({ type: "cleared", source });
  res.json({ cleared: source, historyRowsRemoved: n, note: "Server memory only. The SD card on Board B is not affected." });
});
async function start() {
  const server = import_http.default.createServer(app);
  const wss = new import_ws.WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://x");
    if (url.pathname !== "/ws") return;
    const s = sessionFromToken(url.searchParams.get("token"));
    if (!s) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    sockets.add(ws);
    const src = activeSource();
    ws.send(
      JSON.stringify({
        type: "snapshot",
        state: stateSnapshot(),
        rows: stores[src].live.slice(-300),
        source: src,
        alerts: alerts.slice(-100)
      })
    );
    ws.on("close", () => sockets.delete(ws));
    ws.on("error", () => sockets.delete(ws));
  });
  const distPath = import_fs.default.existsSync(import_path.default.join(process.cwd(), "dist", "index.html")) ? import_path.default.join(process.cwd(), "dist") : __dirname;
  if (import_fs.default.existsSync(import_path.default.join(distPath, "index.html"))) {
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => res.sendFile(import_path.default.join(distPath, "index.html")));
  } else {
    const vite = await (0, import_vite.createServer)({ server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
    app.use(vite.middlewares);
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`MHM dashboard server on http://0.0.0.0:${PORT}`);
    if (!DEVICE_KEY) console.warn("DEVICE_KEY not set \u2014 device ingestion is disabled until it is configured.");
    const publicUrl = process.env.RENDER_EXTERNAL_URL;
    if (publicUrl) {
      setInterval(() => {
        try {
          (publicUrl.startsWith("https") ? import_https.default : import_http.default).get(`${publicUrl}/api/health`, (r) => r.resume()).on("error", () => {
          });
        } catch {
        }
      }, 14 * 60 * 1e3);
    }
  });
}
start();
//# sourceMappingURL=server.cjs.map
