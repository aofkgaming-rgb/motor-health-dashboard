import React, { useState, useEffect, useRef } from 'react';
import {
  MotorTelemetryPoint,
  MotorSensorFeatures,
  MotorCondition,
  SimulationPreset,
  MotorInfo,
  AuthUser,
} from './types';
import {
  evaluateEdgeAiPrediction,
  generateAlerts,
  generateRecommendations,
  getFeatureCondition,
} from './utils/motorCalculations';
import { Header } from './components/Header';
import { SidebarRail } from './components/SidebarRail';
import { AnalogGauge } from './components/AnalogGauge';
import { MetricBoxCard } from './components/MetricBoxCard';
import { FeaturesTableCard } from './components/FeaturesTableCard';
import { RealTimeGraphSection } from './components/RealTimeGraphSection';
import { BarChartSection } from './components/BarChartSection';
import { RevolutionJitterSection } from './components/RevolutionJitterSection';
import { AiPredictionSection } from './components/AiPredictionSection';
import { AlertsPanel } from './components/AlertsPanel';
import { HistoricalSection } from './components/HistoricalSection';
import { RecommendationsSection } from './components/RecommendationsSection';
import { Esp32IntegrationModal } from './components/Esp32IntegrationModal';
import { LoginScreen } from './components/LoginScreen';

export default function App() {
  // Current live telemetry point
  const [currentPoint, setCurrentPoint] = useState<MotorTelemetryPoint>({
    id: 1,
    timestamp: Date.now(),
    rpm: 1785,
    motorTemp: 48.2,
    rmsVibration: 1.35,
    peakValue: 3.52,
    crestFactor: 2.61,
    kurtosis: 3.08,
    revolutionJitter: 0.68,
    temperatureRiseRate: 0.22,
    condition: 'HEALTHY',
    healthScore: 95,
    aiConfidence: 94.5,
    aiPrediction: 'Normal Balanced Operation',
  });

  // History buffer for charts (rolling 120 points)
  const [history, setHistory] = useState<MotorTelemetryPoint[]>([]);

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // User Authentication State
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Connection & status
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('3 minutes ago');
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simulationPreset, setSimulationPreset] = useState<SimulationPreset>('NORMAL');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [demoStep, setDemoStep] = useState<string>('NORMAL');
  const [demoSecondsRemaining, setDemoSecondsRemaining] = useState<number>(12);
  const [isGraphLive, setIsGraphLive] = useState<boolean>(true);

  // Hardware modal
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState<boolean>(false);

  // Motor specs info
  const [motorInfo, setMotorInfo] = useState<MotorInfo>({
    motorId: 'MTR-IND-415V-01',
    model: 'Three-Phase Squirrel Cage Induction (15kW / 20HP)',
    ratedPower: '15 kW',
    ratedVoltage: '415 V 3-Phase 50Hz',
    ratedRpm: 1800,
    currentRpm: 1785,
    status: 'RUNNING',
    operatingTimeHours: 142,
    operatingTimeMinutes: 18,
    samplingRateHz: 10000,
    fftWindowSize: 1024,
    sensors: {
      hallEffect: 'ONLINE',
      accelerometer: 'ONLINE',
      tempProbe: 'ONLINE',
    },
  });

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  // 0. Verify active session token on startup
  useEffect(() => {
    const token = localStorage.getItem('motor_auth_token') || sessionStorage.getItem('motor_auth_token');
    const savedUserJson = localStorage.getItem('motor_auth_user') || sessionStorage.getItem('motor_auth_user');

    if (!token) {
      setIsAuthChecking(false);
      return;
    }

    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((data) => {
        if (data.status === 'authenticated' && data.user) {
          setAuthUser(data.user);
        } else if (savedUserJson) {
          try {
            setAuthUser(JSON.parse(savedUserJson));
          } catch {
            setAuthUser(null);
          }
        }
      })
      .catch(() => {
        if (savedUserJson) {
          try {
            setAuthUser(JSON.parse(savedUserJson));
          } catch {
            setAuthUser(null);
          }
        }
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);

  const handleLogout = async () => {
    const token = authUser?.token || localStorage.getItem('motor_auth_token') || sessionStorage.getItem('motor_auth_token');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token }),
        });
      } catch {
        // Network errors ignored on logout
      }
    }
    localStorage.removeItem('motor_auth_token');
    localStorage.removeItem('motor_auth_user');
    sessionStorage.removeItem('motor_auth_token');
    sessionStorage.removeItem('motor_auth_user');
    setAuthUser(null);
  };

  // 1. Initial REST Sync (only when authenticated)
  useEffect(() => {
    if (!authUser) return;
    let isMounted = true;
    fetch('/api/motor/telemetry?limit=60')
      .then((res) => res.json())
      .then((res) => {
        if (!isMounted) return;
        if (res.latest) setCurrentPoint(res.latest);
        if (res.history && res.history.length > 0) setHistory(res.history);
        if (res.motorInfo) setMotorInfo(res.motorInfo);
        if (res.simulation) {
          setIsSimulating(res.simulation.isSimulating);
          setSimulationPreset(res.simulation.currentMode);
          setIsDemoMode(res.simulation.isDemoMode);
          setDemoStep(res.simulation.demoStep);
          setDemoSecondsRemaining(res.simulation.demoSecondsRemaining);
        }
      })
      .catch((err) => console.error('Failed to fetch initial telemetry:', err));

    return () => {
      isMounted = false;
    };
  }, [authUser]);

  // 2. WebSocket live connection (only when authenticated)
  useEffect(() => {
    if (!authUser) return;
    let ws: WebSocket;
    let reconnectTimer: NodeJS.Timeout;

    function connectWs() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsOnline(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init') {
            if (msg.latest) setCurrentPoint(msg.latest);
            if (msg.history) setHistory(msg.history);
            if (msg.mode) setSimulationPreset(msg.mode);
            if (typeof msg.isSimulating === 'boolean') setIsSimulating(msg.isSimulating);
            if (typeof msg.isDemoMode === 'boolean') setIsDemoMode(msg.isDemoMode);
          } else if (msg.type === 'telemetry_point' && msg.point) {
            const point: MotorTelemetryPoint = msg.point;
            setCurrentPoint(point);
            setLastUpdated('Just now');

            setHistory((prev) => {
              const next = [...prev, point];
              return next.length > 120 ? next.slice(next.length - 120) : next;
            });

            if (msg.mode) setSimulationPreset(msg.mode);
            if (typeof msg.isDemoMode === 'boolean') setIsDemoMode(msg.isDemoMode);
            if (msg.demoStep) setDemoStep(msg.demoStep);
            if (typeof msg.demoSecondsRemaining === 'number') {
              setDemoSecondsRemaining(msg.demoSecondsRemaining);
            }

            setMotorInfo((prev) => ({
              ...prev,
              currentRpm: point.rpm,
            }));
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        setIsOnline(false);
        reconnectTimer = setTimeout(connectWs, 2000);
      };

      ws.onerror = () => {
        setIsOnline(false);
        ws.close();
      };
    }

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
      clearTimeout(reconnectTimer);
    };
  }, [authUser]);

  // Simulation Controls
  const handleToggleSim = async () => {
    const nextAction = isSimulating ? 'STOP_SIM' : 'START_SIM';
    setIsSimulating(!isSimulating);
    try {
      await fetch('/api/motor/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authUser?.token ? { Authorization: `Bearer ${authUser.token}` } : {}),
        },
        body: JSON.stringify({ action: nextAction }),
      });
    } catch (e) {
      console.error('Failed to toggle sim:', e);
    }
  };

  const handleSetPreset = async (preset: SimulationPreset) => {
    setSimulationPreset(preset);
    setIsDemoMode(false);
    try {
      await fetch('/api/motor/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authUser?.token ? { Authorization: `Bearer ${authUser.token}` } : {}),
        },
        body: JSON.stringify({ action: 'SET_PRESET', mode: preset }),
      });
    } catch (e) {
      console.error('Failed to set preset:', e);
    }
  };

  const handleToggleDemo = async () => {
    const nextDemo = !isDemoMode;
    setIsDemoMode(nextDemo);
    try {
      await fetch('/api/motor/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authUser?.token ? { Authorization: `Bearer ${authUser.token}` } : {}),
        },
        body: JSON.stringify({ action: nextDemo ? 'START_DEMO' : 'STOP_DEMO' }),
      });
    } catch (e) {
      console.error('Failed to toggle demo mode:', e);
    }
  };

  // 6 Input Features
  const features: MotorSensorFeatures = {
    rmsVibration: currentPoint.rmsVibration,
    peakValue: currentPoint.peakValue,
    crestFactor: currentPoint.crestFactor,
    kurtosis: currentPoint.kurtosis,
    revolutionJitter: currentPoint.revolutionJitter,
    temperatureRiseRate: currentPoint.temperatureRiseRate,
  };

  const aiData = evaluateEdgeAiPrediction(features);
  const alerts = generateAlerts(features, currentPoint.timestamp);
  const recommendations = generateRecommendations(aiData.condition, features);

  // Status Colors for gauges
  const healthStatusColor =
    aiData.condition === 'CRITICAL' ? 'rose' : aiData.condition === 'WARNING' ? 'amber' : 'emerald';
  const jitterStatusColor =
    features.revolutionJitter > 3.5 ? 'rose' : features.revolutionJitter > 1.5 ? 'amber' : 'emerald';

  // 1. Initial credential verification splash
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-center font-mono select-none">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <span className="text-xs text-cyan-300 uppercase tracking-wider font-semibold">
          Verifying Industrial Security Credentials...
        </span>
      </div>
    );
  }

  // 2. Unauthenticated -> Industrial Login Gateway
  if (!authUser) {
    return <LoginScreen onLoginSuccess={(user) => setAuthUser(user)} />;
  }

  return (
    <div className="min-h-screen bg-[#eef2f6] text-[#1e293b] flex flex-col font-sans selection:bg-cyan-600/20 selection:text-cyan-900">
      {/* Top Header Bar matching screenshot style */}
      <Header
        motorId={motorInfo.motorId}
        rpm={currentPoint.rpm}
        condition={aiData.condition}
        isOnline={isOnline}
        lastUpdated={lastUpdated}
        isSimulating={isSimulating}
        simulationPreset={simulationPreset}
        isDemoMode={isDemoMode}
        demoStep={demoStep}
        demoSecondsRemaining={demoSecondsRemaining}
        onToggleSim={handleToggleSim}
        onSetPreset={handleSetPreset}
        onToggleDemo={handleToggleDemo}
        onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
        authUser={authUser}
        onLogout={handleLogout}
      />

      {/* Main Body Area with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left SCADA Rail */}
        <SidebarRail activeTab={activeTab} onSelectTab={setActiveTab} />

        {/* Primary Dashboard Canvas */}
        <main className="flex-1 p-3 sm:p-4 md:p-5 overflow-y-auto space-y-4 max-w-[1720px] mx-auto w-full">
          {/* Sub-header banner */}
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono pb-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 uppercase tracking-tight">
                Motor Health & Jitter Telemetry View
              </span>
              <span>•</span>
              <span>Motor ID: {motorInfo.motorId}</span>
              <span>•</span>
              <span>Rated: {motorInfo.ratedPower} / {motorInfo.ratedVoltage}</span>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <span>Sampling: 10 kHz Continuous</span>
              <span>•</span>
              <span className="text-cyan-700 font-semibold">ISO 10816-3 Class II</span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* ROW 1: GAUGES (Left) + FEATURES TABLE (Middle) + 4 METERS (Right)         */}
          {/* Exactly matching Top Row in image.png                                    */}
          {/* ========================================================================= */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            {/* Top Left: 2 Analog Dial Gauges */}
            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Gauge 1: Motor Health Score Dial */}
              <AnalogGauge
                title="Health Score"
                subtitle="Calculated Overall"
                value={aiData.healthScore}
                min={0}
                max={100}
                unit="%"
                decimals={1}
                warningThreshold={78}
                criticalThreshold={50}
                inverseThresholds={true}
                statusLabel={aiData.condition}
                statusColor={healthStatusColor}
                timestampText={lastUpdated}
              />

              {/* Gauge 2: Revolution Jitter Dial */}
              <AnalogGauge
                title="Revolution Jitter"
                subtitle="Cycle Variance"
                value={features.revolutionJitter}
                min={0}
                max={5.0}
                unit="%"
                decimals={2}
                warningThreshold={1.5}
                criticalThreshold={3.5}
                inverseThresholds={false}
                statusLabel={features.revolutionJitter > 3.5 ? 'CRITICAL' : features.revolutionJitter > 1.5 ? 'WARNING' : 'NORMAL'}
                statusColor={jitterStatusColor}
                timestampText={lastUpdated}
              />
            </div>

            {/* Top Middle: Condition Features Matrix Table Card */}
            <div className="lg:col-span-5 flex flex-col">
              <FeaturesTableCard
                features={features}
                timestampText={lastUpdated}
              />
            </div>

            {/* Top Right: 4 Single-Metric Cards (Meter A5693, Meter A4356, etc.) */}
            <div className="lg:col-span-3 grid grid-cols-2 gap-3">
              {/* Meter 1: RMS Vibration */}
              <MetricBoxCard
                label="RMS Vibration"
                sublabel="Drive End Bearing"
                value={features.rmsVibration}
                unit="mm/s"
                status={getFeatureCondition('rmsVibration', features.rmsVibration)}
                timestamp={lastUpdated}
                normalRange="< 2.80 mm/s"
              />

              {/* Meter 2: Peak Value */}
              <MetricBoxCard
                label="Peak Value"
                sublabel="Max Impact Amp"
                value={features.peakValue}
                unit="mm/s"
                status={getFeatureCondition('peakValue', features.peakValue)}
                timestamp={lastUpdated}
                normalRange="< 5.50 mm/s"
              />

              {/* Meter 3: Crest Factor */}
              <MetricBoxCard
                label="Crest Factor"
                sublabel="Impulsive Ratio"
                value={features.crestFactor}
                unit="ratio"
                status={getFeatureCondition('crestFactor', features.crestFactor)}
                timestamp={lastUpdated}
                normalRange="< 4.20"
              />

              {/* Meter 4: Kurtosis */}
              <MetricBoxCard
                label="Kurtosis"
                sublabel="Peakedness (Gauss)"
                value={features.kurtosis}
                unit="dimless"
                status={getFeatureCondition('kurtosis', features.kurtosis)}
                timestamp={lastUpdated}
                normalRange="< 4.00"
              />
            </div>
          </section>

          {/* ========================================================================= */}
          {/* ROW 2: VOLTAGE & FREQUENCY WAVEFORMS + ENERGY CONSUMPTION CLUSTER BARS   */}
          {/* Exactly matching Middle Row in image.png                                 */}
          {/* ========================================================================= */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            {/* Left: Waveform Graph on white card */}
            <div className="lg:col-span-7 flex flex-col">
              <RealTimeGraphSection
                history={history}
                isLive={isGraphLive}
                onToggleLive={() => setIsGraphLive(!isGraphLive)}
              />
            </div>

            {/* Right: Clustered Bar Chart on white card */}
            <div className="lg:col-span-5 flex flex-col">
              <BarChartSection history={history} />
            </div>
          </section>

          {/* ========================================================================= */}
          {/* ROW 3: THREE DARK CARDS (Gnd Floor CT, 1st Floor CT, 2nd Floor CT)       */}
          {/* Exactly matching Bottom Row in image.png                                 */}
          {/* ========================================================================= */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-stretch">
            {/* Dark Card 1: Revolution Jitter Microsecond Timing Analyzer */}
            <RevolutionJitterSection
              currentJitter={features.revolutionJitter}
              rpm={currentPoint.rpm}
              history={history}
            />

            {/* Dark Card 2: AI Health Prediction & Feature Importance */}
            <AiPredictionSection
              aiData={aiData}
              features={features}
            />

            {/* Dark Card 3: Fault Detection & SOP Actions Log */}
            <AlertsPanel alerts={alerts} />
          </section>

          {/* ========================================================================= */}
          {/* ROW 4: HISTORICAL DEGRADATION CURVES & ACTIONABLE SOP RECOMMENDATIONS    */}
          {/* ========================================================================= */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            <div className="lg:col-span-6 flex flex-col">
              <HistoricalSection currentHealthScore={aiData.healthScore} />
            </div>
            <div className="lg:col-span-6 flex flex-col">
              <RecommendationsSection
                recommendations={recommendations}
                condition={aiData.condition}
              />
            </div>
          </section>
        </main>
      </div>

      {/* Bottom Industrial Status Bar */}
      <footer className="bg-[#182230] border-t border-[#0f1724] py-2 px-4 text-xs font-mono text-slate-400 select-none">
        <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px]">
            <span>SYSTEM: <strong className="text-white">Edge AI Predictive Maintenance</strong></span>
            <span className="text-slate-600">|</span>
            <span>STANDARDS: <strong className="text-slate-200">ISO 10816-3 (Vibration Severity)</strong></span>
            <span className="text-slate-600">|</span>
            <span>JITTER TIMER: <strong className="text-cyan-400">1 µs Hardware Resolution</strong></span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={() => setIsHardwareModalOpen(true)}
              className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
            >
              ESP32 & Sensors Pinout Guide
            </button>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Station Time: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </footer>

      {/* ESP32 Hardware Modal */}
      <Esp32IntegrationModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
      />
    </div>
  );
}
