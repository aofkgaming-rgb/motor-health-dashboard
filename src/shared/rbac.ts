/**
 * Role-based access control (RBAC) — shared by server and dashboard.
 *
 * The server is the only place permissions are enforced. The dashboard reads the same
 * list only to decide which menu items and buttons to show.
 *
 * ADMIN always has every permission and cannot be restricted (so the admin can never
 * lock themselves out). The OPERATOR and ENGINEER columns are editable by the admin
 * in Administration → Permissions, without a code change.
 */

export type Role = 'OPERATOR' | 'ENGINEER' | 'ADMIN';
export const ROLES: Role[] = ['OPERATOR', 'ENGINEER', 'ADMIN'];

export const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: 'Operator',
  ENGINEER: 'Engineer',
  ADMIN: 'Admin',
};

export const ROLE_PURPOSE: Record<Role, string> = {
  OPERATOR: 'Watches the motor and reacts to alarms',
  ENGINEER: 'Diagnoses faults, studies trends and exports data',
  ADMIN: 'Manages the system, the motor profile, users and permissions',
};

export type Permission =
  | 'page.parameters'
  | 'page.ai'
  | 'page.history'
  | 'page.device'
  | 'page.maintenance'
  | 'history.long'
  | 'export.data'
  | 'alerts.ack'
  | 'maintenance.edit'
  | 'demo.control'
  | 'thresholds.edit';

export const PERMISSIONS: { key: Permission; label: string; help: string; group: 'Pages' | 'Data' | 'Actions' }[] = [
  { key: 'page.parameters', label: 'Parameters page', help: 'Detailed view of each health parameter', group: 'Pages' },
  { key: 'page.ai', label: 'Edge AI page', help: 'Model output, tree agreement and prediction log', group: 'Pages' },
  { key: 'page.history', label: 'History & export page', help: 'Trend charts and the data table', group: 'Pages' },
  { key: 'page.maintenance', label: 'Maintenance page', help: 'Maintenance records (view)', group: 'Pages' },
  { key: 'page.device', label: 'Device page', help: 'Device status, sensors, wiring and packet format', group: 'Pages' },
  { key: 'history.long', label: '7-day and 30-day trends', help: 'Without this, charts are limited to 24 hours', group: 'Data' },
  { key: 'export.data', label: 'Export data (CSV / Excel)', help: 'One-day and date-range exports', group: 'Data' },
  { key: 'alerts.ack', label: 'Acknowledge alerts', help: 'Mark an alert as seen and add a note', group: 'Actions' },
  { key: 'maintenance.edit', label: 'Add and edit maintenance', help: 'Record, change or delete maintenance entries', group: 'Actions' },
  { key: 'demo.control', label: 'Control the demo', help: 'Start, stop and change the demo scenario', group: 'Actions' },
  { key: 'thresholds.edit', label: 'Change alarm thresholds', help: 'Baseline z-score and absolute limits', group: 'Actions' },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export type PermissionMatrix = Record<Exclude<Role, 'ADMIN'>, Permission[]>;

/** Project default: least privilege. The admin can change it at any time. */
export const DEFAULT_MATRIX: PermissionMatrix = {
  OPERATOR: ['page.parameters', 'page.maintenance', 'alerts.ack'],
  ENGINEER: [
    'page.parameters',
    'page.ai',
    'page.history',
    'page.device',
    'page.maintenance',
    'history.long',
    'export.data',
    'alerts.ack',
    'maintenance.edit',
    'demo.control',
  ],
};

export function permissionsFor(role: Role, matrix: PermissionMatrix): Permission[] {
  if (role === 'ADMIN') return [...ALL_PERMISSIONS];
  return (matrix[role] || []).filter((p) => ALL_PERMISSIONS.includes(p));
}
