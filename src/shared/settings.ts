/**
 * Settings the admin can change from the dashboard (Administration pages).
 * Stored by the server in DATA_DIR/settings.json. Shared types for server and dashboard.
 */
import { MOTOR } from './contract';
import { DEFAULT_MATRIX, PermissionMatrix } from './rbac';

// ---------------------------------------------------------------------------
// Motor profiles — the admin can add a new motor and switch the active one
// ---------------------------------------------------------------------------
export interface MotorProfile {
  id: string;
  name: string;
  make: string;
  type: string;
  power: string;
  voltage: string;
  connection: string;
  ratedCurrentA: number | null;
  ratedRpm: number | null;
  poles: number | null;
  frame: string;
  insulation: string;
  location: string;
  installedOn: string; // YYYY-MM-DD or ''
  notes: string;
}

// ---------------------------------------------------------------------------
// Parameters — built-in metrics (fixed packet fields) and admin-added custom ones
// ---------------------------------------------------------------------------
export type MetricKey =
  | 'rms_g'
  | 'peak_g'
  | 'crest'
  | 'kurtosis'
  | 'jitter_pct'
  | 'temp_rise_c_min'
  | 'rpm'
  | 'temp_c'
  | 'current';

export const METRIC_KEYS: MetricKey[] = [
  'rms_g',
  'peak_g',
  'crest',
  'kurtosis',
  'jitter_pct',
  'temp_rise_c_min',
  'rpm',
  'temp_c',
  'current',
];

/** Absolute limits are optional. null = not used; health then relies on the baseline z-score only. */
export interface Limits {
  warnHigh: number | null;
  critHigh: number | null;
  warnLow: number | null;
  critLow: number | null;
}

export interface ParamSetting extends Limits {
  label: string;
  unit: string;
  decimals: number;
  /** Optional replacement for the ⓘ text. Empty = use the built-in explanation. */
  what: string;
  why: string;
}

export interface CustomParam extends Limits {
  key: string; // field name Board B sends in the packet, e.g. "vib_axial_g"
  label: string;
  unit: string;
  decimals: number;
  what: string;
}

export const CUSTOM_KEY_RE = /^[a-z][a-z0-9_]{1,30}$/;

const NO_LIMITS: Limits = { warnHigh: null, critHigh: null, warnLow: null, critLow: null };

export const DEFAULT_PARAMS: Record<MetricKey, ParamSetting> = {
  rms_g: { label: 'RMS vibration', unit: 'g', decimals: 3, what: '', why: '', ...NO_LIMITS },
  peak_g: { label: 'Peak vibration', unit: 'g', decimals: 3, what: '', why: '', ...NO_LIMITS },
  crest: { label: 'Crest factor', unit: '—', decimals: 2, what: '', why: '', ...NO_LIMITS },
  kurtosis: { label: 'Kurtosis', unit: '—', decimals: 2, what: '', why: '', ...NO_LIMITS },
  jitter_pct: { label: 'Revolution jitter', unit: '%', decimals: 3, what: '', why: '', ...NO_LIMITS },
  temp_rise_c_min: { label: 'Temperature rise rate', unit: '°C/min', decimals: 2, what: '', why: '', ...NO_LIMITS },
  rpm: { label: 'Shaft speed', unit: 'rpm', decimals: 0, what: '', why: '', ...NO_LIMITS },
  temp_c: { label: 'Surface temperature', unit: '°C', decimals: 1, what: '', why: '', ...NO_LIMITS },
  current: { label: 'Phase current (highest of L1–L3)', unit: 'A', decimals: 2, what: '', why: '', ...NO_LIMITS },
};

// ---------------------------------------------------------------------------
// Information shown on the Device and Edge AI pages
// ---------------------------------------------------------------------------
export type PinRow = [string, string, string];

export interface DeviceInfoSettings {
  boardA: PinRow[];
  boardB: PinRow[];
  notes: string;
}

export interface ModelInfo {
  algorithm: string;
  classes: string;
  trainedOn: string;
  validation: string;
}

// ---------------------------------------------------------------------------
// Maintenance records
// ---------------------------------------------------------------------------
export const MAINTENANCE_TYPES = [
  'Inspection',
  'Lubrication / greasing',
  'Bearing replaced',
  'Alignment / balancing',
  'Cleaning',
  'Electrical check',
  'Corrective repair',
  'Other',
] as const;

export interface MaintenanceRecord {
  id: string;
  motorId: string;
  date: string; // YYYY-MM-DD, the day the work was done
  type: string;
  description: string;
  doneBy: string;
  nextDue: string; // YYYY-MM-DD or ''
  createdBy: string;
  createdAt: number;
  updatedBy: string | null;
  updatedAt: number | null;
}

// ---------------------------------------------------------------------------
// All settings
// ---------------------------------------------------------------------------
export interface Settings {
  version: number; // increases on every save; the dashboard reloads when it changes
  site: { plantName: string; station: string };
  motors: MotorProfile[];
  activeMotorId: string;
  params: Record<MetricKey, ParamSetting>;
  customParams: CustomParam[];
  thresholds: { zWarn: number; zCrit: number; debounceRows: number };
  staleAfterS: number;
  offlineAfterS: number;
  retentionDays: number;
  tzOffsetMin: number; // used to cut the data into calendar days (India: +330)
  sessionHours: number;
  showAccountsOnLogin: boolean;
  matrix: PermissionMatrix;
  deviceInfo: DeviceInfoSettings;
  model: ModelInfo;
}

export const DEFAULT_MOTOR: MotorProfile = {
  id: MOTOR.id,
  name: 'Bench motor 01',
  make: MOTOR.make,
  type: MOTOR.type,
  power: MOTOR.power,
  voltage: MOTOR.voltage,
  connection: MOTOR.connection,
  ratedCurrentA: 2.0,
  ratedRpm: MOTOR.ratedRpm,
  poles: MOTOR.poles,
  frame: MOTOR.frame,
  insulation: MOTOR.insulation,
  location: 'EEE lab, test bench 01',
  installedOn: '',
  notes: '',
};

/** Pin maps as in the current schematic (designed, not yet verified on hardware). */
export const DEFAULT_DEVICE_INFO: DeviceInfoSettings = {
  boardA: [
    ['ADXL345', 'SDA / SCL', 'GPIO21 / GPIO22 (I²C bus 0, 400 kHz) · SDO→GND (0x53) · CS→3V3'],
    ['MLX90614', 'SDA / SCL', 'GPIO25 / GPIO26 (I²C bus 1, 100 kHz) · VIN 3.3 V'],
    ['A3144 Hall', 'OUT', 'GPIO27, internal pull-up to 3.3 V, falling-edge interrupt · VCC from VIN (5 V) · no 5 V pull-up'],
    ['ZMCT103C L1', 'AO', '22 kΩ / 15 kΩ divider + 33 nF → GPIO34 (ADC1)'],
    ['ZMCT103C L2', 'AO', '22 kΩ / 15 kΩ divider + 33 nF → GPIO35 (ADC1)'],
    ['ZMCT103C L3', 'AO', '22 kΩ / 15 kΩ divider + 33 nF → GPIO32 (ADC1)'],
    ['UART to Board B', 'TX2', 'GPIO17 → Board B GPIO16 · 115200 baud · common GND'],
  ],
  boardB: [
    ['OLED SSD1306', 'SDA / SCL', 'GPIO21 / GPIO22 (0x3C)'],
    ['DS3231 RTC', 'SDA / SCL', 'GPIO21 / GPIO22 shared (0x68)'],
    ['microSD', 'CS / SCK / MISO / MOSI', 'GPIO5 / 18 / 19 / 23 · VCC 5 V'],
    ['UART from Board A', 'RX2', 'GPIO16 ← Board A GPIO17'],
  ],
  notes:
    'Measure each CT module’s AO voltage with a multimeter before connecting it to a GPIO. With 22 kΩ / 15 kΩ a 5 V signal becomes about 2.0 V at the pin.',
};

export const DEFAULT_MODEL: ModelInfo = {
  algorithm: 'Random Forest (exported to C++ with micromlgen)',
  classes: 'Healthy, Imbalance (MaFaulDa normal + imbalance)',
  trainedOn: 'Not trained yet',
  validation: 'Not available — training in progress',
};

export function defaultSettings(): Settings {
  return {
    version: 1,
    site: { plantName: 'Navrachana University · EEE lab', station: 'Motor Test Bench 01' },
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
    model: { ...DEFAULT_MODEL },
  };
}

/** Calendar day (YYYY-MM-DD) of a timestamp in the configured time zone. */
export function dayKey(ts: number, tzOffsetMin: number): string {
  return new Date(ts + tzOffsetMin * 60000).toISOString().slice(0, 10);
}

/** Start of a calendar day (YYYY-MM-DD) in the configured time zone, as unix ms. */
export function dayStart(day: string, tzOffsetMin: number): number {
  return Date.parse(`${day}T00:00:00Z`) - tzOffsetMin * 60000;
}

/** Severity of a value against optional absolute limits. */
export function limitSeverity(v: number | null | undefined, l: Limits): 'normal' | 'warning' | 'critical' | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const any = l.warnHigh !== null || l.critHigh !== null || l.warnLow !== null || l.critLow !== null;
  if (!any) return null;
  if ((l.critHigh !== null && v >= l.critHigh) || (l.critLow !== null && v <= l.critLow)) return 'critical';
  if ((l.warnHigh !== null && v >= l.warnHigh) || (l.warnLow !== null && v <= l.warnLow)) return 'warning';
  return 'normal';
}
