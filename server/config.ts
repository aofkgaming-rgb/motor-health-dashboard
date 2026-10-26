/**
 * Admin-editable settings and maintenance records, with input checking.
 * Everything is saved to DATA_DIR (settings.json, maintenance.json).
 */
import crypto from 'crypto';
import { THRESHOLDS } from '../src/shared/contract';
import { ALL_PERMISSIONS, Permission, PermissionMatrix } from '../src/shared/rbac';
import {
  CUSTOM_KEY_RE,
  CustomParam,
  DEFAULT_PARAMS,
  Limits,
  MaintenanceRecord,
  METRIC_KEYS,
  MetricKey,
  ModelInfo,
  MotorProfile,
  ParamSetting,
  PinRow,
  Settings,
  defaultSettings,
} from '../src/shared/settings';
import { readJson, writeJsonSoon } from './persist';

export class InputError extends Error {}

// ---------------------------------------------------------------------------
// Small validators
// ---------------------------------------------------------------------------
export function str(v: unknown, max: number, field = 'value'): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new InputError(`${field} must be text.`);
  return String(v).trim().slice(0, max);
}

export function num(v: unknown, field: string, min = -1e9, max = 1e9): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InputError(`${field} must be a number.`);
  if (n < min || n > max) throw new InputError(`${field} must be between ${min} and ${max}.`);
  return n;
}

function reqNum(v: unknown, field: string, min: number, max: number): number {
  const n = num(v, field, min, max);
  if (n === null) throw new InputError(`Enter a value for ${field}.`);
  return n;
}

export function date(v: unknown, field: string, required = false): string {
  const s = str(v, 10, field);
  if (!s) {
    if (required) throw new InputError(`Choose a date for ${field}.`);
    return '';
  }
  if (!/^\d{4}-\d\d-\d\d$/.test(s) || !Number.isFinite(Date.parse(s))) throw new InputError(`${field} must be a date (YYYY-MM-DD).`);
  return s;
}

function limits(v: any, label: string): Limits {
  const l: Limits = {
    warnHigh: num(v?.warnHigh, `${label} warning-high`),
    critHigh: num(v?.critHigh, `${label} critical-high`),
    warnLow: num(v?.warnLow, `${label} warning-low`),
    critLow: num(v?.critLow, `${label} critical-low`),
  };
  if (l.warnHigh !== null && l.critHigh !== null && l.critHigh < l.warnHigh)
    throw new InputError(`${label}: the critical-high limit must be at or above the warning-high limit.`);
  if (l.warnLow !== null && l.critLow !== null && l.critLow > l.warnLow)
    throw new InputError(`${label}: the critical-low limit must be at or below the warning-low limit.`);
  return l;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export let settings: Settings = defaultSettings();

export function loadSettings() {
  const saved = readJson<Partial<Settings> | null>('settings.json', null);
  const d = defaultSettings();
  if (saved) {
    settings = {
      ...d,
      ...saved,
      site: { ...d.site, ...(saved.site || {}) },
      thresholds: { ...d.thresholds, ...(saved.thresholds || {}) },
      params: Object.fromEntries(METRIC_KEYS.map((k) => [k, { ...d.params[k], ...(saved.params?.[k] || {}) }])) as any,
      matrix: { ...d.matrix, ...(saved.matrix || {}) },
      deviceInfo: { ...d.deviceInfo, ...(saved.deviceInfo || {}) },
      model: { ...d.model, ...(saved.model || {}) },
      motors: saved.motors?.length ? saved.motors : d.motors,
      customParams: saved.customParams || [],
    };
    if (!settings.motors.some((m) => m.id === settings.activeMotorId)) settings.activeMotorId = settings.motors[0].id;
  }
  applyThresholds();
}

export function saveSettings() {
  settings.version++;
  applyThresholds();
  writeJsonSoon('settings.json', () => settings, 200);
}

function applyThresholds() {
  THRESHOLDS.zWarn = settings.thresholds.zWarn;
  THRESHOLDS.zCrit = settings.thresholds.zCrit;
}

export function activeMotor(): MotorProfile {
  return settings.motors.find((m) => m.id === settings.activeMotorId) || settings.motors[0];
}

export function customKeys(): string[] {
  return settings.customParams.map((c) => c.key);
}

/** What every signed-in user needs to draw the dashboard (no secrets, no user list). */
export function publicConfig() {
  const { matrix: _m, ...rest } = settings;
  return { ...rest, activeMotor: activeMotor() };
}

// --- section updaters (each returns a short summary for the audit log) -----

export function setMotor(input: any, isNew: boolean): { motor: MotorProfile; summary: string } {
  const id = str(input?.id, 24, 'Motor ID').toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(id)) throw new InputError('Motor ID: use 2–24 letters, digits or dashes, for example MHM-BENCH-02.');
  const exists = settings.motors.findIndex((m) => m.id === id);
  if (isNew && exists >= 0) throw new InputError(`A motor with ID ${id} already exists.`);
  if (!isNew && exists < 0) throw new InputError(`Motor ${id} was not found.`);
  const name = str(input?.name, 60, 'Name');
  if (!name) throw new InputError('Enter a name for the motor.');
  const m: MotorProfile = {
    id,
    name,
    make: str(input?.make, 80, 'Make'),
    type: str(input?.type, 120, 'Type'),
    power: str(input?.power, 40, 'Power'),
    voltage: str(input?.voltage, 60, 'Supply'),
    connection: str(input?.connection, 80, 'Connection'),
    ratedCurrentA: num(input?.ratedCurrentA, 'Rated current', 0, 1000),
    ratedRpm: num(input?.ratedRpm, 'Rated speed', 0, 30000),
    poles: num(input?.poles, 'Poles', 2, 48),
    frame: str(input?.frame, 30, 'Frame'),
    insulation: str(input?.insulation, 30, 'Insulation'),
    location: str(input?.location, 80, 'Location'),
    installedOn: date(input?.installedOn, 'Installed on'),
    notes: str(input?.notes, 500, 'Notes'),
  };
  if (isNew) settings.motors.push(m);
  else settings.motors[exists] = m;
  saveSettings();
  return { motor: m, summary: `${isNew ? 'Added' : 'Updated'} motor ${id} (${name})` };
}

export function setActiveMotor(id: string) {
  const m = settings.motors.find((x) => x.id === id);
  if (!m) throw new InputError('That motor was not found.');
  const prev = settings.activeMotorId;
  settings.activeMotorId = id;
  saveSettings();
  return { prev, motor: m };
}

export function deleteMotor(id: string) {
  if (id === settings.activeMotorId) throw new InputError('Make another motor active before deleting this one.');
  const i = settings.motors.findIndex((x) => x.id === id);
  if (i < 0) throw new InputError('That motor was not found.');
  settings.motors.splice(i, 1);
  saveSettings();
}

export function setParams(input: any): string[] {
  const changed: string[] = [];
  for (const k of METRIC_KEYS) {
    const v = input?.[k];
    if (!v) continue;
    const label = str(v.label, 60, `${k} label`) || DEFAULT_PARAMS[k].label;
    const p: ParamSetting = {
      label,
      unit: str(v.unit, 12, `${label} unit`) || DEFAULT_PARAMS[k].unit,
      decimals: reqNum(v.decimals ?? DEFAULT_PARAMS[k].decimals, `${label} decimals`, 0, 6),
      what: str(v.what, 800, `${label} description`),
      why: str(v.why, 800, `${label} reason`),
      ...limits(v, label),
    };
    if (JSON.stringify(p) !== JSON.stringify(settings.params[k])) changed.push(k);
    settings.params[k as MetricKey] = p;
  }
  if (changed.length) saveSettings();
  return changed;
}

const RESERVED = new Set([
  'ts', 'device_id', 'source', 'seq', 'boot', 'fw', 'rpm', 'jitter_pct', 'rms_g', 'peak_g', 'crest', 'kurtosis', 'temp_c',
  'temp_rise_c_min', 'i_l1_a', 'i_l2_a', 'i_l3_a', 'cls', 'votes', 'trees', 'model', 'z_max', 'z', 'calibrated', 'sensors',
  'quality', 'class', 'vote_share', 'timestamp_utc', 'extra',
]);

export function setCustomParams(list: any): string {
  if (!Array.isArray(list)) throw new InputError('Send the list of custom parameters.');
  if (list.length > 12) throw new InputError('At most 12 custom parameters.');
  const seen = new Set<string>();
  const out: CustomParam[] = list.map((v: any) => {
    const key = str(v?.key, 31, 'Field name').toLowerCase();
    if (!CUSTOM_KEY_RE.test(key)) throw new InputError(`Field name "${key}": use lower-case letters, digits and _ , starting with a letter.`);
    if (RESERVED.has(key)) throw new InputError(`"${key}" is already a standard field. Choose another name.`);
    if (seen.has(key)) throw new InputError(`"${key}" is listed twice.`);
    seen.add(key);
    const label = str(v?.label, 60, 'Label') || key;
    return {
      key,
      label,
      unit: str(v?.unit, 12, 'Unit'),
      decimals: reqNum(v?.decimals ?? 2, `${label} decimals`, 0, 6),
      what: str(v?.what, 800, 'Description'),
      ...limits(v, label),
    };
  });
  const before = customKeys().join(',');
  settings.customParams = out;
  saveSettings();
  return `Custom parameters: ${before || 'none'} → ${out.map((c) => c.key).join(',') || 'none'}`;
}

export function setThresholds(input: any): string {
  const zWarn = reqNum(input?.zWarn, 'Warning |z|', 0.5, 50);
  const zCrit = reqNum(input?.zCrit, 'Critical |z|', 0.5, 100);
  if (zCrit <= zWarn) throw new InputError('The critical |z| must be larger than the warning |z|.');
  const debounceRows = Math.round(reqNum(input?.debounceRows ?? settings.thresholds.debounceRows, 'Rows to confirm', 1, 30));
  const prev = { ...settings.thresholds };
  settings.thresholds = { zWarn, zCrit, debounceRows };
  saveSettings();
  return `z warning ${prev.zWarn}→${zWarn}, critical ${prev.zCrit}→${zCrit}, confirm rows ${prev.debounceRows}→${debounceRows}`;
}

export function setSystem(input: any): string {
  const changes: string[] = [];
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    if (JSON.stringify(settings[k]) !== JSON.stringify(v)) changes.push(`${String(k)}: ${JSON.stringify(settings[k])} → ${JSON.stringify(v)}`);
    settings[k] = v;
  };
  if (input?.site) set('site', { plantName: str(input.site.plantName, 80, 'Plant name'), station: str(input.site.station, 80, 'Station') });
  if (input?.retentionDays !== undefined) set('retentionDays', Math.round(reqNum(input.retentionDays, 'Keep data for (days)', 1, 120)));
  if (input?.tzOffsetMin !== undefined) set('tzOffsetMin', Math.round(reqNum(input.tzOffsetMin, 'Time-zone offset (minutes)', -720, 840)));
  if (input?.sessionHours !== undefined) set('sessionHours', reqNum(input.sessionHours, 'Session length (hours)', 1, 720));
  if (input?.staleAfterS !== undefined) set('staleAfterS', Math.round(reqNum(input.staleAfterS, 'Stale after (s)', 3, 600)));
  if (input?.offlineAfterS !== undefined) set('offlineAfterS', Math.round(reqNum(input.offlineAfterS, 'Offline after (s)', 5, 3600)));
  if (settings.offlineAfterS <= settings.staleAfterS) throw new InputError('“Offline after” must be longer than “Stale after”.');
  if (input?.showAccountsOnLogin !== undefined) set('showAccountsOnLogin', !!input.showAccountsOnLogin);
  if (changes.length) saveSettings();
  return changes.join('; ') || 'No change';
}

export function setInfo(input: any): string {
  const rows = (v: any, label: string): PinRow[] => {
    if (!Array.isArray(v)) throw new InputError(`${label}: send a list of rows.`);
    if (v.length > 30) throw new InputError(`${label}: at most 30 rows.`);
    return v
      .map((r: any) => [str(r?.[0], 40, 'Module'), str(r?.[1], 40, 'Pin'), str(r?.[2], 200, 'Connection')] as PinRow)
      .filter((r) => r[0] || r[1] || r[2]);
  };
  if (input?.deviceInfo) {
    settings.deviceInfo = {
      boardA: rows(input.deviceInfo.boardA, 'Board A'),
      boardB: rows(input.deviceInfo.boardB, 'Board B'),
      notes: str(input.deviceInfo.notes, 1000, 'Notes'),
    };
  }
  if (input?.model) {
    const m: ModelInfo = {
      algorithm: str(input.model.algorithm, 120, 'Algorithm'),
      classes: str(input.model.classes, 200, 'Classes'),
      trainedOn: str(input.model.trainedOn, 200, 'Trained on'),
      validation: str(input.model.validation, 300, 'Validation'),
    };
    settings.model = m;
  }
  saveSettings();
  return [input?.deviceInfo && 'device information', input?.model && 'model information'].filter(Boolean).join(' and ') + ' updated';
}

export function setMatrix(input: any): { before: PermissionMatrix; after: PermissionMatrix } {
  const clean = (v: any): Permission[] =>
    Array.isArray(v) ? [...new Set(v.filter((p: any) => ALL_PERMISSIONS.includes(p)))] as Permission[] : [];
  const before = JSON.parse(JSON.stringify(settings.matrix));
  settings.matrix = { OPERATOR: clean(input?.OPERATOR), ENGINEER: clean(input?.ENGINEER) };
  saveSettings();
  return { before, after: settings.matrix };
}

// ---------------------------------------------------------------------------
// Maintenance records
// ---------------------------------------------------------------------------
export let maintenance: MaintenanceRecord[] = [];

export function loadMaintenance() {
  maintenance = readJson<MaintenanceRecord[]>('maintenance.json', []);
}
function saveMaintenance() {
  maintenance.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  writeJsonSoon('maintenance.json', () => maintenance, 200);
}

export function upsertMaintenance(input: any, by: string, id?: string): MaintenanceRecord {
  const d = date(input?.date, 'Date done', true);
  const nextDue = date(input?.nextDue, 'Next due');
  if (nextDue && nextDue < d) throw new InputError('The next due date must be on or after the date the work was done.');
  const type = str(input?.type, 40, 'Type') || 'Other';
  const description = str(input?.description, 1000, 'Description');
  if (!description) throw new InputError('Describe the work that was done.');
  const motorId = str(input?.motorId, 24, 'Motor') || settings.activeMotorId;
  if (!settings.motors.some((m) => m.id === motorId)) throw new InputError('Choose one of the listed motors.');
  if (id) {
    const r = maintenance.find((x) => x.id === id);
    if (!r) throw new InputError('That maintenance record was not found.');
    Object.assign(r, { date: d, nextDue, type, description, motorId, doneBy: str(input?.doneBy, 60, 'Done by'), updatedBy: by, updatedAt: Date.now() });
    saveMaintenance();
    return r;
  }
  const r: MaintenanceRecord = {
    id: crypto.randomBytes(5).toString('hex'),
    motorId,
    date: d,
    type,
    description,
    doneBy: str(input?.doneBy, 60, 'Done by'),
    nextDue,
    createdBy: by,
    createdAt: Date.now(),
    updatedBy: null,
    updatedAt: null,
  };
  maintenance.push(r);
  saveMaintenance();
  return r;
}

export function deleteMaintenance(id: string): MaintenanceRecord {
  const i = maintenance.findIndex((x) => x.id === id);
  if (i < 0) throw new InputError('That maintenance record was not found.');
  const [r] = maintenance.splice(i, 1);
  saveMaintenance();
  return r;
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------
export function replaceAll(s: Settings, m: MaintenanceRecord[]) {
  settings = s;
  maintenance = m;
  loadSettingsFromObject();
  saveSettings();
  saveMaintenance();
}
function loadSettingsFromObject() {
  const d = defaultSettings();
  settings = { ...d, ...settings, params: { ...d.params, ...(settings.params || {}) }, matrix: { ...d.matrix, ...(settings.matrix || {}) } };
  if (!settings.motors?.length) settings.motors = d.motors;
  if (!settings.motors.some((x) => x.id === settings.activeMotorId)) settings.activeMotorId = settings.motors[0].id;
}
