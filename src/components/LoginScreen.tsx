import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AuthUser } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

// The three project accounts (unchanged). Click one to fill the form.
const ACCOUNTS = [
  { id: 'ENG-101', password: 'password123', name: 'Jeet', role: 'Engineer' },
  { id: 'OP-202', password: 'password123', name: 'Dhruchit', role: 'Operator' },
  { id: 'ADMIN-001', password: 'admin123', name: 'Manav Sinh', role: 'Admin' },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identityId, setIdentityId] = useState('ENG-101');
  const [password, setPassword] = useState('password123');
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

        <div className="mt-4">
          <div className="eyebrow mb-2">Project accounts</div>
          <div className="card divide-y divide-[var(--border)]">
            {ACCOUNTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setIdentityId(a.id);
                  setPassword(a.password);
                  setError(null);
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
        </div>
      </div>
    </div>
  );
};
