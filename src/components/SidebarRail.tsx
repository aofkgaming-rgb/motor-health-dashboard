import React from 'react';
import {
  LayoutGrid,
  Activity,
  Sliders,
  AlertTriangle,
  History,
  Wrench,
  Cpu,
} from 'lucide-react';

interface SidebarRailProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Main Dashboard', icon: LayoutGrid },
    { id: 'oscilloscope', label: 'Waveform Graphs', icon: Activity },
    { id: 'jitter', label: 'Revolution Jitter', icon: Sliders },
    { id: 'ai', label: 'Edge AI Inference', icon: Cpu },
    { id: 'alerts', label: 'Alerts & SOP', icon: AlertTriangle },
    { id: 'history', label: 'Historical Trend', icon: History },
    { id: 'maintenance', label: 'Maintenance SOP', icon: Wrench },
  ];

  return (
    <aside className="w-13 bg-[#182230] border-r border-[#0f1724] flex flex-col items-center py-3 select-none z-20 shrink-0">
      {/* Top Menu Icon */}
      <div className="w-9 h-9 rounded bg-[#2c3b4d]/60 flex items-center justify-center text-slate-300 mb-4 hover:bg-[#2c3b4d] cursor-pointer">
        <LayoutGrid className="w-5 h-5 text-cyan-400" />
      </div>

      <div className="w-7 h-px bg-slate-700/60 mb-3" />

      {/* Nav Icons */}
      <nav className="flex flex-col gap-2 w-full px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              className={`w-9 h-9 rounded flex items-center justify-center cursor-pointer transition-all mx-auto ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-[#222f42]'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </nav>

      {/* Bottom Status Mark (like the small 0.0.22 logo at bottom left in image.png) */}
      <div className="mt-auto flex flex-col items-center gap-1 text-[9px] font-mono text-slate-500">
        <Activity className="w-3.5 h-3.5 text-cyan-500" />
        <span>v1.4</span>
      </div>
    </aside>
  );
};
