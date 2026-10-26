import type { ACQUISITION, Source, TelemetryRow } from './shared/contract';
import type { Permission, Role } from './shared/rbac';
import type { MotorProfile, Settings } from './shared/settings';

export type { Source, TelemetryRow, Permission, Role };

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
  configVersion: number;
  motor: MotorProfile;
  acquisition: typeof ACQUISITION;
}

export interface Alert {
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

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  roleTitle: string;
  station: string;
  token: string;
  sid: string;
  initials: string;
  loginTime: number;
  permissions: Permission[];
}

/** Settings visible to every signed-in user (the permission matrix is admin-only). */
export type PublicConfig = Omit<Settings, 'matrix'> & { activeMotor: MotorProfile };

export type PageKey =
  | 'overview'
  | 'parameters'
  | 'ai'
  | 'alerts'
  | 'history'
  | 'maintenance'
  | 'device'
  | 'admin-users'
  | 'admin-motor'
  | 'admin-permissions'
  | 'admin-audit'
  | 'admin-system';
