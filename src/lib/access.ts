import type { AuthUser, PageKey, Permission } from '../types';

/** Which permission opens each page. null = every signed-in user. 'admin' = admin only. */
export const PAGE_PERMISSION: Record<PageKey, Permission | 'admin' | null> = {
  overview: null,
  parameters: 'page.parameters',
  ai: 'page.ai',
  alerts: null,
  history: 'page.history',
  maintenance: 'page.maintenance',
  device: 'page.device',
  'admin-users': 'admin',
  'admin-motor': 'admin',
  'admin-permissions': 'admin',
  'admin-audit': 'admin',
  'admin-system': 'admin',
};

export function can(user: AuthUser | null, p: Permission | 'admin' | null): boolean {
  if (!user) return false;
  if (p === null) return true;
  if (user.role === 'ADMIN') return true;
  if (p === 'admin') return false;
  return user.permissions.includes(p);
}

export function canOpen(user: AuthUser | null, page: PageKey) {
  return can(user, PAGE_PERMISSION[page]);
}
