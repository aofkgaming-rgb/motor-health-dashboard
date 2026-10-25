import React, { useCallback, useEffect, useState } from 'react';
import type { AuthUser, PageKey } from './types';
import type { FeatureKey } from './shared/contract';
import { LoginScreen } from './components/LoginScreen';
import { Shell } from './components/Shell';
import { useLive } from './lib/useLive';
import { Overview } from './pages/Overview';
import { Parameters } from './pages/Parameters';
import { EdgeAi } from './pages/EdgeAi';
import { Alerts } from './pages/Alerts';
import { History } from './pages/History';
import { Device } from './pages/Device';

const PAGES: PageKey[] = ['overview', 'parameters', 'ai', 'alerts', 'history', 'device'];

function pageFromHash(): PageKey {
  const h = location.hash.replace('#/', '') as PageKey;
  return PAGES.includes(h) ? h : 'overview';
}

function clearStoredToken() {
  localStorage.removeItem('motor_auth_token');
  sessionStorage.removeItem('motor_auth_token');
  localStorage.removeItem('motor_auth_user');
  sessionStorage.removeItem('motor_auth_user');
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<PageKey>(pageFromHash());
  const [param, setParam] = useState<FeatureKey>('rms_g');

  // Restore a saved session — only if the server still accepts the token.
  useEffect(() => {
    const token = localStorage.getItem('motor_auth_token') || sessionStorage.getItem('motor_auth_token');
    if (!token) {
      setChecking(false);
      return;
    }
    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => clearStoredToken())
      .finally(() => setChecking(false));
  }, []);

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

  const logout = useCallback(() => {
    const token = user?.token;
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    clearStoredToken();
    setUser(null);
  }, [user]);

  const live = useLive(user?.token ?? null, logout);

  if (checking) {
    return (
      <div className="min-h-full flex items-center justify-center text-[13px] text-[var(--text-2)]">Checking your session…</div>
    );
  }
  if (!user) return <LoginScreen onLoginSuccess={setUser} />;

  const alertCount = live.alerts.filter(
    (a) => a.source === live.state?.activeSource && a.severity !== 'info' && a.ts > Date.now() - 3600e3,
  ).length;

  return (
    <Shell
      page={page}
      onNavigate={navigate}
      user={user}
      onLogout={logout}
      state={live.state}
      connected={live.connected}
      clockOffset={live.clockOffset}
      alertCount={alertCount}
    >
      {page === 'overview' && (
        <Overview
          rows={live.rows}
          latest={live.latest}
          state={live.state}
          alerts={live.alerts}
          clockOffset={live.clockOffset}
          onNavigate={navigate}
          onOpenParam={(k) => {
            setParam(k);
            navigate('parameters');
          }}
        />
      )}
      {page === 'parameters' && (
        <Parameters token={user.token} rows={live.rows} latest={live.latest} state={live.state} selected={param} onSelect={setParam} />
      )}
      {page === 'ai' && <EdgeAi rows={live.rows} latest={live.latest} state={live.state} alerts={live.alerts} />}
      {page === 'alerts' && <Alerts alerts={live.alerts} state={live.state} />}
      {page === 'history' && <History token={user.token} state={live.state} />}
      {page === 'device' && (
        <Device token={user.token} user={user} state={live.state} clockOffset={live.clockOffset} onChanged={live.refreshRows} />
      )}
    </Shell>
  );
}
