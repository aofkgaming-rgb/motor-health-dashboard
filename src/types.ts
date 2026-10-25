import type { ACQUISITION, MOTOR, Source, TelemetryRow } from './shared/contract';

export type { Source, TelemetryRow };

export type DeviceStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'NEVER_CONNECTED';
export type Scenario = 'cycle' | 'healthy' | 'imbalance' | 'impulsive' | 'thermal';

export interface DeviceInfo {
  device_id: string;
  fw: string | null;
  boot: string | null;
  model: string | null;
  calibrated: boolean | null;
  sensors: Record<string, string> | null;
  firstSeen: number;
  lastSeen: number;
  lastRowTs: number;
  rowsAccepted: number;
  rowsDuplicate: number;
  rowsRejected: number;
}

export interface ServerState {
  serverTime: number;
  schema: number;
  activeSource: Source;
  demo: { running: boolean; scenario: Scenario };
  deviceStatus: DeviceStatus;
  device: DeviceInfo | null;
  ingestionConfigured: boolean;
  thresholds: { zWarn: number; zCrit: number };
  staleAfterMs: number;
  offlineAfterMs: number;
  motor: typeof MOTOR;
  acquisition: typeof ACQUISITION;
}

export interface Alert {
  id: string;
  ts: number;
  source: Source;
  device_id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'health' | 'device' | 'sensor' | 'model' | 'data';
  title: string;
  detail: string;
}

export interface AuthUser {
  id: string;
  name: string;
  role: 'ENGINEER' | 'OPERATOR' | 'ADMIN';
  roleTitle: string;
  station: string;
  token: string;
  initials: string;
  loginTime: number;
}

export type PageKey = 'overview' | 'parameters' | 'ai' | 'alerts' | 'history' | 'device';
