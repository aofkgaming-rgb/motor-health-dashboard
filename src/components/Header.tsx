import React from 'react';
import {
  Activity,
  Play,
  Square,
  Sparkles,
  Cpu,
  ChevronDown,
  Clock,
  Zap,
  LogOut,
  Shield,
} from 'lucide-react';
import { MotorCondition, SimulationPreset, AuthUser } from '../types';

interface HeaderProps {
  motorId: string;
  rpm: number;
  condition: MotorCondition;
  isOnline: boolean;
  lastUpdated: string;
  isSimulating: boolean;
  simulationPreset: SimulationPreset;
  isDemoMode: boolean;
  demoStep: string;
  demoSecondsRemaining: number;
  onToggleSim: () => void;
  onSetPreset: (preset: SimulationPreset) => void;
  onToggleDemo: () => void;
  onOpenHardwareModal: () => void;
  authUser?: AuthUser | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  motorId,
  rpm,
  condition,
  isOnline,
  lastUpdated,
  isSimulating,
  simulationPreset,
  isDemoMode,
  demoStep,
  demoSecondsRemaining,
  onToggleSim,
  onSetPreset,
  onToggleDemo,
  onOpenHardwareModal,
  authUser,
  onLogout,
}) => {
  return (
    <header className="bg-[#1e293b] text-white border-b border-[#0f172a] shadow-sm select-none">
      <div className="max-w-[1720px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand Logo & Title matching MobiusFlow style */}
        <div className="flex items-center gap-3.5">
          {/* Logo mark */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xs">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white uppercase">
                  MOBIUS<span className="text-cyan-400 font-light ml-0.5">AI</span>
                </span>
                <span className="text-[10px] bg-slate-700/80 text-cyan-300 font-mono px-1.5 py-0.2 rounded uppercase font-semibold">
                  Edge ML
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block -mt-0.5 font-medium">
                Motor Health Monitor with Revolution Jitter Analysis
              </span>
            </div>
          </div>

          <div className="hidden md:block h-6 w-px bg-slate-700 mx-1" />

          {/* View Dropdown selector (like "Energy Monitoring ▾" in screenshot) */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2c3b4d] text-xs font-semibold text-white border border-slate-600/50 cursor-pointer hover:bg-slate-700 transition-colors">
            <span>Predictive Health View</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        {/* Center: Interactive Simulation and Preset Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Simulation Toggle */}
          <button
            onClick={onToggleSim}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold cursor-pointer transition-all ${
              isSimulating
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            {isSimulating ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            <span>{isSimulating ? 'SIM RUNNING' : 'PAUSED'}</span>
          </button>

          {/* Condition Presets */}
          <div className="hidden sm:flex items-center bg-[#2c3b4d] rounded p-0.5 border border-slate-700 text-xs font-mono">
            <button
              onClick={() => onSetPreset('NORMAL')}
              className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                simulationPreset === 'NORMAL' && !isDemoMode
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => onSetPreset('WARNING')}
              className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                simulationPreset === 'WARNING' && !isDemoMode
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Warning
            </button>
            <button
              onClick={() => onSetPreset('CRITICAL')}
              className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                simulationPreset === 'CRITICAL' && !isDemoMode
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Critical
            </button>
          </div>

          {/* Demo Mode Button */}
          <button
            onClick={onToggleDemo}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold cursor-pointer transition-all ${
              isDemoMode
                ? 'bg-amber-600 text-white animate-pulse'
                : 'bg-[#2c3b4d] text-cyan-300 hover:bg-slate-700 border border-cyan-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isDemoMode ? `DEMO: ${demoStep} (${demoSecondsRemaining}s)` : 'Run Demo Cycle'}</span>
          </button>
        </div>

        {/* Right: Telemetry Status, RPM, User Badge */}
        <div className="flex items-center gap-3">
          {/* Connection Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2c3b4d] border border-slate-700 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300 font-semibold">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          {/* Live RPM Readout */}
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded bg-[#2c3b4d] border border-slate-700 text-xs font-mono">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">RPM:</span>
            <span className="font-bold text-white">{rpm.toLocaleString()}</span>
          </div>

          {/* Motor ID */}
          <div className="hidden md:block text-right text-xs font-mono">
            <span className="text-slate-400 block text-[10px]">MOTOR ID</span>
            <span className="font-bold text-white">{motorId}</span>
          </div>

          {/* Hardware Guide Trigger */}
          <button
            onClick={onOpenHardwareModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-mono font-semibold cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">ESP32 Pinout</span>
          </button>

          {/* User Profile Badge & Logout Button */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-700">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-xs font-mono uppercase">
              {authUser?.initials || 'OP'}
            </div>
            <div className="hidden xl:block text-left text-xs leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white block max-w-[140px] truncate">
                  {authUser?.name || 'Plant Engineer'}
                </span>
                {authUser?.id && (
                  <span className="text-[10px] bg-cyan-950 text-cyan-300 font-mono px-1.5 py-0.5 rounded border border-cyan-800/60 font-bold">
                    {authUser.id}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 block max-w-[150px] truncate">
                {authUser?.roleTitle || 'Condition Monitor'}
              </span>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Lock Station & Sign Out"
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950/80 hover:text-rose-200 text-slate-300 border border-slate-700 hover:border-rose-700/60 text-xs font-mono transition-all cursor-pointer shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-semibold">Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
