import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { AuthUser } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

const DEMO_PRESETS = [
  {
    id: 'ENG-101',
    password: 'password123',
    name: 'Jeet',
    role: 'Lead Reliability Engineer',
    badgeClass: 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50',
    dotClass: 'bg-cyan-400',
  },
  {
    id: 'OP-202',
    password: 'password123',
    name: 'Dhruchit',
    role: 'Plant Condition Operator',
    badgeClass: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50',
    dotClass: 'bg-emerald-400',
  },
  {
    id: 'ADMIN-001',
    password: 'admin123',
    name: 'Manav Sinh',
    role: 'Industrial Systems Admin',
    badgeClass: 'border-purple-500/50 bg-purple-950/40 text-purple-300 hover:bg-purple-900/50',
    dotClass: 'bg-purple-400',
  },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identityId, setIdentityId] = useState<string>('ENG-101');
  const [password, setPassword] = useState<string>('password123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identityId.trim()) {
      setErrorMessage('Please provide an Identity Number (ID).');
      return;
    }
    if (!password) {
      setErrorMessage('Please provide your security passcode/password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: identityId.trim().toUpperCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setErrorMessage(data.error || 'Authentication failed. Please verify credentials.');
        setIsLoading(false);
        return;
      }

      if (data.status === 'success' && data.user) {
        if (rememberMe) {
          localStorage.setItem('motor_auth_token', data.user.token);
          localStorage.setItem('motor_auth_user', JSON.stringify(data.user));
        } else {
          sessionStorage.setItem('motor_auth_token', data.user.token);
          sessionStorage.setItem('motor_auth_user', JSON.stringify(data.user));
        }
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setErrorMessage('Network connection error. Ensure the monitoring server is online.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectPreset = (preset: typeof DEMO_PRESETS[0]) => {
    setIdentityId(preset.id);
    setPassword(preset.password);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans select-none">
      {/* Dynamic Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 shadow-[0_0_25px_rgba(6,182,212,0.35)] mb-3">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="font-black text-2xl tracking-wider text-white uppercase">
              Intelli<span className="text-cyan-400 font-light">Drive</span>
            </span>
            <span className="text-xs bg-cyan-950/90 text-cyan-300 font-mono px-2 py-0.5 rounded border border-cyan-800/60 uppercase font-bold">
              AI Security Gateway
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Predictive Maintenance & Revolution Jitter Diagnostic Portal
          </p>
        </div>

        {/* Card Box */}
        <div className="bg-[#111827]/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl shadow-2xl p-6 md:p-8">
          {/* Card Top Pill */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wide">
                Identity Authentication
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SECURE GATEWAY
            </span>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identity Number (ID) Field */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium flex items-center justify-between">
                <span>IDENTITY NUMBER (ID)</span>
                <span className="text-[10px] text-slate-500 font-normal">Badge / Operator ID</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                </div>
                <input
                  type="text"
                  value={identityId}
                  onChange={(e) => setIdentityId(e.target.value.toUpperCase())}
                  placeholder="e.g. ENG-101"
                  autoComplete="username"
                  className="w-full pl-10 pr-3 py-2.5 bg-[#0b0f19] border border-slate-700 rounded-xl text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all uppercase tracking-wider"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium flex items-center justify-between">
                <span>SECURITY PASSWORD</span>
                <span className="text-[10px] text-slate-500 font-normal">Encrypted Passcode</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter passcode"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-[#0b0f19] border border-slate-700 rounded-xl text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember & Station info */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span>Remember session</span>
              </label>
              <span className="text-[11px] font-mono text-slate-500">Station 01 — 415V Induction</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.99] text-white font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(6,182,212,0.25)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>AUTHENTICATING IDENTITY...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>SIGN IN TO MOTOR DASHBOARD</span>
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Selection */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
              <span>Quick-Access Authorized Roles</span>
              <span className="text-[9px] text-cyan-400/80">Click to fill</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs font-mono transition-all flex items-center justify-between cursor-pointer ${preset.badgeClass}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${preset.dotClass}`} />
                    <span className="font-bold text-white">{preset.id}</span>
                    <span className="text-slate-400 text-[11px]">({preset.name.split(' ')[0]})</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">{preset.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Compliance Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-cyan-500" />
            IEC 62443 Industrial Security
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-500" />
            256-Bit Edge Session
          </span>
          <span>•</span>
          <span>MTR-IND-415V-01</span>
        </div>
      </div>
    </div>
  );
};
