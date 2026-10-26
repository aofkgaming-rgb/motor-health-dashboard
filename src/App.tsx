import React, { useCallback, useEffect, useState } from 'react';
import type { AuthUser, PageKey } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Shell } from './components/Shell';
import { Card, EmptyNote } from './components/ui';
import { useLive } from './lib/useLive';
import { useConfig } from './lib/params';
import { canOpen, PAGE_PERMISSION } from './lib/access';
import { Overview } from './pages/Overview';
import { Parameters } from './pages/Parameters';
import { EdgeAi } from './pages/EdgeAi';
import { Alerts } from './pages/Alerts';
import { History } from './pages/History';
import { Maintenance } from './pages/Maintenance';
import { Device } from './pages/Device';
import { AdminUsers } from './pages/admin/Users';
import { AdminMotor } from './pages/admin/MotorParams';
import { AdminPermissions } from './pages/admin/Permissions';
import { AdminAudit } from './pages/admin/Audit';
import { AdminSystem } from './pages/admin/System';

const PAGES = Object.keys(PAGE_PERMISSION) as PageKey[];

function pageFromHash(): PageKey {
  const h = location.hash.replace('#/', '') as PageKey;
  return PAGES.includes(h) ? h : 'overview';
}

function clearStoredToken() {
  localStorage.removeItem('motor_auth_token');
  sessionStorage.removeItem('motor_auth_token');
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<PageKey>(pageFromHash());
  const [param, setParam] = useState<string>('rms_g');
  const [signedOutMsg, setSignedOutMsg] = useState<string | null>(null);

  const verify = useCallback((token: string) => {
    return fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user));
  }, []);

  // Restore a saved session — only if the server still accepts the token.
  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem('motor_auth_token') || sessionStorage.getItem('motor_auth_token');
    } catch {}
    if (!token) {
      setChecking(false);
      return;
    }
    verify(token)
      .catch(() => clearStoredToken())
      .finally(() => setChecking(false));
  }, [verify]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (p: PageKey) => {
    location.hash = `#/${p}`;
    setPage(p);
    window.scrollTo(0, 0);
  };

  const signedOut = useCallback((reason: string) => {
    clearStoredToken();
    setUser(null);
    setSignedOutMsg(reason);
  }, []);

  const logout = useCallback(() => {
    const token = user?.token;
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    clearStoredToken();
    setUser(null);
    setSignedOutMsg(null);
  }, [user]);

  const live = useLive(user?.token ?? null, signedOut);
  const config = useConfig(user?.token ?? null, live.ticks.config + (live.state?.configVersion ?? 0));

  // The admin changed my role or the permission table: re-read my permissions.
  useEffect(() => {
    if (user && (live.ticks.me || live.ticks.config)) verify(user.token).catch(() => signedOut('Your session has ended. Sign in again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.ticks.me, live.ticks.config]);

  if (checking) {
    return <div className="min-h-full flex items-center justify-center text-[13px] text-[var(--text-2)]">Checking your session…</div>;
  }
  if (!user)
    return (
      <LoginScreen
        notice={signedOutMsg}
        onLoginSuccess={(u) => {
          setSignedOutMsg(null);
          setUser(u);
        }}
      />
    );

  const alertCount = live.alerts.filter(
    (a) => a.source === live.state?.activeSource && a.severity !== 'info' && !a.ack && a.ts > Date.now() - 24 * 3600e3,
  ).length;

  const allowed = canOpen(user, page);
  const common = { token: user.token, user, state: live.state, config };

  return (
    <Shell
      page={page}
      onNavigate={navigate}
      user={user}
      config={config}
      onLogout={logout}
      state={live.state}
      connected={live.connected}
      clockOffset={live.clockOffset}
      alertCount={alertCount}
    >
      {!allowed ? (
        <Card title="Not available for your role">
          <EmptyNote
            title={`${user.roleLabel} accounts cannot open this page`}
            action={
              <button type="button" className="btn" onClick={() => navigate('overview')}>
                Go to the overview
              </button>
            }
          >
            Ask the admin if you need it. The admin can change what each role may do in Administration → Permissions.
          </EmptyNote>
        </Card>
      ) : (
        <>
          {page === 'overview' && (
            <Overview
              {...common}
              rows={live.rows}
              latest={live.latest}
              alerts={live.alerts}
              clockOffset={live.clockOffset}
              maintenanceTick={live.ticks.maintenance}
              onNavigate={navigate}
              onOpenParam={(k) => {
                setParam(k);
                navigate(canOpen(user, 'parameters') ? 'parameters' : 'overview');
              }}
            />
          )}
          {page === 'parameters' && (
            <Parameters {...common} rows={live.rows} latest={live.latest} selected={param} onSelect={setParam} maintenanceTick={live.ticks.maintenance} />
          )}
          {page === 'ai' && <EdgeAi {...common} rows={live.rows} latest={live.latest} alerts={live.alerts} />}
          {page === 'alerts' && <Alerts {...common} alerts={live.alerts} />}
          {page === 'history' && <History {...common} maintenanceTick={live.ticks.maintenance + live.ticks.cleared} />}
          {page === 'maintenance' && <Maintenance {...common} tick={live.ticks.maintenance} />}
          {page === 'device' && <Device {...common} clockOffset={live.clockOffset} onChanged={live.refreshRows} />}
          {page === 'admin-users' && <AdminUsers {...common} />}
          {page === 'admin-motor' && <AdminMotor {...common} />}
          {page === 'admin-permissions' && <AdminPermissions {...common} />}
          {page === 'admin-audit' && <AdminAudit {...common} />}
          {page === 'admin-system' && <AdminSystem {...common} />}
        </>
      )}
    </Shell>
  );
}
