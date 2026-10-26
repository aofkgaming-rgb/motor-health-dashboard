import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AuthUser } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
  /** Why the user is back here, e.g. "You were signed out by the admin." */
  notice?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, notice }) => {
  // Accounts are listed by the server (the admin can hide this list). Clicking one fills the ID only.
  const [accounts, setAccounts] = useState<{ id: string; name: string; role: string }[]>([]);
  const [identityId, setIdentityId] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    fetch('/api/auth/accounts')
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => {});
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identityId.trim() || !password) {
      setError('Enter your ID and password to continue.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: identityId.trim().toUpperCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        setError(data.error || 'Sign-in failed. Check your ID and password, then try again.');
        return;
      }
      const store = rememberMe ? localStorage : sessionStorage;
      store.setItem('motor_auth_token', data.user.token);
      onLoginSuccess(data.user);
    } catch {
      setError('Cannot reach the server. If the site was idle it may be waking up — wait 30–60 s and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-[var(--canvas)]">
      <div className="w-full max-w-[400px]">
        <div className="mb-6">
          <div className="text-[20px] font-semibold tracking-tight text-[var(--text)]">MHM · Motor Health Monitor</div>
          <p className="text-[13px] text-[var(--text-2)] mt-1">
            Edge AI motor health monitoring with revolution jitter analysis.
          </p>
        </div>

        {notice && (
          <p role="status" className="mb-3 text-[12.5px] rounded-md px-3 py-2 bg-[var(--warn-soft)] text-[var(--warn-ink)]">
            {notice}
          </p>
        )}
        <form onSubmit={submit} className="card p-5 space-y-4" noValidate>
          <div>
            <label htmlFor="uid" className="block text-[12.5px] font-medium text-[var(--text)] mb-1.5">
              User ID
            </label>
            <input
              id="uid"
              className="field num"
              autoComplete="username"
              value={identityId}
              onChange={(e) => {
                setIdentityId(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div>
            <label htmlFor="pw" className="block text-[12.5px] font-medium text-[var(--text)] mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="pw"
                type={showPassword ? 'text' : 'password'}
                className="field pr-10"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Keep me signed in on this computer
          </label>

          {error && (
            <p role="alert" className="text-[12.5px] text-[#a82626] bg-[var(--crit-soft)] rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full justify-center h-10" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {accounts.length > 0 && <div className="mt-4">
          <div className="eyebrow mb-2">Project accounts</div>
          <div className="card divide-y divide-[var(--border)]">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setIdentityId(a.id);
                  setPassword('');
                  setError(null);
                  document.getElementById('pw')?.focus();
                }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-[var(--surface-2)] cursor-pointer ${
                  identityId.toUpperCase() === a.id ? 'bg-[var(--accent-soft)]' : ''
                }`}
              >
                <span>
                  <span className="font-medium text-[var(--text)]">{a.name}</span>
                  <span className="text-[var(--text-2)]"> · {a.role}</span>
                </span>
                <span className="num text-[12px] text-[var(--muted)]">{a.id}</span>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-[var(--muted)] mt-2">Choose your account, then type your password. Each role sees a different set of pages.</p>
        </div>}
      </div>
    </div>
  );
};
