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
var import_path3 = __toESM(require("path"), 1);
var import_fs4 = __toESM(require("fs"), 1);
var import_crypto3 = __toESM(require("crypto"), 1);
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
function normalizeIncoming(raw, source, nowMs, extraKeys = []) {
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
  if (extraKeys.length) {
    const extra = {};
    for (const k of extraKeys) {
      const v = toNum(raw[k]);
      if (typeof v === "number") extra[k] = v;
      else if (v === "bad") quality.push(`not_a_number:${k}`);
    }
    if (Object.keys(extra).length) row.extra = extra;
  }
  return { row };
}
var Z_WARN = 3;
var Z_CRIT = 5;
var THRESHOLDS = { zWarn: Z_WARN, zCrit: Z_CRIT };
function severityFromZ(z, calibrated, t = THRESHOLDS) {
  if (calibrated === false) return "uncalibrated";
  if (z === null || z === void 0 || !Number.isFinite(z)) return "unavailable";
  const a = Math.abs(z);
  if (a >= t.zCrit) return "critical";
  if (a >= t.zWarn) return "warning";
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
function csvHeader(extraKeys = [], columns = CSV_COLUMNS) {
  return [...columns, ...extraKeys].join(",");
}
function rowToCells(r) {
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
  ];
}
function rowToCsvLine(r, extraKeys = [], columns = CSV_COLUMNS) {
  const all = rowToCells(r);
  const cells = columns.map((c) => all[CSV_COLUMNS.indexOf(c)]);
  for (const k of extraKeys) cells.push(r.extra?.[k] ?? null);
  return cells.map(csvCell).join(",");
}
function csvLineToRaw(header, line) {
  const cells = [];
  let cur = "";
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
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  if (cells.length < 2) return null;
  const o = {};
  header.forEach((h2, i) => o[h2.trim()] = cells[i] ?? "");
  const raw = { ...o };
  if (o.timestamp_utc) {
    const t = Date.parse(o.timestamp_utc.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(o.timestamp_utc) ? o.timestamp_utc : o.timestamp_utc + "Z");
    raw.ts = Number.isFinite(t) ? t : void 0;
  }
  if (o.class !== void 0) raw.cls = o.class;
  if (o.vote_share !== void 0 && o.vote_share !== "") {
    raw.votes = Math.round(Number(o.vote_share) * 1e3);
    raw.trees = 1e3;
  }
  if (o.calibrated !== void 0 && o.calibrated !== "") raw.calibrated = o.calibrated === "1" || o.calibrated === "true";
  return raw;
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

// src/shared/rbac.ts
var ROLES = ["OPERATOR", "ENGINEER", "ADMIN"];
var ROLE_LABEL = {
  OPERATOR: "Operator",
  ENGINEER: "Engineer",
  ADMIN: "Admin"
};
var PERMISSIONS = [
  { key: "page.parameters", label: "Parameters page", help: "Detailed view of each health parameter", group: "Pages" },
  { key: "page.ai", label: "Edge AI page", help: "Model output, tree agreement and prediction log", group: "Pages" },
  { key: "page.history", label: "History & export page", help: "Trend charts and the data table", group: "Pages" },
  { key: "page.maintenance", label: "Maintenance page", help: "Maintenance records (view)", group: "Pages" },
  { key: "page.device", label: "Device page", help: "Device status, sensors, wiring and packet format", group: "Pages" },
  { key: "history.long", label: "7-day and 30-day trends", help: "Without this, charts are limited to 24 hours", group: "Data" },
  { key: "export.data", label: "Export data (CSV / Excel)", help: "One-day and date-range exports", group: "Data" },
  { key: "alerts.ack", label: "Acknowledge alerts", help: "Mark an alert as seen and add a note", group: "Actions" },
  { key: "maintenance.edit", label: "Add and edit maintenance", help: "Record, change or delete maintenance entries", group: "Actions" },
  { key: "demo.control", label: "Control the demo", help: "Start, stop and change the demo scenario", group: "Actions" },
  { key: "thresholds.edit", label: "Change alarm thresholds", help: "Baseline z-score and absolute limits", group: "Actions" }
];
var ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key);
var DEFAULT_MATRIX = {
  OPERATOR: ["page.parameters", "page.maintenance", "alerts.ack"],
  ENGINEER: [
    "page.parameters",
    "page.ai",
    "page.history",
    "page.device",
    "page.maintenance",
    "history.long",
    "export.data",
    "alerts.ack",
    "maintenance.edit",
    "demo.control"
  ]
};
function permissionsFor(role, matrix) {
  if (role === "ADMIN") return [...ALL_PERMISSIONS];
  return (matrix[role] || []).filter((p) => ALL_PERMISSIONS.includes(p));
}

// src/shared/settings.ts
var METRIC_KEYS = [
  "rms_g",
  "peak_g",
  "crest",
  "kurtosis",
  "jitter_pct",
  "temp_rise_c_min",
  "rpm",
  "temp_c",
  "current"
];
var CUSTOM_KEY_RE = /^[a-z][a-z0-9_]{1,30}$/;
var NO_LIMITS = { warnHigh: null, critHigh: null, warnLow: null, critLow: null };
var DEFAULT_PARAMS = {
  rms_g: { label: "RMS vibration", unit: "g", decimals: 3, what: "", why: "", ...NO_LIMITS },
  peak_g: { label: "Peak vibration", unit: "g", decimals: 3, what: "", why: "", ...NO_LIMITS },
  crest: { label: "Crest factor", unit: "\u2014", decimals: 2, what: "", why: "", ...NO_LIMITS },
  kurtosis: { label: "Kurtosis", unit: "\u2014", decimals: 2, what: "", why: "", ...NO_LIMITS },
  jitter_pct: { label: "Revolution jitter", unit: "%", decimals: 3, what: "", why: "", ...NO_LIMITS },
  temp_rise_c_min: { label: "Temperature rise rate", unit: "\xB0C/min", decimals: 2, what: "", why: "", ...NO_LIMITS },
  rpm: { label: "Shaft speed", unit: "rpm", decimals: 0, what: "", why: "", ...NO_LIMITS },
  temp_c: { label: "Surface temperature", unit: "\xB0C", decimals: 1, what: "", why: "", ...NO_LIMITS },
  current: { label: "Phase current (highest of L1\u2013L3)", unit: "A", decimals: 2, what: "", why: "", ...NO_LIMITS }
};
var DEFAULT_MOTOR = {
  id: MOTOR.id,
  name: "Bench motor 01",
  make: MOTOR.make,
  type: MOTOR.type,
  power: MOTOR.power,
  voltage: MOTOR.voltage,
  connection: MOTOR.connection,
  ratedCurrentA: 2,
  ratedRpm: MOTOR.ratedRpm,
  poles: MOTOR.poles,
  frame: MOTOR.frame,
  insulation: MOTOR.insulation,
  location: "EEE lab, test bench 01",
  installedOn: "",
  notes: ""
};
var DEFAULT_DEVICE_INFO = {
  boardA: [
    ["ADXL345", "SDA / SCL", "GPIO21 / GPIO22 (I\xB2C bus 0, 400 kHz) \xB7 SDO\u2192GND (0x53) \xB7 CS\u21923V3"],
    ["MLX90614", "SDA / SCL", "GPIO25 / GPIO26 (I\xB2C bus 1, 100 kHz) \xB7 VIN 3.3 V"],
    ["A3144 Hall", "OUT", "GPIO27, internal pull-up to 3.3 V, falling-edge interrupt \xB7 VCC from VIN (5 V) \xB7 no 5 V pull-up"],
    ["ZMCT103C L1", "AO", "22 k\u03A9 / 15 k\u03A9 divider + 33 nF \u2192 GPIO34 (ADC1)"],
    ["ZMCT103C L2", "AO", "22 k\u03A9 / 15 k\u03A9 divider + 33 nF \u2192 GPIO35 (ADC1)"],
    ["ZMCT103C L3", "AO", "22 k\u03A9 / 15 k\u03A9 divider + 33 nF \u2192 GPIO32 (ADC1)"],
    ["UART to Board B", "TX2", "GPIO17 \u2192 Board B GPIO16 \xB7 115200 baud \xB7 common GND"]
  ],
  boardB: [
    ["OLED SSD1306", "SDA / SCL", "GPIO21 / GPIO22 (0x3C)"],
    ["DS3231 RTC", "SDA / SCL", "GPIO21 / GPIO22 shared (0x68)"],
    ["microSD", "CS / SCK / MISO / MOSI", "GPIO5 / 18 / 19 / 23 \xB7 VCC 5 V"],
    ["UART from Board A", "RX2", "GPIO16 \u2190 Board A GPIO17"]
  ],
  notes: "Measure each CT module\u2019s AO voltage with a multimeter before connecting it to a GPIO. With 22 k\u03A9 / 15 k\u03A9 a 5 V signal becomes about 2.0 V at the pin."
};
var DEFAULT_MODEL = {
  algorithm: "Random Forest (exported to C++ with micromlgen)",
  classes: "Healthy, Imbalance (MaFaulDa normal + imbalance)",
  trainedOn: "Not trained yet",
  validation: "Not available \u2014 training in progress"
};
function defaultSettings() {
  return {
    version: 1,
    site: { plantName: "Navrachana University \xB7 EEE lab", station: "Motor Test Bench 01" },
    motors: [{ ...DEFAULT_MOTOR }],
    activeMotorId: DEFAULT_MOTOR.id,
    params: JSON.parse(JSON.stringify(DEFAULT_PARAMS)),
    customParams: [],
    thresholds: { zWarn: 3, zCrit: 5, debounceRows: 3 },
    staleAfterS: 15,
    offlineAfterS: 60,
    retentionDays: 31,
    tzOffsetMin: 330,
    sessionHours: 24,
    showAccountsOnLogin: true,
    matrix: JSON.parse(JSON.stringify(DEFAULT_MATRIX)),
    deviceInfo: JSON.parse(JSON.stringify(DEFAULT_DEVICE_INFO)),
    model: { ...DEFAULT_MODEL }
  };
}
function dayKey(ts, tzOffsetMin) {
  return new Date(ts + tzOffsetMin * 6e4).toISOString().slice(0, 10);
}
function dayStart(day, tzOffsetMin) {
  return Date.parse(`${day}T00:00:00Z`) - tzOffsetMin * 6e4;
}
function limitSeverity(v, l) {
  if (v === null || v === void 0 || !Number.isFinite(v)) return null;
  const any = l.warnHigh !== null || l.critHigh !== null || l.warnLow !== null || l.critLow !== null;
  if (!any) return null;
  if (l.critHigh !== null && v >= l.critHigh || l.critLow !== null && v <= l.critLow) return "critical";
  if (l.warnHigh !== null && v >= l.warnHigh || l.warnLow !== null && v <= l.warnLow) return "warning";
  return "normal";
}

// server/persist.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var DATA_DIR = import_path.default.resolve(process.env.DATA_DIR || import_path.default.join(process.cwd(), "data"));
import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
function dataPath(...p) {
  return import_path.default.join(DATA_DIR, ...p);
}
function readJson(file, fallback) {
  try {
    return JSON.parse(import_fs.default.readFileSync(dataPath(file), "utf8"));
  } catch {
    return fallback;
  }
}
function writeJsonNow(file, data) {
  const full = dataPath(file);
  import_fs.default.mkdirSync(import_path.default.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  import_fs.default.writeFileSync(tmp, JSON.stringify(data, null, 1));
  import_fs.default.renameSync(tmp, full);
}
var pending = /* @__PURE__ */ new Map();
function writeJsonSoon(file, get, ms = 2e3) {
  if (pending.has(file)) return;
  pending.set(
    file,
    setTimeout(() => {
      pending.delete(file);
      try {
        writeJsonNow(file, get());
      } catch (e) {
        console.error(`Could not save ${file}:`, e.message);
      }
    }, ms)
  );
}
function appendLine(file, line) {
  const full = dataPath(file);
  import_fs.default.mkdirSync(import_path.default.dirname(full), { recursive: true });
  import_fs.default.appendFileSync(full, line + "\n");
}
function dirSizeBytes(dir) {
  let n = 0;
  try {
    for (const e of import_fs.default.readdirSync(dir, { withFileTypes: true })) {
      const p = import_path.default.join(dir, e.name);
      n += e.isDirectory() ? dirSizeBytes(p) : import_fs.default.statSync(p).size;
    }
  } catch {
  }
  return n;
}

// server/rowsdb.ts
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_readline = __toESM(require("readline"), 1);
var LIVE_CAP = 900;
var HIST_BUCKET_MS = 1e4;
var HIST_SPAN_MS = 24 * 3600 * 1e3;
var LONG_BUCKET_MS = 6e4;
var NUM_FIELDS = [
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
  "vote_share",
  "z_max"
];
function r6(v) {
  return v === null || v === void 0 ? null : Number(v.toPrecision(6));
}
function encode(r) {
  return JSON.stringify([
    r.ts,
    r.device_id,
    r.seq,
    r.boot,
    r.fw,
    ...NUM_FIELDS.map((k) => r6(r[k])),
    r.cls,
    r.model,
    r.calibrated === null ? null : r.calibrated ? 1 : 0,
    r.z ? FEATURE_KEYS.map((k) => r6(r.z[k] ?? null)) : null,
    r.quality.length ? r.quality : 0,
    r.extra && Object.keys(r.extra).length ? r.extra : 0
  ]);
}
function decode(line, source) {
  try {
    const a = JSON.parse(line);
    const row = { ts: a[0], device_id: a[1], source, seq: a[2], boot: a[3], fw: a[4] };
    NUM_FIELDS.forEach((k, i) => row[k] = a[5 + i]);
    const o = 5 + NUM_FIELDS.length;
    row.cls = a[o];
    row.model = a[o + 1];
    row.calibrated = a[o + 2] === null ? null : a[o + 2] === 1;
    if (Array.isArray(a[o + 3])) {
      const z = {};
      FEATURE_KEYS.forEach((k, i) => a[o + 3][i] !== null && (z[k] = a[o + 3][i]));
      row.z = z;
    } else row.z = null;
    row.quality = Array.isArray(a[o + 4]) ? a[o + 4] : [];
    row.extra = a[o + 5] && typeof a[o + 5] === "object" ? a[o + 5] : null;
    row.sensors = null;
    return row;
  } catch {
    return null;
  }
}
function insertSorted(arr, r) {
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
function slim(r) {
  return { ...r, sensors: null, boot: null, fw: null, quality: [] };
}
var RowStore = class {
  constructor(source, cfg2) {
    this.source = source;
    this.cfg = cfg2;
    this.live = [];
    this.hist = [];
    this.long = [];
    this.histBuckets = /* @__PURE__ */ new Set();
    this.longBuckets = /* @__PURE__ */ new Set();
    this.dir = dataPath("rows", source);
    import_fs2.default.mkdirSync(this.dir, { recursive: true });
  }
  fileFor(day) {
    return import_path2.default.join(this.dir, `${day}.ndjson`);
  }
  /** Add a row. `persist` = also write to the day file (false while loading from disk). */
  /** Returns true when the row was stored (false = its 10 s slot was already filled). */
  add(r, opts = {}) {
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
      if (persist) import_fs2.default.appendFileSync(this.fileFor(dayKey(r.ts, this.cfg().tzOffsetMin)), encode(r) + "\n");
      const newest = Math.max(this.hist[this.hist.length - 1]?.ts ?? 0, Date.now());
      if (r.ts >= newest - HIST_SPAN_MS) {
        insertSorted(this.hist, r);
        while (this.hist.length && this.hist[0].ts < newest - HIST_SPAN_MS) {
          this.histBuckets.delete(Math.floor(this.hist.shift().ts / HIST_BUCKET_MS));
        }
      }
    }
    const lb = Math.floor(r.ts / LONG_BUCKET_MS);
    if (!this.longBuckets.has(lb)) {
      this.longBuckets.add(lb);
      const keepFrom = Date.now() - this.cfg().retentionDays * 864e5;
      if (r.ts >= keepFrom) insertSorted(this.long, slim(r));
    }
    return stored;
  }
  /** Remove everything older than the retention period (memory and day files). */
  prune() {
    const { retentionDays, tzOffsetMin } = this.cfg();
    const keepFrom = Date.now() - retentionDays * 864e5;
    while (this.long.length && this.long[0].ts < keepFrom) {
      this.longBuckets.delete(Math.floor(this.long.shift().ts / LONG_BUCKET_MS));
    }
    const firstDay = dayKey(keepFrom, tzOffsetMin);
    for (const d of this.days()) if (d < firstDay) import_fs2.default.rmSync(this.fileFor(d), { force: true });
  }
  clear() {
    this.live = [];
    this.hist = [];
    this.long = [];
    this.histBuckets.clear();
    this.longBuckets.clear();
    for (const d of this.days()) import_fs2.default.rmSync(this.fileFor(d), { force: true });
  }
  /** Calendar days that have a day file, oldest first. */
  days() {
    try {
      return import_fs2.default.readdirSync(this.dir).filter((f) => /^\d{4}-\d\d-\d\d\.ndjson$/.test(f)).map((f) => f.slice(0, 10)).sort();
    } catch {
      return [];
    }
  }
  /** Rows of one day file, sorted, duplicates (same 10 s bucket) removed. */
  readDay(day) {
    let text = "";
    try {
      text = import_fs2.default.readFileSync(this.fileFor(day), "utf8");
    } catch {
      return [];
    }
    const rows = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      const r = decode(line, this.source);
      if (r) rows.push(r);
    }
    rows.sort((a, b) => a.ts - b.ts);
    const seen = /* @__PURE__ */ new Set();
    return rows.filter((r) => {
      const b = Math.floor(r.ts / HIST_BUCKET_MS);
      if (seen.has(b)) return false;
      seen.add(b);
      return true;
    });
  }
  /** All stored rows between two timestamps, day by day (for exports). */
  *range(from, to) {
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
    const firstDay = dayKey(Date.now() - retentionDays * 864e5, tzOffsetMin);
    let n = 0;
    for (const d of this.days()) {
      if (d < firstDay) continue;
      const rl = import_readline.default.createInterface({ input: import_fs2.default.createReadStream(this.fileFor(d)) });
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
        bytes += import_fs2.default.statSync(this.fileFor(d)).size;
      } catch {
      }
    }
    return {
      liveRows: this.live.length,
      histRows: this.hist.length,
      longRows: this.long.length,
      days: days.length,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
      diskBytes: bytes
    };
  }
  /** Rows for a chart: picks the finest tier that covers the span, then averages into ≤ `points` buckets. */
  series(from, to, points) {
    const span = to - from;
    const tier = span <= 15 * 6e4 + 5e3 ? this.live : span <= HIST_SPAN_MS + 6e4 ? this.hist : this.long;
    const tierName = tier === this.live ? "live" : tier === this.hist ? "hist" : "long";
    const src = tier.filter((r) => r.ts >= from && r.ts <= to);
    const step2 = Math.max(1, Math.ceil(span / Math.max(10, points)));
    if (src.length <= points) return { tier: tierName, bucketMs: null, rows: src };
    return { tier: tierName, bucketMs: step2, rows: aggregate(src, step2) };
  }
};
function aggregate(rows, step2) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const b = Math.floor(rows[i].ts / step2);
    let j = i;
    while (j < rows.length && Math.floor(rows[j].ts / step2) === b) j++;
    const grp = rows.slice(i, j);
    const last = grp[grp.length - 1];
    const o = { ...last, ts: grp[0].ts, sensors: null, quality: [] };
    for (const k of NUM_FIELDS) {
      if (k === "z_max") continue;
      let s = 0;
      let n = 0;
      for (const r of grp) {
        const v = r[k];
        if (v !== null && v !== void 0) {
          s += v;
          n++;
        }
      }
      o[k] = n ? s / n : null;
    }
    let zm = null;
    const z = {};
    const extra = {};
    const exN = {};
    for (const r of grp) {
      if (r.z_max !== null) zm = Math.max(zm ?? 0, r.z_max);
      if (r.z) {
        for (const k of FEATURE_KEYS) if (r.z[k] !== void 0) z[k] = Math.max(Math.abs(z[k] ?? 0), Math.abs(r.z[k]));
      }
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

// server/exporter.ts
var import_exceljs = __toESM(require("exceljs"), 1);
async function sendExport(res, rows, opts) {
  const { format, filename, columns, extraKeys, meta } = opts;
  let count = 0;
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    res.write(csvHeader(extraKeys, columns) + "\r\n");
    for (const r of rows) {
      res.write(rowToCsvLine(r, extraKeys, columns) + "\r\n");
      count++;
    }
    res.end();
    return count;
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  const wb = new import_exceljs.default.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  wb.creator = "MHM dashboard";
  const ws = wb.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  const tzLabel = `local_time_utc${meta.tzOffsetMin >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(meta.tzOffsetMin) / 60)).padStart(2, "0")}:${String(Math.abs(meta.tzOffsetMin) % 60).padStart(2, "0")}`;
  const header = [...columns, ...extraKeys];
  const hasTs = columns.includes("timestamp_utc");
  ws.columns = [
    ...hasTs ? [{ header: tzLabel, key: "_local", width: 20, style: { numFmt: "yyyy-mm-dd hh:mm:ss" } }] : [],
    ...header.map((h2) => ({
      header: h2,
      key: h2,
      width: h2 === "timestamp_utc" ? 20 : Math.max(9, h2.length + 2),
      style: h2 === "timestamp_utc" ? { numFmt: "yyyy-mm-dd hh:mm:ss" } : {}
    }))
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();
  for (const r of rows) {
    const all = rowToCells(r);
    const cells = [];
    if (hasTs) cells.push(new Date(r.ts + meta.tzOffsetMin * 6e4));
    for (const c of columns) {
      if (c === "timestamp_utc") cells.push(new Date(r.ts));
      else cells.push(all[CSV_COLUMNS.indexOf(c)] ?? null);
    }
    for (const k of extraKeys) cells.push(r.extra?.[k] ?? null);
    ws.addRow(cells).commit();
    count++;
  }
  ws.commit();
  const about = wb.addWorksheet("About");
  about.columns = [
    { header: "Item", key: "k", width: 22 },
    { header: "Value", key: "v", width: 70 }
  ];
  about.getRow(1).font = { bold: true };
  const fmt = (t) => new Date(t + meta.tzOffsetMin * 6e4).toISOString().replace("T", " ").slice(0, 19);
  [
    ["Export", meta.title],
    ["Data source", meta.source === "demo" ? "DEMO \u2014 simulated by the server, not measured" : "Device (measured)"],
    ["Device", meta.device],
    ["From (local)", fmt(meta.from)],
    ["To (local)", fmt(meta.to)],
    ["Resolution", meta.resolution],
    ["Rows", String(count)],
    ["Generated by", meta.generatedBy],
    ["Generated at (local)", fmt(Date.now())],
    ["Schema version", String(meta.schema)],
    ["Notes", "Empty cells are missing values, never 0. Same columns as the SD-card log on Board B, plus a local-time column."]
  ].forEach(([k, v]) => about.addRow({ k, v }).commit());
  about.commit();
  await wb.commit();
  return count;
}

// server/auth.ts
var import_crypto = __toESM(require("crypto"), 1);
var import_fs3 = __toESM(require("fs"), 1);
function hashPassword(pw) {
  const salt = import_crypto.default.randomBytes(16).toString("hex");
  const h2 = import_crypto.default.scryptSync(pw, salt, 32).toString("hex");
  return `scrypt$${salt}$${h2}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, h2] = stored.split("$");
  if (alg !== "scrypt" || !salt || !h2) return false;
  const a = import_crypto.default.scryptSync(pw, salt, 32);
  const b = Buffer.from(h2, "hex");
  return a.length === b.length && import_crypto.default.timingSafeEqual(a, b);
}
function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Use at least 8 characters for the password.";
  if (pw.length > 128) return "Use at most 128 characters for the password.";
  return null;
}
var SEED = [
  { id: "ADMIN-001", name: "Manav Sinh", role: "ADMIN", roleTitle: "Systems Administrator", initials: "MV", pw: "admin123" },
  { id: "ENG-101", name: "Jeet", role: "ENGINEER", roleTitle: "Lead Reliability Engineer", initials: "JT", pw: "password123" },
  { id: "OP-202", name: "Dhruchit", role: "OPERATOR", roleTitle: "Plant Condition Operator", initials: "DH", pw: "password123" }
];
var users = /* @__PURE__ */ new Map();
function loadUsers() {
  const list = readJson("users.json", null);
  if (list && list.length) list.forEach((u) => users.set(u.id, u));
  else {
    const now = Date.now();
    for (const s of SEED) {
      users.set(s.id, {
        id: s.id,
        name: s.name,
        role: s.role,
        roleTitle: s.roleTitle,
        initials: s.initials,
        enabled: true,
        pwHash: hashPassword(s.pw),
        createdAt: now,
        lastLoginAt: null,
        pwChangedAt: null
      });
    }
    saveUsers();
  }
}
function saveUsers() {
  writeJsonSoon("users.json", () => [...users.values()], 200);
}
function publicUser(u) {
  const { pwHash: _h, ...p } = u;
  return p;
}
function adminCount(except) {
  return [...users.values()].filter((u) => u.role === "ADMIN" && u.enabled && u.id !== except).length;
}
var USER_ID_RE = /^[A-Z][A-Z0-9-]{2,19}$/;
function isRole(r) {
  return ROLES.includes(r);
}
var sessions = /* @__PURE__ */ new Map();
var onEnd = () => {
};
function onSessionEnd(fn) {
  onEnd = fn;
}
function createSession(u, req, hours) {
  const s = {
    token: import_crypto.default.randomBytes(32).toString("hex"),
    sid: import_crypto.default.randomBytes(4).toString("hex"),
    userId: u.id,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    expiresAt: Date.now() + hours * 36e5,
    ip: clientIp(req),
    agent: String(req.headers["user-agent"] || "").slice(0, 160)
  };
  sessions.set(s.token, s);
  return s;
}
function endSession(token, reason) {
  const s = sessions.get(token);
  if (!s) return;
  sessions.delete(token);
  onEnd(s, reason);
}
function endSessionsOf(userId, reason, exceptToken) {
  let n = 0;
  for (const s of [...sessions.values()]) {
    if (s.userId === userId && s.token !== exceptToken) {
      endSession(s.token, reason);
      n++;
    }
  }
  return n;
}
function sessionFromToken(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  const u = users.get(s.userId);
  if (Date.now() > s.expiresAt || !u || !u.enabled) {
    endSession(token, "expired");
    return null;
  }
  s.lastSeen = Date.now();
  return { s, u };
}
function clientIp(req) {
  const f = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (f || req.socket.remoteAddress || "").replace(/^::ffff:/, "").slice(0, 45);
}
function bearer(req) {
  const h2 = req.headers["authorization"];
  return h2 ? h2.replace(/^Bearer\s+/i, "").trim() : null;
}
var failures = /* @__PURE__ */ new Map();
function lockedFor(id) {
  const f = failures.get(id);
  return f && f.until > Date.now() ? f.until - Date.now() : 0;
}
function noteFailure(id) {
  const f = failures.get(id) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) {
    f.until = Date.now() + 5 * 6e4;
    f.n = 0;
  }
  failures.set(id, f);
}
function clearFailures(id) {
  failures.delete(id);
}
var getMatrix = () => ({ OPERATOR: [], ENGINEER: [] });
function useMatrix(fn) {
  getMatrix = fn;
}
function userPermissions(u) {
  return permissionsFor(u.role, getMatrix());
}
function can(u, p) {
  if (u.role === "ADMIN") return true;
  if (p === "admin") return false;
  return userPermissions(u).includes(p);
}
function requireAuth(perm) {
  return (req, res, next) => {
    const a = sessionFromToken(bearer(req));
    if (!a) return res.status(401).json({ error: "Your session has ended. Sign in again." });
    if (perm && !can(a.u, perm)) {
      audit(a.u, "access.denied", `${req.method} ${req.path}`, { perm }, req);
      return res.status(403).json({ error: perm === "admin" ? "Only the admin can do this." : "Your role does not include this. Ask the admin to change your permissions." });
    }
    req.auth = a;
    next();
  };
}
var auditLog = [];
var AUDIT_MEM = 3e3;
function loadAudit() {
  try {
    const lines = import_fs3.default.readFileSync(dataPath("audit.ndjson"), "utf8").trim().split("\n").slice(-AUDIT_MEM);
    for (const l of lines) {
      try {
        auditLog.push(JSON.parse(l));
      } catch {
      }
    }
  } catch {
  }
}
var onAudit = () => {
};
function audit(u, action, summary, detail, req) {
  const e = {
    id: import_crypto.default.randomBytes(6).toString("hex"),
    ts: Date.now(),
    userId: u?.id ?? "\u2014",
    userName: u?.name ?? "\u2014",
    role: u?.role ?? "\u2014",
    action,
    summary,
    detail,
    ip: req ? clientIp(req) : ""
  };
  auditLog.push(e);
  if (auditLog.length > AUDIT_MEM) auditLog.shift();
  try {
    appendLine("audit.ndjson", JSON.stringify(e));
  } catch {
  }
  onAudit(e);
}

// server/config.ts
var import_crypto2 = __toESM(require("crypto"), 1);
var InputError = class extends Error {
};
function str(v, max, field = "value") {
  if (v === null || v === void 0) return "";
  if (typeof v !== "string" && typeof v !== "number") throw new InputError(`${field} must be text.`);
  return String(v).trim().slice(0, max);
}
function num(v, field, min = -1e9, max = 1e9) {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InputError(`${field} must be a number.`);
  if (n < min || n > max) throw new InputError(`${field} must be between ${min} and ${max}.`);
  return n;
}
function reqNum(v, field, min, max) {
  const n = num(v, field, min, max);
  if (n === null) throw new InputError(`Enter a value for ${field}.`);
  return n;
}
function date(v, field, required = false) {
  const s = str(v, 10, field);
  if (!s) {
    if (required) throw new InputError(`Choose a date for ${field}.`);
    return "";
  }
  if (!/^\d{4}-\d\d-\d\d$/.test(s) || !Number.isFinite(Date.parse(s))) throw new InputError(`${field} must be a date (YYYY-MM-DD).`);
  return s;
}
function limits(v, label) {
  const l = {
    warnHigh: num(v?.warnHigh, `${label} warning-high`),
    critHigh: num(v?.critHigh, `${label} critical-high`),
    warnLow: num(v?.warnLow, `${label} warning-low`),
    critLow: num(v?.critLow, `${label} critical-low`)
  };
  if (l.warnHigh !== null && l.critHigh !== null && l.critHigh < l.warnHigh)
    throw new InputError(`${label}: the critical-high limit must be at or above the warning-high limit.`);
  if (l.warnLow !== null && l.critLow !== null && l.critLow > l.warnLow)
    throw new InputError(`${label}: the critical-low limit must be at or below the warning-low limit.`);
  return l;
}
var settings = defaultSettings();
function loadSettings() {
  const saved = readJson("settings.json", null);
  const d = defaultSettings();
  if (saved) {
    settings = {
      ...d,
      ...saved,
      site: { ...d.site, ...saved.site || {} },
      thresholds: { ...d.thresholds, ...saved.thresholds || {} },
      params: Object.fromEntries(METRIC_KEYS.map((k) => [k, { ...d.params[k], ...saved.params?.[k] || {} }])),
      matrix: { ...d.matrix, ...saved.matrix || {} },
      deviceInfo: { ...d.deviceInfo, ...saved.deviceInfo || {} },
      model: { ...d.model, ...saved.model || {} },
      motors: saved.motors?.length ? saved.motors : d.motors,
      customParams: saved.customParams || []
    };
    if (!settings.motors.some((m) => m.id === settings.activeMotorId)) settings.activeMotorId = settings.motors[0].id;
  }
  applyThresholds();
}
function saveSettings() {
  settings.version++;
  applyThresholds();
  writeJsonSoon("settings.json", () => settings, 200);
}
function applyThresholds() {
  THRESHOLDS.zWarn = settings.thresholds.zWarn;
  THRESHOLDS.zCrit = settings.thresholds.zCrit;
}
function activeMotor() {
  return settings.motors.find((m) => m.id === settings.activeMotorId) || settings.motors[0];
}
function customKeys() {
  return settings.customParams.map((c) => c.key);
}
function publicConfig() {
  const { matrix: _m, ...rest } = settings;
  return { ...rest, activeMotor: activeMotor() };
}
function setMotor(input, isNew) {
  const id = str(input?.id, 24, "Motor ID").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(id)) throw new InputError("Motor ID: use 2\u201324 letters, digits or dashes, for example MHM-BENCH-02.");
  const exists = settings.motors.findIndex((m2) => m2.id === id);
  if (isNew && exists >= 0) throw new InputError(`A motor with ID ${id} already exists.`);
  if (!isNew && exists < 0) throw new InputError(`Motor ${id} was not found.`);
  const name = str(input?.name, 60, "Name");
  if (!name) throw new InputError("Enter a name for the motor.");
  const m = {
    id,
    name,
    make: str(input?.make, 80, "Make"),
    type: str(input?.type, 120, "Type"),
    power: str(input?.power, 40, "Power"),
    voltage: str(input?.voltage, 60, "Supply"),
    connection: str(input?.connection, 80, "Connection"),
    ratedCurrentA: num(input?.ratedCurrentA, "Rated current", 0, 1e3),
    ratedRpm: num(input?.ratedRpm, "Rated speed", 0, 3e4),
    poles: num(input?.poles, "Poles", 2, 48),
    frame: str(input?.frame, 30, "Frame"),
    insulation: str(input?.insulation, 30, "Insulation"),
    location: str(input?.location, 80, "Location"),
    installedOn: date(input?.installedOn, "Installed on"),
    notes: str(input?.notes, 500, "Notes")
  };
  if (isNew) settings.motors.push(m);
  else settings.motors[exists] = m;
  saveSettings();
  return { motor: m, summary: `${isNew ? "Added" : "Updated"} motor ${id} (${name})` };
}
function setActiveMotor(id) {
  const m = settings.motors.find((x) => x.id === id);
  if (!m) throw new InputError("That motor was not found.");
  const prev = settings.activeMotorId;
  settings.activeMotorId = id;
  saveSettings();
  return { prev, motor: m };
}
function deleteMotor(id) {
  if (id === settings.activeMotorId) throw new InputError("Make another motor active before deleting this one.");
  const i = settings.motors.findIndex((x) => x.id === id);
  if (i < 0) throw new InputError("That motor was not found.");
  settings.motors.splice(i, 1);
  saveSettings();
}
function setParams(input) {
  const changed = [];
  for (const k of METRIC_KEYS) {
    const v = input?.[k];
    if (!v) continue;
    const label = str(v.label, 60, `${k} label`) || DEFAULT_PARAMS[k].label;
    const p = {
      label,
      unit: str(v.unit, 12, `${label} unit`) || DEFAULT_PARAMS[k].unit,
      decimals: reqNum(v.decimals ?? DEFAULT_PARAMS[k].decimals, `${label} decimals`, 0, 6),
      what: str(v.what, 800, `${label} description`),
      why: str(v.why, 800, `${label} reason`),
      ...limits(v, label)
    };
    if (JSON.stringify(p) !== JSON.stringify(settings.params[k])) changed.push(k);
    settings.params[k] = p;
  }
  if (changed.length) saveSettings();
  return changed;
}
var RESERVED = /* @__PURE__ */ new Set([
  "ts",
  "device_id",
  "source",
  "seq",
  "boot",
  "fw",
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
  "cls",
  "votes",
  "trees",
  "model",
  "z_max",
  "z",
  "calibrated",
  "sensors",
  "quality",
  "class",
  "vote_share",
  "timestamp_utc",
  "extra"
]);
function setCustomParams(list) {
  if (!Array.isArray(list)) throw new InputError("Send the list of custom parameters.");
  if (list.length > 12) throw new InputError("At most 12 custom parameters.");
  const seen = /* @__PURE__ */ new Set();
  const out = list.map((v) => {
    const key = str(v?.key, 31, "Field name").toLowerCase();
    if (!CUSTOM_KEY_RE.test(key)) throw new InputError(`Field name "${key}": use lower-case letters, digits and _ , starting with a letter.`);
    if (RESERVED.has(key)) throw new InputError(`"${key}" is already a standard field. Choose another name.`);
    if (seen.has(key)) throw new InputError(`"${key}" is listed twice.`);
    seen.add(key);
    const label = str(v?.label, 60, "Label") || key;
    return {
      key,
      label,
      unit: str(v?.unit, 12, "Unit"),
      decimals: reqNum(v?.decimals ?? 2, `${label} decimals`, 0, 6),
      what: str(v?.what, 800, "Description"),
      ...limits(v, label)
    };
  });
  const before = customKeys().join(",");
  settings.customParams = out;
  saveSettings();
  return `Custom parameters: ${before || "none"} \u2192 ${out.map((c) => c.key).join(",") || "none"}`;
}
function setThresholds(input) {
  const zWarn = reqNum(input?.zWarn, "Warning |z|", 0.5, 50);
  const zCrit = reqNum(input?.zCrit, "Critical |z|", 0.5, 100);
  if (zCrit <= zWarn) throw new InputError("The critical |z| must be larger than the warning |z|.");
  const debounceRows = Math.round(reqNum(input?.debounceRows ?? settings.thresholds.debounceRows, "Rows to confirm", 1, 30));
  const prev = { ...settings.thresholds };
  settings.thresholds = { zWarn, zCrit, debounceRows };
  saveSettings();
  return `z warning ${prev.zWarn}\u2192${zWarn}, critical ${prev.zCrit}\u2192${zCrit}, confirm rows ${prev.debounceRows}\u2192${debounceRows}`;
}
function setSystem(input) {
  const changes = [];
  const set = (k, v) => {
    if (JSON.stringify(settings[k]) !== JSON.stringify(v)) changes.push(`${String(k)}: ${JSON.stringify(settings[k])} \u2192 ${JSON.stringify(v)}`);
    settings[k] = v;
  };
  if (input?.site) set("site", { plantName: str(input.site.plantName, 80, "Plant name"), station: str(input.site.station, 80, "Station") });
  if (input?.retentionDays !== void 0) set("retentionDays", Math.round(reqNum(input.retentionDays, "Keep data for (days)", 1, 120)));
  if (input?.tzOffsetMin !== void 0) set("tzOffsetMin", Math.round(reqNum(input.tzOffsetMin, "Time-zone offset (minutes)", -720, 840)));
  if (input?.sessionHours !== void 0) set("sessionHours", reqNum(input.sessionHours, "Session length (hours)", 1, 720));
  if (input?.staleAfterS !== void 0) set("staleAfterS", Math.round(reqNum(input.staleAfterS, "Stale after (s)", 3, 600)));
  if (input?.offlineAfterS !== void 0) set("offlineAfterS", Math.round(reqNum(input.offlineAfterS, "Offline after (s)", 5, 3600)));
  if (settings.offlineAfterS <= settings.staleAfterS) throw new InputError("\u201COffline after\u201D must be longer than \u201CStale after\u201D.");
  if (input?.showAccountsOnLogin !== void 0) set("showAccountsOnLogin", !!input.showAccountsOnLogin);
  if (changes.length) saveSettings();
  return changes.join("; ") || "No change";
}
function setInfo(input) {
  const rows = (v, label) => {
    if (!Array.isArray(v)) throw new InputError(`${label}: send a list of rows.`);
    if (v.length > 30) throw new InputError(`${label}: at most 30 rows.`);
    return v.map((r) => [str(r?.[0], 40, "Module"), str(r?.[1], 40, "Pin"), str(r?.[2], 200, "Connection")]).filter((r) => r[0] || r[1] || r[2]);
  };
  if (input?.deviceInfo) {
    settings.deviceInfo = {
      boardA: rows(input.deviceInfo.boardA, "Board A"),
      boardB: rows(input.deviceInfo.boardB, "Board B"),
      notes: str(input.deviceInfo.notes, 1e3, "Notes")
    };
  }
  if (input?.model) {
    const m = {
      algorithm: str(input.model.algorithm, 120, "Algorithm"),
      classes: str(input.model.classes, 200, "Classes"),
      trainedOn: str(input.model.trainedOn, 200, "Trained on"),
      validation: str(input.model.validation, 300, "Validation")
    };
    settings.model = m;
  }
  saveSettings();
  return [input?.deviceInfo && "device information", input?.model && "model information"].filter(Boolean).join(" and ") + " updated";
}
function setMatrix(input) {
  const clean = (v) => Array.isArray(v) ? [...new Set(v.filter((p) => ALL_PERMISSIONS.includes(p)))] : [];
  const before = JSON.parse(JSON.stringify(settings.matrix));
  settings.matrix = { OPERATOR: clean(input?.OPERATOR), ENGINEER: clean(input?.ENGINEER) };
  saveSettings();
  return { before, after: settings.matrix };
}
var maintenance = [];
function loadMaintenance() {
  maintenance = readJson("maintenance.json", []);
}
function saveMaintenance() {
  maintenance.sort((a, b) => a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);
  writeJsonSoon("maintenance.json", () => maintenance, 200);
}
function upsertMaintenance(input, by, id) {
  const d = date(input?.date, "Date done", true);
  const nextDue = date(input?.nextDue, "Next due");
  if (nextDue && nextDue < d) throw new InputError("The next due date must be on or after the date the work was done.");
  const type = str(input?.type, 40, "Type") || "Other";
  const description = str(input?.description, 1e3, "Description");
  if (!description) throw new InputError("Describe the work that was done.");
  const motorId = str(input?.motorId, 24, "Motor") || settings.activeMotorId;
  if (!settings.motors.some((m) => m.id === motorId)) throw new InputError("Choose one of the listed motors.");
  if (id) {
    const r2 = maintenance.find((x) => x.id === id);
    if (!r2) throw new InputError("That maintenance record was not found.");
    Object.assign(r2, { date: d, nextDue, type, description, motorId, doneBy: str(input?.doneBy, 60, "Done by"), updatedBy: by, updatedAt: Date.now() });
    saveMaintenance();
    return r2;
  }
  const r = {
    id: import_crypto2.default.randomBytes(5).toString("hex"),
    motorId,
    date: d,
    type,
    description,
    doneBy: str(input?.doneBy, 60, "Done by"),
    nextDue,
    createdBy: by,
    createdAt: Date.now(),
    updatedBy: null,
    updatedAt: null
  };
  maintenance.push(r);
  saveMaintenance();
  return r;
}
function deleteMaintenance(id) {
  const i = maintenance.findIndex((x) => x.id === id);
  if (i < 0) throw new InputError("That maintenance record was not found.");
  const [r] = maintenance.splice(i, 1);
  saveMaintenance();
  return r;
}
function replaceAll(s, m) {
  settings = s;
  maintenance = m;
  loadSettingsFromObject();
  saveSettings();
  saveMaintenance();
}
function loadSettingsFromObject() {
  const d = defaultSettings();
  settings = { ...d, ...settings, params: { ...d.params, ...settings.params || {} }, matrix: { ...d.matrix, ...settings.matrix || {} } };
  if (!settings.motors?.length) settings.motors = d.motors;
  if (!settings.motors.some((x) => x.id === settings.activeMotorId)) settings.activeMotorId = settings.motors[0].id;
}

// server.ts
var PORT = parseInt(process.env.PORT || "3000", 10);
var DEVICE_KEY = process.env.DEVICE_KEY || "";
var DEMO_AUTOSTART = (process.env.DEMO_AUTOSTART || "true") !== "false";
var MAX_ROWS_PER_POST = 500;
loadSettings();
loadMaintenance();
loadUsers();
loadAudit();
useMatrix(() => settings.matrix);
var S = () => settings;
var cfg = () => ({ retentionDays: S().retentionDays, tzOffsetMin: S().tzOffsetMin });
var app = (0, import_express.default)();
app.set("trust proxy", true);
app.use(import_express.default.json({ limit: "2mb" }));
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof InputError) return res.status(400).json({ error: e.message });
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "The server could not complete this. Try again; if it repeats, check the server log." });
    else res.end();
  }
};
var stores = { device: new RowStore("device", cfg), demo: new RowStore("demo", cfg) };
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
  if (age < S().staleAfterS * 1e3) return "LIVE";
  if (age < S().offlineAfterS * 1e3) return "STALE";
  return "OFFLINE";
}
var demoRunning = false;
var demoScenario = "cycle";
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
var DemoGen = class {
  constructor() {
    this.seq = 0;
    this.temp = 38;
    this.boot = import_crypto3.default.randomBytes(4).toString("hex");
    this.temps = [];
  }
  // [ts, temp] for the 60 s slope
  row(now, s, tempBias = 0) {
    let rms = DEMO_BASE.rms_g[0] + gauss(4e-3);
    let crest = DEMO_BASE.crest[0] + gauss(0.15);
    let kurt = DEMO_BASE.kurtosis[0] + gauss(0.12);
    let jitter = DEMO_BASE.jitter_pct[0] + gauss(0.03);
    let rpm = 1438 + gauss(1.5);
    let iBase = 1.3;
    let tempTarget = 38 + tempBias;
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
      tempTarget = 70 + tempBias;
    }
    const dtS = this.temps.length ? Math.min(600, (now - this.temps[this.temps.length - 1][0]) / 1e3) : 1;
    const rate = (s === "thermal" ? 8e-4 : 2e-3) * dtS;
    this.temp += (tempTarget - this.temp) * Math.min(1, rate) + gauss(3e-3);
    this.temps.push([now, this.temp]);
    while (this.temps.length > 2 && now - this.temps[1][0] >= 6e4) this.temps.shift();
    const prev = this.temps[0];
    const trise = now - prev[0] >= 3e4 ? (this.temp - prev[1]) / ((now - prev[0]) / 6e4) : 0.05;
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
      seq: ++this.seq,
      boot: this.boot,
      fw: "demo",
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
      model: "demo",
      z_max: zmax,
      z,
      calibrated: true,
      sensors: { adxl: "ok", mlx: "ok", hall: "ok", ct: "ok", sd: "ok", rtc: "ok" },
      quality: []
    };
  }
};
var liveDemo = new DemoGen();
function nextLivePhase() {
  if (demoScenario !== "cycle") return demoScenario;
  cycleT++;
  if (cycleT >= CYCLE[cycleIdx].secs) {
    cycleT = 0;
    cycleIdx = (cycleIdx + 1) % CYCLE.length;
  }
  return CYCLE[cycleIdx].s;
}
function backfillDemo(days) {
  const gen = new DemoGen();
  const end = Date.now() - 6e4;
  const start2 = end - days * 864e5;
  let n = 0;
  for (let t = start2; t < end; t += 6e4) {
    const ageD = (end - t) / 864e5;
    const hour = new Date(t + S().tzOffsetMin * 6e4).getUTCHours();
    let s = "healthy";
    if (ageD > 9.6 && ageD < 10.2 && hour >= 10 && hour < 16) s = "imbalance";
    if (ageD < 2 && hour >= 11 && hour < 13) s = "impulsive";
    const bias = 3 * Math.sin((hour - 9) / 24 * 2 * Math.PI);
    const r = gen.row(t, s, bias);
    stores.demo.add(r, { live: false });
    n++;
  }
  return n;
}
var alerts = readJson("alerts.json", []);
var ALERT_CAP = 500;
var saveAlerts = () => writeJsonSoon("alerts.json", () => alerts, 3e3);
var tracks = {};
function raise(a) {
  const alert = { id: import_crypto3.default.randomBytes(6).toString("hex"), ack: null, ...a };
  alerts.push(alert);
  if (alerts.length > ALERT_CAP) alerts.shift();
  saveAlerts();
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
  if (t.count >= S().thresholds.debounceRows) {
    const from = t.committed;
    t.committed = next;
    t.count = 0;
    return { from };
  }
}
function limitValues(r) {
  const out = [];
  for (const k of METRIC_KEYS) {
    const p = S().params[k];
    const v = k === "current" ? Math.max(...[r.i_l1_a, r.i_l2_a, r.i_l3_a].map((x) => x === null ? -Infinity : x)) : r[k];
    out.push({ key: k, label: p.label, unit: p.unit, v: Number.isFinite(v) ? v : null, l: p });
  }
  for (const c of S().customParams) out.push({ key: c.key, label: c.label, unit: c.unit, v: r.extra?.[c.key] ?? null, l: c });
  return out;
}
function deriveAlerts(r) {
  const key = `${r.source}|${r.device_id}`;
  const sev = severityFromZ(r.z_max, r.calibrated);
  const sensorsBad = r.sensors ? Object.entries(r.sensors).filter(([, v]) => v !== "ok").map(([k, v]) => `${k}:${v}`).join(", ") : "";
  const q = r.quality.join(", ");
  const base = { ts: r.ts, source: r.source, device_id: r.device_id };
  const n = S().thresholds.debounceRows;
  let t = tracks[key];
  if (!t) {
    t = tracks[key] = {
      cls: { committed: r.cls, pending: r.cls, count: 0 },
      sev: { committed: sev, pending: sev, count: 0 },
      lim: {},
      sensorsBad,
      q
    };
  } else {
    if (r.cls !== null) {
      const c = step(t.cls, r.cls);
      if (c) {
        const healthy = /^healthy$/i.test(r.cls);
        raise({
          ...base,
          severity: healthy ? "info" : "warning",
          category: "model",
          title: `Model output changed: ${c.from ?? "\u2014"} \u2192 ${r.cls}`,
          detail: (r.vote_share !== null ? `${Math.round(r.vote_share * 100)}% of trees agree. ` : "") + `Held for ${n} consecutive rows. A prediction is not a confirmed diagnosis \u2014 inspect the motor before acting.`
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
        detail: r.z_max !== null ? `Largest feature deviation |z| = ${r.z_max.toFixed(1)} (warning \u2265 ${S().thresholds.zWarn}, critical \u2265 ${S().thresholds.zCrit}), held for ${n} rows.` : "Deviation value unavailable."
      });
    }
    if (sensorsBad && sensorsBad !== t.sensorsBad) {
      raise({ ...base, severity: "warning", category: "sensor", title: "Sensor reported a problem", detail: sensorsBad });
    }
    if (q && r.source === "device" && q !== t.q) {
      raise({ ...base, severity: "info", category: "data", title: "Data-quality flag on incoming row", detail: q });
    }
  }
  t.sensorsBad = sensorsBad;
  t.q = q;
  for (const x of limitValues(r)) {
    const ls = limitSeverity(x.v, x.l);
    if (ls === null) continue;
    const tr = t.lim[x.key] ||= { committed: ls, pending: ls, count: 0 };
    const c = step(tr, ls);
    if (c && (ls !== "normal" || c.from !== "normal")) {
      const lim = x.l;
      const parts = [
        lim.warnHigh !== null && `warning \u2265 ${lim.warnHigh}`,
        lim.critHigh !== null && `critical \u2265 ${lim.critHigh}`,
        lim.warnLow !== null && `warning \u2264 ${lim.warnLow}`,
        lim.critLow !== null && `critical \u2264 ${lim.critLow}`
      ].filter(Boolean);
      raise({
        ...base,
        severity: ls === "critical" ? "critical" : ls === "warning" ? "warning" : "info",
        category: "limit",
        title: ls === "normal" ? `${x.label} back within limits` : `${x.label} outside ${ls} limit`,
        detail: `${x.label} = ${x.v.toFixed(3)} ${x.unit === "\u2014" ? "" : x.unit} (limits set by the admin: ${parts.join(", ")}), held for ${n} rows.`
      });
    }
  }
}
var sockets = /* @__PURE__ */ new Map();
function broadcast(msg) {
  const s = JSON.stringify(msg);
  sockets.forEach((_t, ws) => ws.readyState === import_ws.WebSocket.OPEN && ws.send(s));
}
function sendToUser(userId, msg) {
  const s = JSON.stringify(msg);
  sockets.forEach((token, ws) => {
    if (sessions.get(token)?.userId === userId && ws.readyState === import_ws.WebSocket.OPEN) ws.send(s);
  });
}
onSessionEnd((s, reason) => {
  sockets.forEach((token, ws) => {
    if (token === s.token) {
      try {
        ws.send(JSON.stringify({ type: "signed_out", reason }));
        ws.close(4001, "signed out");
      } catch {
      }
      sockets.delete(ws);
    }
  });
});
var configChanged = () => {
  broadcast({ type: "config", version: S().version });
  broadcast({ type: "state", state: stateSnapshot() });
};
function activeSource() {
  return demoRunning ? "demo" : "device";
}
function stateSnapshot() {
  const d = primaryDeviceId ? devices.get(primaryDeviceId) : void 0;
  const m = activeMotor();
  return {
    serverTime: Date.now(),
    schema: SCHEMA_VERSION,
    activeSource: activeSource(),
    demo: { running: demoRunning, scenario: demoScenario },
    deviceStatus: deviceStatus(),
    device: d ?? null,
    ingestionConfigured: !!DEVICE_KEY,
    thresholds: { zWarn: S().thresholds.zWarn, zCrit: S().thresholds.zCrit },
    staleAfterMs: S().staleAfterS * 1e3,
    offlineAfterMs: S().offlineAfterS * 1e3,
    configVersion: S().version,
    motor: m,
    acquisition: {
      ...ACQUISITION,
      shaftHz: (m.ratedRpm || 1400) / 60,
      revPeriodMs: 6e4 / (m.ratedRpm || 1400)
    }
  };
}
var lastStatus = deviceStatus();
setInterval(() => {
  const now = Date.now();
  if (demoRunning) {
    const r = liveDemo.row(now, nextLivePhase());
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
        detail: `No data for ${S().offlineAfterS} s. Board B keeps logging to SD and re-sends when Wi-Fi returns.`
      });
    }
    lastStatus = st;
  }
  broadcast({ type: "state", state: stateSnapshot() });
}, 1e3);
setInterval(() => Object.values(stores).forEach((s) => s.prune()), 36e5);
if (DEMO_AUTOSTART) demoRunning = true;
function meJson(a) {
  return {
    ...publicUser(a.u),
    token: a.s.token,
    sid: a.s.sid,
    loginTime: a.s.createdAt,
    roleLabel: ROLE_LABEL[a.u.role],
    station: S().site.station,
    permissions: userPermissions(a.u)
  };
}
app.get("/api/auth/accounts", (_req, res) => {
  if (!S().showAccountsOnLogin) return res.json({ accounts: [] });
  res.json({
    accounts: [...users.values()].filter((u) => u.enabled).map((u) => ({ id: u.id, name: u.name, role: ROLE_LABEL[u.role] }))
  });
});
app.post(
  "/api/auth/login",
  h((req, res) => {
    const { id, password } = req.body || {};
    if (!id || !password) return res.status(400).json({ error: "Enter your ID and password." });
    const uid = String(id).trim().toUpperCase().slice(0, 20);
    const wait = lockedFor(uid);
    if (wait) {
      return res.status(429).json({ error: `Too many wrong passwords for ${uid}. Try again in ${Math.ceil(wait / 6e4)} min, or ask the admin.` });
    }
    const u = users.get(uid);
    if (!u || !checkPassword(String(password), u.pwHash)) {
      noteFailure(uid);
      audit(u ? u : { id: uid, name: "\u2014", role: "\u2014" }, "auth.failed", `Wrong ID or password for ${uid}`, void 0, req);
      return res.status(401).json({ error: "That ID and password combination is not recognised." });
    }
    if (!u.enabled) {
      audit(u, "auth.blocked", "Sign-in attempt on a disabled account", void 0, req);
      return res.status(403).json({ error: "This account is disabled. Ask the admin to enable it." });
    }
    clearFailures(uid);
    const s = createSession(u, req, S().sessionHours);
    u.lastLoginAt = Date.now();
    saveUsers();
    audit(u, "auth.login", `Signed in as ${ROLE_LABEL[u.role]}`, { sid: s.sid }, req);
    res.json({ status: "success", user: meJson({ s, u }) });
  })
);
app.get("/api/auth/verify", requireAuth(), (req, res) => {
  res.json({ status: "authenticated", user: meJson(req.auth) });
});
app.post("/api/auth/logout", (req, res) => {
  const t = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
  const a = sessionFromToken(t);
  if (a) {
    audit(a.u, "auth.logout", "Signed out", { sid: a.s.sid }, req);
    endSession(t, "You signed out.");
  }
  res.json({ status: "logged_out" });
});
app.post(
  "/api/me/password",
  requireAuth(),
  h((req, res) => {
    const { current, next } = req.body || {};
    if (!checkPassword(String(current || ""), req.auth.u.pwHash)) throw new HttpError(400, "Your current password is not correct.");
    const p = passwordProblem(next);
    if (p) throw new HttpError(400, p);
    req.auth.u.pwHash = hashPassword(next);
    req.auth.u.pwChangedAt = Date.now();
    saveUsers();
    const n = endSessionsOf(req.auth.u.id, "Your password was changed. Sign in again.", req.auth.s.token);
    audit(req.auth.u, "user.password.self", "Changed own password", { otherSessionsEnded: n }, req);
    res.json({ ok: true, otherSessionsEnded: n });
  })
);
app.post("/api/v1/telemetry", (req, res) => {
  if (!DEVICE_KEY) {
    return res.status(503).json({ error: "DEVICE_KEY is not set on the server. Add it in Render \u2192 Environment." });
  }
  const key = String(req.headers["x-device-key"] || "");
  const a = Buffer.from(key);
  const b = Buffer.from(DEVICE_KEY);
  if (a.length !== b.length || !import_crypto3.default.timingSafeEqual(a, b)) {
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
  const extraKeys = customKeys();
  rawRows.forEach((raw, index) => {
    const { row, error } = normalizeIncoming(raw, "device", now, extraKeys);
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
app.get("/api/config", requireAuth(), (_req, res) => res.json(publicConfig()));
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
app.get(
  "/api/series",
  requireAuth(),
  h((req, res) => {
    const source = pickSource(req.query.source);
    const to = Math.min(Number(req.query.to) || Date.now(), Date.now() + 6e4);
    const from = Number(req.query.from) || to - 36e5;
    if (from >= to) throw new HttpError(400, "The start must be before the end.");
    const span = to - from;
    if (span > 24 * 36e5 + 6e4 && !can(req.auth.u, "history.long")) {
      throw new HttpError(403, "Your role can view up to 24 hours. Ask the admin for 7-day and 30-day trends.");
    }
    if (span > (S().retentionDays + 1) * 864e5) throw new HttpError(400, `Data is kept for ${S().retentionDays} days.`);
    const points = Math.min(2e3, Math.max(50, Number(req.query.points) || 720));
    res.json({ source, from, to, ...stores[source].series(from, to, points) });
  })
);
app.get("/api/alerts", requireAuth(), (_req, res) => res.json({ alerts: alerts.slice(-300) }));
app.post(
  "/api/alerts/:id/ack",
  requireAuth("alerts.ack"),
  h((req, res) => {
    const a = alerts.find((x) => x.id === req.params.id);
    if (!a) throw new HttpError(404, "That alert is no longer held by the server.");
    if (a.ack) throw new HttpError(409, `Already acknowledged by ${a.ack.name}.`);
    const note = str(req.body?.note, 300, "Note");
    a.ack = { by: req.auth.u.id, name: req.auth.u.name, at: Date.now(), note };
    saveAlerts();
    audit(req.auth.u, "alert.ack", `Acknowledged \u201C${a.title}\u201D`, { alert: a.id, note }, req);
    broadcast({ type: "alert_update", alert: a });
    res.json({ alert: a });
  })
);
app.get("/api/export/days", requireAuth("export.data"), (req, res) => {
  const source = pickSource(req.query.source);
  res.json({ source, days: stores[source].days(), tzOffsetMin: S().tzOffsetMin, retentionDays: S().retentionDays });
});
app.get(
  "/api/export",
  requireAuth("export.data"),
  h(async (req, res) => {
    const source = pickSource(req.query.source);
    const tz = S().tzOffsetMin;
    const format = req.query.format === "xlsx" ? "xlsx" : "csv";
    const d1 = date(req.query.day || req.query.from, "From date", true);
    const d2 = req.query.day ? d1 : date(req.query.to, "To date", true);
    if (d2 < d1) throw new HttpError(400, "The \u201Cto\u201D date must be on or after the \u201Cfrom\u201D date.");
    const from = dayStart(d1, tz);
    const to = dayStart(d2, tz) + 864e5 - 1;
    const days = Math.round((to + 1 - from) / 864e5);
    if (days > S().retentionDays + 1) throw new HttpError(400, `Choose at most ${S().retentionDays} days.`);
    const stepS = [10, 60, 600, 3600].includes(Number(req.query.step)) ? Number(req.query.step) : 10;
    let columns = [...CSV_COLUMNS];
    if (req.query.columns) {
      const want = String(req.query.columns).split(",");
      columns = CSV_COLUMNS.filter((c) => c === "timestamp_utc" || want.includes(c));
    }
    const extraAll = customKeys();
    const extraKeys = req.query.extra === "0" ? [] : req.query.columns ? extraAll.filter((k) => String(req.query.columns).split(",").includes(k)) : extraAll;
    const pick = function* () {
      let lastB = -1;
      for (const r of stores[source].range(from, to)) {
        const b = Math.floor(r.ts / (stepS * 1e3));
        if (stepS > HIST_BUCKET_MS / 1e3 && b === lastB) continue;
        lastB = b;
        yield r;
      }
    };
    let count = 0;
    for (const _ of pick()) count++;
    if (!count) {
      throw new HttpError(404, `No ${source === "demo" ? "demo" : "device"} rows between ${d1} and ${d2}. Pick days that have data.`);
    }
    const who = source === "demo" ? "DEMO-DATA" : primaryDeviceId || activeMotor().id;
    const res_ = stepS === 10 ? "10s" : stepS === 60 ? "1min" : stepS === 600 ? "10min" : "1h";
    const name = `MHM_${who}_${d1 === d2 ? d1 : `${d1}_to_${d2}`}_${res_}_v${SCHEMA_VERSION}`;
    res.setHeader("X-Row-Count", String(count));
    res.setHeader("Access-Control-Expose-Headers", "X-Row-Count, Content-Disposition");
    audit(req.auth.u, "data.export", `Exported ${count} ${source} rows, ${d1}${d1 === d2 ? "" : ` \u2192 ${d2}`}, ${format.toUpperCase()}, ${res_}`, {
      source,
      columns: columns.length
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
        resolution: stepS === 10 ? "One row per 10 s (as stored)" : `One measured row per ${res_} (others skipped, not averaged)`,
        generatedBy: `${req.auth.u.name} (${req.auth.u.id})`,
        tzOffsetMin: tz,
        schema: SCHEMA_VERSION
      }
    });
  })
);
function maintenanceSummary() {
  const list = maintenance.filter((m) => m.motorId === S().activeMotorId);
  const last = list[0] ?? null;
  const today = dayKey(Date.now(), S().tzOffsetMin);
  const upcoming = list.filter((m) => m.nextDue).map((m) => m.nextDue).sort();
  const nextDue = upcoming.find((d) => d >= today) ?? upcoming[upcoming.length - 1] ?? null;
  return { last, nextDue, overdue: !!nextDue && nextDue < today, count: list.length, today };
}
app.get("/api/maintenance/summary", requireAuth(), (_req, res) => res.json(maintenanceSummary()));
app.get(
  "/api/maintenance/markers",
  requireAuth(),
  (_req, res) => res.json({ markers: maintenance.filter((m) => m.motorId === S().activeMotorId).map((m) => ({ date: m.date, type: m.type, id: m.id })) })
);
app.get(
  "/api/maintenance",
  requireAuth("page.maintenance"),
  (_req, res) => res.json({ records: maintenance, summary: maintenanceSummary(), types: void 0 })
);
app.post(
  "/api/maintenance",
  requireAuth("maintenance.edit"),
  h((req, res) => {
    const r = upsertMaintenance(req.body, req.auth.u.name);
    audit(req.auth.u, "maintenance.add", `Added maintenance ${r.date}: ${r.type}`, { id: r.id, motor: r.motorId }, req);
    broadcast({ type: "maintenance" });
    res.json({ record: r });
  })
);
app.put(
  "/api/maintenance/:id",
  requireAuth("maintenance.edit"),
  h((req, res) => {
    const before = maintenance.find((x) => x.id === req.params.id);
    const prev = before ? { ...before } : null;
    const r = upsertMaintenance(req.body, req.auth.u.name, req.params.id);
    audit(req.auth.u, "maintenance.edit", `Edited maintenance ${r.date}: ${r.type}`, { id: r.id, before: prev, after: r }, req);
    broadcast({ type: "maintenance" });
    res.json({ record: r });
  })
);
app.delete(
  "/api/maintenance/:id",
  requireAuth("maintenance.edit"),
  h((req, res) => {
    const r = deleteMaintenance(req.params.id);
    audit(req.auth.u, "maintenance.delete", `Deleted maintenance ${r.date}: ${r.type}`, { record: r }, req);
    broadcast({ type: "maintenance" });
    res.json({ ok: true });
  })
);
app.put(
  "/api/settings/thresholds",
  requireAuth("thresholds.edit"),
  h((req, res) => {
    const out = [];
    if (req.body?.thresholds) out.push(setThresholds(req.body.thresholds));
    if (req.body?.limits) {
      const merged = {};
      for (const k of METRIC_KEYS) {
        const l = req.body.limits[k];
        if (l) merged[k] = { ...S().params[k], warnHigh: l.warnHigh, critHigh: l.critHigh, warnLow: l.warnLow, critLow: l.critLow };
      }
      const ch = setParams(merged);
      if (ch.length) out.push(`limits changed for ${ch.join(", ")}`);
    }
    if (req.body?.customLimits) {
      const list = S().customParams.map((c) => {
        const l = req.body.customLimits[c.key];
        return l ? { ...c, warnHigh: l.warnHigh, critHigh: l.critHigh, warnLow: l.warnLow, critLow: l.critLow } : c;
      });
      out.push(setCustomParams(list));
    }
    audit(req.auth.u, "settings.thresholds", out.join("; ") || "No change", void 0, req);
    configChanged();
    res.json({ ok: true, config: publicConfig() });
  })
);
app.post(
  "/api/demo",
  requireAuth("demo.control"),
  h((req, res) => {
    const { action, scenario } = req.body || {};
    if (action === "start") {
      if (deviceStatus() === "LIVE") throw new HttpError(409, "A real device is sending data. Demo mode is blocked while it is live.");
      demoRunning = true;
    } else if (action === "stop") {
      demoRunning = false;
    }
    if (["cycle", "healthy", "imbalance", "impulsive", "thermal"].includes(scenario)) {
      demoScenario = scenario;
      cycleIdx = 0;
      cycleT = 0;
    }
    audit(req.auth.u, "demo.control", `Demo ${action || "scenario"}${scenario ? ` (${scenario})` : ""}`, void 0, req);
    broadcast({ type: "state", state: stateSnapshot() });
    res.json(stateSnapshot());
  })
);
var admin = import_express.default.Router();
admin.use(requireAuth("admin"));
admin.get("/settings", (_req, res) => res.json({ settings: S(), activeMotor: activeMotor() }));
function usersPayload(currentToken) {
  const now = Date.now();
  return {
    users: [...users.values()].map((u) => ({
      ...publicUser(u),
      permissions: permissionsFor(u.role, S().matrix),
      online: [...sessions.values()].some((s) => s.userId === u.id && now - s.lastSeen < 12e4)
    })),
    sessions: [...sessions.values()].filter((s) => s.expiresAt > now).map((s) => ({
      sid: s.sid,
      userId: s.userId,
      userName: users.get(s.userId)?.name ?? s.userId,
      role: users.get(s.userId)?.role ?? null,
      createdAt: s.createdAt,
      lastSeen: s.lastSeen,
      ip: s.ip,
      agent: s.agent,
      live: [...sockets.values()].includes(s.token),
      current: s.token === currentToken
    })).sort((a, b) => b.lastSeen - a.lastSeen)
  };
}
admin.get("/users", (req, res) => res.json(usersPayload(req.auth.s.token)));
admin.post(
  "/users",
  h((req, res) => {
    const b = req.body || {};
    const id = str(b.id, 20, "User ID").toUpperCase();
    if (!USER_ID_RE.test(id)) throw new HttpError(400, "User ID: 3\u201320 capital letters, digits or dashes, starting with a letter (for example OP-203).");
    if (users.has(id)) throw new HttpError(409, `${id} already exists.`);
    if (!isRole(b.role)) throw new HttpError(400, "Choose a role.");
    const name = str(b.name, 60, "Name");
    if (!name) throw new HttpError(400, "Enter the person\u2019s name.");
    const p = passwordProblem(b.password);
    if (p) throw new HttpError(400, p);
    const u = {
      id,
      name,
      role: b.role,
      roleTitle: str(b.roleTitle, 60, "Job title") || ROLE_LABEL[b.role],
      initials: (str(b.initials, 3, "Initials") || name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2)).toUpperCase(),
      enabled: true,
      pwHash: hashPassword(b.password),
      createdAt: Date.now(),
      lastLoginAt: null,
      pwChangedAt: Date.now()
    };
    users.set(id, u);
    saveUsers();
    audit(req.auth.u, "user.add", `Added ${id} (${name}) as ${ROLE_LABEL[u.role]}`, void 0, req);
    res.json(usersPayload(req.auth.s.token));
  })
);
admin.put(
  "/users/:id",
  h((req, res) => {
    const u = users.get(req.params.id);
    if (!u) throw new HttpError(404, "That user was not found.");
    const b = req.body || {};
    const before = publicUser(u);
    const self = u.id === req.auth.u.id;
    if (b.role !== void 0 && !isRole(b.role)) throw new HttpError(400, "Choose a role.");
    if (self && b.role && b.role !== "ADMIN") throw new HttpError(400, "You cannot remove your own admin role. Ask another admin.");
    if (self && b.enabled === false) throw new HttpError(400, "You cannot disable your own account.");
    const losesAdmin = u.role === "ADMIN" && (b.role && b.role !== "ADMIN" || b.enabled === false);
    if (losesAdmin && adminCount(u.id) === 0) throw new HttpError(400, "At least one enabled admin account must remain.");
    if (b.name !== void 0) u.name = str(b.name, 60, "Name") || u.name;
    if (b.roleTitle !== void 0) u.roleTitle = str(b.roleTitle, 60, "Job title");
    if (b.initials !== void 0) u.initials = (str(b.initials, 3, "Initials") || u.initials).toUpperCase();
    if (b.role) u.role = b.role;
    if (b.enabled !== void 0) u.enabled = !!b.enabled;
    saveUsers();
    const changes = Object.keys(before).filter((k) => before[k] !== publicUser(u)[k]);
    if (!u.enabled) endSessionsOf(u.id, "Your account was disabled by the admin.");
    else if (changes.includes("role")) sendToUser(u.id, { type: "me_changed" });
    audit(req.auth.u, "user.edit", `Edited ${u.id}: ${changes.join(", ") || "no change"}`, { before, after: publicUser(u) }, req);
    res.json(usersPayload(req.auth.s.token));
  })
);
admin.post(
  "/users/:id/password",
  h((req, res) => {
    const u = users.get(req.params.id);
    if (!u) throw new HttpError(404, "That user was not found.");
    const p = passwordProblem(req.body?.password);
    if (p) throw new HttpError(400, p);
    u.pwHash = hashPassword(req.body.password);
    u.pwChangedAt = Date.now();
    saveUsers();
    const n = endSessionsOf(u.id, "Your password was reset by the admin. Sign in with the new password.", req.auth.s.token);
    audit(req.auth.u, "user.password.reset", `Reset the password of ${u.id}`, { sessionsEnded: n }, req);
    res.json(usersPayload(req.auth.s.token));
  })
);
admin.delete(
  "/users/:id",
  h((req, res) => {
    const u = users.get(req.params.id);
    if (!u) throw new HttpError(404, "That user was not found.");
    if (u.id === req.auth.u.id) throw new HttpError(400, "You cannot delete your own account.");
    if (u.role === "ADMIN" && adminCount(u.id) === 0) throw new HttpError(400, "At least one enabled admin account must remain.");
    endSessionsOf(u.id, "Your account was removed by the admin.");
    users.delete(u.id);
    saveUsers();
    audit(req.auth.u, "user.delete", `Deleted ${u.id} (${u.name})`, void 0, req);
    res.json(usersPayload(req.auth.s.token));
  })
);
admin.post(
  "/users/:id/signout",
  h((req, res) => {
    const u = users.get(req.params.id);
    if (!u) throw new HttpError(404, "That user was not found.");
    const n = endSessionsOf(u.id, "You were signed out by the admin.", req.auth.s.token);
    audit(req.auth.u, "session.end", `Signed out ${u.id} (${u.name}) from ${n} session${n === 1 ? "" : "s"}`, void 0, req);
    res.json(usersPayload(req.auth.s.token));
  })
);
admin.delete(
  "/sessions/:sid",
  h((req, res) => {
    const s = [...sessions.values()].find((x) => x.sid === req.params.sid);
    if (!s) throw new HttpError(404, "That session has already ended.");
    if (s.token === req.auth.s.token) throw new HttpError(400, "This is your own session. Use \u201CSign out\u201D at the top instead.");
    const u = users.get(s.userId);
    endSession(s.token, "You were signed out by the admin.");
    audit(req.auth.u, "session.end", `Signed out ${u?.id ?? s.userId} (${u?.name ?? "\u2014"}), session ${s.sid}`, void 0, req);
    res.json(usersPayload(req.auth.s.token));
  })
);
var done = (req, res, action, summary, detail) => {
  audit(req.auth.u, action, summary, detail, req);
  configChanged();
  res.json({ settings: S(), activeMotor: activeMotor() });
};
admin.post("/motors", h((req, res) => done(req, res, "settings.motor", setMotor(req.body, true).summary)));
admin.put("/motors/:id", h((req, res) => done(req, res, "settings.motor", setMotor({ ...req.body, id: req.params.id }, false).summary)));
admin.delete(
  "/motors/:id",
  h((req, res) => {
    deleteMotor(req.params.id);
    done(req, res, "settings.motor", `Deleted motor ${req.params.id}`);
  })
);
admin.post(
  "/motors/:id/activate",
  h((req, res) => {
    const { prev, motor } = setActiveMotor(req.params.id);
    raise({
      ts: Date.now(),
      source: activeSource(),
      device_id: primaryDeviceId || "server",
      severity: "warning",
      category: "system",
      title: `Monitored motor changed to ${motor.name} (${motor.id})`,
      detail: `Changed by ${req.auth.u.name}. Capture a new healthy baseline on Board B before trusting z-scores and model outputs for this motor.`
    });
    done(req, res, "settings.motor.activate", `Active motor ${prev} \u2192 ${motor.id}`);
  })
);
admin.put(
  "/params",
  h((req, res) => {
    const ch = setParams(req.body?.params);
    let s = ch.length ? `Changed ${ch.join(", ")}` : "No change to built-in parameters";
    if (req.body?.customParams) s += "; " + setCustomParams(req.body.customParams);
    done(req, res, "settings.params", s);
  })
);
admin.put("/thresholds", h((req, res) => done(req, res, "settings.thresholds", setThresholds(req.body))));
admin.put("/system", h((req, res) => done(req, res, "settings.system", setSystem(req.body))));
admin.put("/info", h((req, res) => done(req, res, "settings.info", setInfo(req.body))));
admin.get("/permissions", (_req, res) => res.json({ matrix: S().matrix }));
admin.put(
  "/permissions",
  h((req, res) => {
    const { before, after } = setMatrix(req.body?.matrix);
    const diff = [];
    for (const role of ["OPERATOR", "ENGINEER"]) {
      const add = after[role].filter((p) => !before[role].includes(p));
      const rem = before[role].filter((p) => !after[role].includes(p));
      if (add.length) diff.push(`${ROLE_LABEL[role]} +${add.join(", +")}`);
      if (rem.length) diff.push(`${ROLE_LABEL[role]} \u2212${rem.join(", \u2212")}`);
    }
    sessions.forEach((s) => sendToUser(s.userId, { type: "me_changed" }));
    done(req, res, "settings.permissions", diff.join("; ") || "No change", { before, after });
  })
);
admin.get("/audit", (req, res) => {
  const user = String(req.query.user || "");
  const action = String(req.query.action || "");
  const list = auditLog.filter((e) => (!user || e.userId === user) && (!action || e.action.startsWith(action))).slice(-1e3).reverse();
  res.json({ entries: list, total: auditLog.length });
});
admin.get("/audit.csv", (req, res) => {
  const esc = (v) => {
    const s = v === void 0 || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="MHM_audit_${dayKey(Date.now(), S().tzOffsetMin)}.csv"`);
  res.write("timestamp_utc,user_id,user_name,role,action,summary,ip,detail\r\n");
  for (const e of auditLog) {
    res.write([new Date(e.ts).toISOString(), e.userId, e.userName, e.role, e.action, e.summary, e.ip, e.detail].map(esc).join(",") + "\r\n");
  }
  audit(req.auth.u, "audit.export", "Downloaded the audit log", void 0, req);
  res.end();
});
admin.get(
  "/storage",
  (_req, res) => res.json({
    dataDir: DATA_DIR,
    totalBytes: dirSizeBytes(DATA_DIR),
    device: stores.device.stats(),
    demo: stores.demo.stats(),
    retentionDays: S().retentionDays,
    renderFree: !!process.env.RENDER && !process.env.DATA_DIR
  })
);
admin.delete(
  "/buffer",
  h((req, res) => {
    const source = req.query.source === "demo" ? "demo" : "device";
    const st = stores[source].stats();
    stores[source].clear();
    broadcast({ type: "cleared", source });
    audit(req.auth.u, "data.clear", `Cleared all ${source} history (${st.days} day files)`, void 0, req);
    res.json({ cleared: source, note: "Server data only. The SD card on Board B is not affected." });
  })
);
admin.post(
  "/demo/backfill",
  h((req, res) => {
    const days = Math.round(num(req.body?.days ?? 30, "Days", 1, Math.min(60, S().retentionDays)));
    stores.demo.clear();
    const n = backfillDemo(days);
    audit(req.auth.u, "demo.backfill", `Generated ${days} days of demo history (${n} rows, 1 per minute)`, void 0, req);
    broadcast({ type: "cleared", source: "demo" });
    res.json({ rows: n, days });
  })
);
admin.post(
  "/import",
  import_express.default.text({ type: ["text/csv", "text/plain", "application/octet-stream"], limit: "25mb" }),
  h((req, res) => {
    const text = typeof req.body === "string" ? req.body : "";
    if (!text.trim()) throw new HttpError(400, "The file is empty. Choose a CSV file from the SD card.");
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    const header = lines[0].split(",").map((x) => x.trim());
    if (!header.includes("timestamp_utc") || !header.includes("device_id")) {
      throw new HttpError(400, "This does not look like an MHM SD-card file: the first line must contain timestamp_utc and device_id.");
    }
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    let bad = 0;
    const before = stores.device.stats().days;
    for (const line of lines.slice(1)) {
      const raw = csvLineToRaw(header, line);
      if (!raw || raw.ts === void 0) {
        bad++;
        continue;
      }
      const { row } = normalizeIncoming(raw, "device", now, customKeys());
      if (!row || row.quality.some((q) => q.startsWith("ts_"))) {
        bad++;
        continue;
      }
      row.quality.push("imported_from_sd");
      if (stores.device.add(row, { live: false })) added++;
      else skipped++;
    }
    audit(req.auth.u, "data.import", `Imported SD-card CSV: ${added} rows added, ${skipped} already present, ${bad} unreadable`, {
      lines: lines.length - 1
    }, req);
    broadcast({ type: "cleared", source: "device" });
    res.json({ added, skipped, bad, daysBefore: before, daysAfter: stores.device.stats().days });
  })
);
admin.get("/backup", (req, res) => {
  const body = {
    kind: "mhm-backup",
    version: 1,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    settings: S(),
    users: [...users.values()],
    maintenance
  };
  audit(req.auth.u, "backup.download", "Downloaded a settings backup", void 0, req);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="MHM_backup_${dayKey(Date.now(), S().tzOffsetMin)}.json"`);
  res.send(JSON.stringify(body, null, 1));
});
admin.post(
  "/restore",
  import_express.default.json({ limit: "5mb" }),
  h((req, res) => {
    const b = req.body;
    if (b?.kind !== "mhm-backup" || !b.settings || !Array.isArray(b.users)) throw new HttpError(400, "This is not an MHM backup file.");
    const list = b.users.filter((u) => u && USER_ID_RE.test(u.id) && isRole(u.role) && typeof u.pwHash === "string");
    if (!list.some((u) => u.role === "ADMIN" && u.enabled)) throw new HttpError(400, "The backup has no enabled admin account, so it was not restored.");
    replaceAll(b.settings, b.maintenance || []);
    users.clear();
    list.forEach((u) => users.set(u.id, u));
    saveUsers();
    for (const s of [...sessions.values()]) {
      if (!users.has(s.userId) || s.token !== req.auth.s.token) endSession(s.token, "Settings were restored from a backup. Sign in again.");
    }
    audit(users.get(req.auth.u.id) ?? req.auth.u, "backup.restore", `Restored settings, ${list.length} users and ${(b.maintenance || []).length} maintenance records from a backup made ${b.createdAt}`, void 0, req);
    configChanged();
    res.json({ ok: true, stillSignedIn: users.has(req.auth.u.id) });
  })
);
app.use("/api/admin", admin);
app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown API route." }));
async function start() {
  const t0 = Date.now();
  const nd = await stores.device.loadFromDisk();
  const nm = await stores.demo.loadFromDisk();
  console.log(`Loaded ${nd} device and ${nm} demo rows from ${DATA_DIR} in ${Date.now() - t0} ms`);
  const server = import_http.default.createServer(app);
  const wss = new import_ws.WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://x");
    if (url.pathname !== "/ws") return;
    const token = url.searchParams.get("token");
    const a = sessionFromToken(token);
    if (!a) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(ws, a.s.token);
      wss.emit("connection", ws);
    });
  });
  wss.on("connection", (ws) => {
    const src = activeSource();
    ws.send(
      JSON.stringify({
        type: "snapshot",
        state: stateSnapshot(),
        rows: stores[src].live.slice(-300),
        source: src,
        alerts: alerts.slice(-150)
      })
    );
    ws.on("message", () => {
      const t = sockets.get(ws);
      if (t) sessionFromToken(t);
    });
    ws.on("close", () => sockets.delete(ws));
    ws.on("error", () => sockets.delete(ws));
  });
  const distPath = import_fs4.default.existsSync(import_path3.default.join(process.cwd(), "dist", "index.html")) ? import_path3.default.join(process.cwd(), "dist") : __dirname;
  if (import_fs4.default.existsSync(import_path3.default.join(distPath, "index.html"))) {
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => res.sendFile(import_path3.default.join(distPath, "index.html")));
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
