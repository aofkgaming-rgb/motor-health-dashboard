/**
 * Users, sessions, permissions and the audit log.
 *
 * - Passwords are stored as scrypt hashes in DATA_DIR/users.json (never in plain text).
 * - Sessions are random 256-bit tokens kept in memory; the admin can list and end them.
 * - Every request is checked here, on the server. Hiding a button in the browser is not security.
 */
import crypto from 'crypto';
import type express from 'express';
import { Permission, Role, ROLES, permissionsFor } from '../src/shared/rbac';
import { appendLine, dataPath, readJson, writeJsonSoon } from './persist';
import fs from 'fs';

export interface User {
  id: string;
  name: string;
  role: Role;
  roleTitle: string;
  initials: string;
  enabled: boolean;
  pwHash: string; // scrypt$salt$hash
  createdAt: number;
  lastLoginAt: number | null;
  pwChangedAt: number | null;
}

export type PublicUser = Omit<User, 'pwHash'>;

export interface Session {
  token: string;
  sid: string; // short public id, safe to show to the admin
  userId: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  ip: string;
  agent: string;
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `scrypt$${salt}$${h}`;
}

export function checkPassword(pw: string, stored: string): boolean {
  const [alg, salt, h] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const a = crypto.scryptSync(pw, salt, 32);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use at least 8 characters for the password.';
  if (pw.length > 128) return 'Use at most 128 characters for the password.';
  return null;
}

// ---------------------------------------------------------------------------
// Users (seeded once with the three project accounts)
// ---------------------------------------------------------------------------
const SEED: { id: string; name: string; role: Role; roleTitle: string; initials: string; pw: string }[] = [
  { id: 'ADMIN-001', name: 'Manav Sinh', role: 'ADMIN', roleTitle: 'Systems Administrator', initials: 'MV', pw: 'admin123' },
  { id: 'ENG-101', name: 'Jeet', role: 'ENGINEER', roleTitle: 'Lead Reliability Engineer', initials: 'JT', pw: 'password123' },
  { id: 'OP-202', name: 'Dhruchit', role: 'OPERATOR', roleTitle: 'Plant Condition Operator', initials: 'DH', pw: 'password123' },
];

export const users = new Map<string, User>();

export function loadUsers() {
  const list = readJson<User[] | null>('users.json', null);
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
        pwChangedAt: null,
      });
    }
    saveUsers();
  }
}

export function saveUsers() {
  writeJsonSoon('users.json', () => [...users.values()], 200);
}

export function publicUser(u: User): PublicUser {
  const { pwHash: _h, ...p } = u;
  return p;
}

export function adminCount(except?: string) {
  return [...users.values()].filter((u) => u.role === 'ADMIN' && u.enabled && u.id !== except).length;
}

export const USER_ID_RE = /^[A-Z][A-Z0-9-]{2,19}$/;
export function isRole(r: unknown): r is Role {
  return ROLES.includes(r as Role);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export const sessions = new Map<string, Session>();

/** Called when a session ends, so the server can close that user's live connection. */
let onEnd: (s: Session, reason: string) => void = () => {};
export function onSessionEnd(fn: typeof onEnd) {
  onEnd = fn;
}

export function createSession(u: User, req: express.Request, hours: number): Session {
  const s: Session = {
    token: crypto.randomBytes(32).toString('hex'),
    sid: crypto.randomBytes(4).toString('hex'),
    userId: u.id,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    expiresAt: Date.now() + hours * 3600e3,
    ip: clientIp(req),
    agent: String(req.headers['user-agent'] || '').slice(0, 160),
  };
  sessions.set(s.token, s);
  return s;
}

export function endSession(token: string, reason: string) {
  const s = sessions.get(token);
  if (!s) return;
  sessions.delete(token);
  onEnd(s, reason);
}

export function endSessionsOf(userId: string, reason: string, exceptToken?: string) {
  let n = 0;
  for (const s of [...sessions.values()]) {
    if (s.userId === userId && s.token !== exceptToken) {
      endSession(s.token, reason);
      n++;
    }
  }
  return n;
}

export function sessionFromToken(token: string | undefined | null): { s: Session; u: User } | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  const u = users.get(s.userId);
  if (Date.now() > s.expiresAt || !u || !u.enabled) {
    endSession(token, 'expired');
    return null;
  }
  s.lastSeen = Date.now();
  return { s, u };
}

export function clientIp(req: express.Request) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (f || req.socket.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
}

function bearer(req: express.Request) {
  const h = req.headers['authorization'];
  return h ? h.replace(/^Bearer\s+/i, '').trim() : null;
}

// ---------------------------------------------------------------------------
// Sign-in throttling: 5 wrong passwords for one ID → 5 minutes locked
// ---------------------------------------------------------------------------
const failures = new Map<string, { n: number; until: number }>();
export function lockedFor(id: string): number {
  const f = failures.get(id);
  return f && f.until > Date.now() ? f.until - Date.now() : 0;
}
export function noteFailure(id: string) {
  const f = failures.get(id) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) {
    f.until = Date.now() + 5 * 60e3;
    f.n = 0;
  }
  failures.set(id, f);
}
export function clearFailures(id: string) {
  failures.delete(id);
}

// ---------------------------------------------------------------------------
// Permission middleware
// ---------------------------------------------------------------------------
let getMatrix: () => any = () => ({ OPERATOR: [], ENGINEER: [] });
export function useMatrix(fn: typeof getMatrix) {
  getMatrix = fn;
}

export function userPermissions(u: User): Permission[] {
  return permissionsFor(u.role, getMatrix());
}

export function can(u: User, p: Permission | 'admin'): boolean {
  if (u.role === 'ADMIN') return true;
  if (p === 'admin') return false;
  return userPermissions(u).includes(p);
}

export interface AuthedRequest extends express.Request {
  auth: { s: Session; u: User };
}

/** `requireAuth()` = any signed-in user; `requireAuth('export.data')`; `requireAuth('admin')`. */
export function requireAuth(perm?: Permission | 'admin'): express.RequestHandler {
  return (req, res, next) => {
    const a = sessionFromToken(bearer(req));
    if (!a) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
    if (perm && !can(a.u, perm)) {
      audit(a.u, 'access.denied', `${req.method} ${req.path}`, { perm }, req);
      return res
        .status(403)
        .json({ error: perm === 'admin' ? 'Only the admin can do this.' : 'Your role does not include this. Ask the admin to change your permissions.' });
    }
    (req as AuthedRequest).auth = a;
    next();
  };
}

// ---------------------------------------------------------------------------
// Audit log — one JSON line per action in DATA_DIR/audit.ndjson, newest 3000 in memory
// ---------------------------------------------------------------------------
export interface AuditEntry {
  id: string;
  ts: number;
  userId: string;
  userName: string;
  role: Role | '—';
  action: string; // e.g. "auth.login", "settings.motor", "maintenance.add"
  summary: string;
  detail?: Record<string, unknown>;
  ip: string;
}

export const auditLog: AuditEntry[] = [];
const AUDIT_MEM = 3000;

export function loadAudit() {
  try {
    const lines = fs.readFileSync(dataPath('audit.ndjson'), 'utf8').trim().split('\n').slice(-AUDIT_MEM);
    for (const l of lines) {
      try {
        auditLog.push(JSON.parse(l));
      } catch {}
    }
  } catch {}
}

let onAudit: (e: AuditEntry) => void = () => {};
export function onAuditEntry(fn: typeof onAudit) {
  onAudit = fn;
}

export function audit(
  u: Pick<User, 'id' | 'name' | 'role'> | null,
  action: string,
  summary: string,
  detail?: Record<string, unknown>,
  req?: express.Request,
) {
  const e: AuditEntry = {
    id: crypto.randomBytes(6).toString('hex'),
    ts: Date.now(),
    userId: u?.id ?? '—',
    userName: u?.name ?? '—',
    role: u?.role ?? '—',
    action,
    summary,
    detail,
    ip: req ? clientIp(req) : '',
  };
  auditLog.push(e);
  if (auditLog.length > AUDIT_MEM) auditLog.shift();
  try {
    appendLine('audit.ndjson', JSON.stringify(e));
  } catch {}
  onAudit(e);
}
