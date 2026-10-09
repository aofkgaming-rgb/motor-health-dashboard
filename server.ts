import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface MotorSensorFeatures {
  rmsVibration: number;
  peakValue: number;
  crestFactor: number;
  kurtosis: number;
  revolutionJitter: number;
  temperatureRiseRate: number;
}

interface MotorTelemetryPoint extends MotorSensorFeatures {
  id: number;
  timestamp: number;
  rpm: number;
  motorTemp: number;
  condition: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  healthScore: number;
  aiConfidence: number;
  aiPrediction: string;
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();
app.use(express.json());

// In-memory buffer for motor telemetry
const MAX_BUFFER_SIZE = 1000;
const telemetryBuffer: MotorTelemetryPoint[] = [];
const connectedSockets = new Set<WebSocket>();
let packetCounter = 0;
let lastPacketTime = Date.now();
let isSimulating = true;
let currentMode: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
let isDemoMode = false;
let demoStepIndex = 0;
let demoTimeInStep = 0;
const DEMO_STEPS: ('NORMAL' | 'WARNING' | 'CRITICAL')[] = ['NORMAL', 'WARNING', 'CRITICAL', 'NORMAL'];
const DEMO_STEP_SECONDS = 12;

let motorRpm = 1785;
let motorTemp = 48.2;
let operatingSeconds = 142 * 3600 + 18 * 60; // 142 hours 18 minutes

// Helper to calculate health condition from the 6 features
function evaluateMotorState(f: MotorSensorFeatures): {
  condition: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  healthScore: number;
  aiConfidence: number;
  aiPrediction: string;
} {
  // Feature thresholds:
  // rmsVibration: warn 2.8, crit 4.5
  // peakValue: warn 5.5, crit 9.0
  // crestFactor: warn 4.2, crit 6.0
  // kurtosis: warn 4.0, crit 6.0
  // revolutionJitter: warn 1.5, crit 3.5
  // temperatureRiseRate: warn 0.65, crit 1.5

  const jitterP = Math.max(0, (f.revolutionJitter - 0.7) / (3.5 - 0.7)) * 32;
  const rmsP = Math.max(0, (f.rmsVibration - 1.2) / (4.5 - 1.2)) * 26;
  const kurtP = Math.max(0, (f.kurtosis - 3.0) / (6.0 - 3.0)) * 14;
  const crestP = Math.max(0, (f.crestFactor - 2.8) / (6.0 - 2.8)) * 12;
  const tempP = Math.max(0, (f.temperatureRiseRate - 0.2) / (1.5 - 0.2)) * 16;

  const penalty = Math.min(95, jitterP + rmsP + kurtP + crestP + tempP);
  const healthScore = Math.max(5, Math.min(100, Math.round(100 - penalty)));

  if (f.revolutionJitter >= 3.5 || f.rmsVibration >= 4.5 || f.temperatureRiseRate >= 1.5 || healthScore < 50) {
    return {
      condition: 'CRITICAL',
      healthScore,
      aiConfidence: 96.4,
      aiPrediction: f.revolutionJitter >= 3.5 
        ? 'Critical Torsional Revolution Jitter & Shaft Misalignment'
        : 'High Vibration & Severe Bearing Raceway Flaking',
    };
  }

  if (f.revolutionJitter >= 1.5 || f.rmsVibration >= 2.8 || f.crestFactor >= 4.2 || f.kurtosis >= 4.0 || f.temperatureRiseRate >= 0.65 || healthScore < 78) {
    return {
      condition: 'WARNING',
      healthScore,
      aiConfidence: 91.8,
      aiPrediction: f.revolutionJitter >= 1.5
        ? 'Incipient Shaft Jitter & Coupling Eccentricity'
        : 'Early Bearing Surface Stress & High Kurtosis Peakedness',
    };
  }

  return {
    condition: 'HEALTHY',
    healthScore,
    aiConfidence: 95.2,
    aiPrediction: 'Normal Balanced Operation',
  };
}

// Generate realistic simulated values based on target mode
function generateSimulatedFeatures(mode: 'NORMAL' | 'WARNING' | 'CRITICAL'): MotorSensorFeatures {
  const t = Date.now() / 1000;
  const jitterNoise = (Math.sin(t * 1.5) * 0.15 + (Math.random() - 0.5) * 0.1);
  const vibNoise = (Math.sin(t * 2.3) * 0.2 + (Math.random() - 0.5) * 0.15);

  if (mode === 'CRITICAL') {
    // Critical state: heavy jitter, high rms, high crest and kurtosis, rapid heat rise
    const jitter = Number((3.8 + Math.sin(t * 0.8) * 0.6 + jitterNoise).toFixed(2));
    const rms = Number((4.9 + Math.sin(t * 1.2) * 0.5 + vibNoise).toFixed(2));
    const peak = Number((rms * (4.5 + Math.random() * 0.8)).toFixed(2));
    const crest = Number((peak / Math.max(0.1, rms)).toFixed(2));
    const kurt = Number((6.8 + Math.sin(t * 0.5) * 0.7 + (Math.random() - 0.5) * 0.4).toFixed(2));
    const tempRise = Number((1.85 + Math.sin(t * 0.2) * 0.35 + (Math.random() - 0.5) * 0.1).toFixed(2));
    return {
      rmsVibration: rms,
      peakValue: peak,
      crestFactor: crest,
      kurtosis: kurt,
      revolutionJitter: Math.max(2.8, jitter),
      temperatureRiseRate: tempRise,
    };
  }

  if (mode === 'WARNING') {
    // Warning state: noticeable jitter 1.8 - 2.6%, rms 3.1 - 3.8 mm/s, crest 4.4, temp rise 0.85
    const jitter = Number((2.1 + Math.sin(t * 0.7) * 0.4 + jitterNoise).toFixed(2));
    const rms = Number((3.3 + Math.sin(t * 1.0) * 0.35 + vibNoise).toFixed(2));
    const peak = Number((rms * (3.8 + Math.random() * 0.4)).toFixed(2));
    const crest = Number((peak / Math.max(0.1, rms)).toFixed(2));
    const kurt = Number((4.6 + Math.sin(t * 0.4) * 0.5 + (Math.random() - 0.5) * 0.3).toFixed(2));
    const tempRise = Number((0.85 + Math.sin(t * 0.3) * 0.2 + (Math.random() - 0.5) * 0.08).toFixed(2));
    return {
      rmsVibration: rms,
      peakValue: peak,
      crestFactor: crest,
      kurtosis: kurt,
      revolutionJitter: Math.max(1.3, jitter),
      temperatureRiseRate: tempRise,
    };
  }

  // Normal healthy state: smooth, jitter < 1.0%, rms ~1.4 mm/s, crest ~2.8, kurt ~3.0, temp rise ~0.2
  const jitter = Number((0.68 + Math.sin(t * 0.5) * 0.15 + (Math.random() - 0.5) * 0.08).toFixed(2));
  const rms = Number((1.35 + Math.sin(t * 0.8) * 0.18 + (Math.random() - 0.5) * 0.1).toFixed(2));
  const peak = Number((rms * (2.6 + (Math.random() - 0.5) * 0.25)).toFixed(2));
  const crest = Number((peak / Math.max(0.1, rms)).toFixed(2));
  const kurt = Number((3.05 + Math.sin(t * 0.3) * 0.2 + (Math.random() - 0.5) * 0.15).toFixed(2));
  const tempRise = Number((0.22 + Math.sin(t * 0.15) * 0.08 + (Math.random() - 0.5) * 0.03).toFixed(2));
  return {
    rmsVibration: Math.max(0.4, rms),
    peakValue: Math.max(1.0, peak),
    crestFactor: Math.max(1.8, crest),
    kurtosis: Math.max(2.5, kurt),
    revolutionJitter: Math.max(0.2, jitter),
    temperatureRiseRate: Math.max(0.05, tempRise),
  };
}

// Seed initial historical buffer so charts are never empty
const initialTime = Date.now() - 60 * 1000;
for (let i = 0; i < 60; i++) {
  const t = initialTime + i * 1000;
  const feat = generateSimulatedFeatures('NORMAL');
  const evaluation = evaluateMotorState(feat);
  telemetryBuffer.push({
    id: ++packetCounter,
    timestamp: t,
    rpm: 1785 + Math.floor((Math.random() - 0.5) * 8),
    motorTemp: Number((46.5 + (i / 60) * 1.5).toFixed(1)),
    ...feat,
    ...evaluation,
  });
}

// Push a new packet
function pushTelemetry(packet: Partial<MotorTelemetryPoint>) {
  packetCounter++;
  const now = Date.now();
  lastPacketTime = now;
  operatingSeconds++;

  const features: MotorSensorFeatures = {
    rmsVibration: packet.rmsVibration ?? 1.35,
    peakValue: packet.peakValue ?? 3.5,
    crestFactor: packet.crestFactor ?? 2.6,
    kurtosis: packet.kurtosis ?? 3.1,
    revolutionJitter: packet.revolutionJitter ?? 0.65,
    temperatureRiseRate: packet.temperatureRiseRate ?? 0.2,
  };

  const evalResult = evaluateMotorState(features);

  // Speed and temperature simulation response
  if (evalResult.condition === 'CRITICAL') {
    motorRpm = Math.max(1620, Math.min(1850, 1750 + Math.floor((Math.random() - 0.5) * 45)));
    motorTemp = Number((motorTemp + 0.04).toFixed(1));
  } else if (evalResult.condition === 'WARNING') {
    motorRpm = Math.max(1730, Math.min(1810, 1775 + Math.floor((Math.random() - 0.5) * 18)));
    motorTemp = Number((motorTemp + 0.015).toFixed(1));
  } else {
    motorRpm = 1785 + Math.floor((Math.random() - 0.5) * 6);
    if (motorTemp > 48.0) {
      motorTemp = Number((motorTemp - 0.02).toFixed(1));
    }
  }

  const completePoint: MotorTelemetryPoint = {
    id: packetCounter,
    timestamp: packet.timestamp || now,
    rpm: packet.rpm ?? motorRpm,
    motorTemp: packet.motorTemp ?? motorTemp,
    ...features,
    condition: evalResult.condition,
    healthScore: evalResult.healthScore,
    aiConfidence: evalResult.aiConfidence,
    aiPrediction: evalResult.aiPrediction,
  };

  telemetryBuffer.push(completePoint);
  if (telemetryBuffer.length > MAX_BUFFER_SIZE) {
    telemetryBuffer.shift();
  }

  // Broadcast WebSocket message
  const msg = JSON.stringify({
    type: 'telemetry_point',
    point: completePoint,
    mode: currentMode,
    isDemoMode,
    demoStep: DEMO_STEPS[demoStepIndex],
    demoSecondsRemaining: DEMO_STEP_SECONDS - demoTimeInStep,
  });

  connectedSockets.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });

  return completePoint;
}

// 1Hz Simulation loop
setInterval(() => {
  if (!isSimulating) return;

  // If in Demo Mode, automatically cycle NORMAL -> WARNING -> CRITICAL -> NORMAL
  if (isDemoMode) {
    demoTimeInStep++;
    if (demoTimeInStep >= DEMO_STEP_SECONDS) {
      demoTimeInStep = 0;
      demoStepIndex = (demoStepIndex + 1) % DEMO_STEPS.length;
      currentMode = DEMO_STEPS[demoStepIndex];
    }
  }

  const features = generateSimulatedFeatures(currentMode);
  pushTelemetry({
    ...features,
    rpm: motorRpm,
    motorTemp,
  });
}, 1000);

interface UserAccount {
  id: string;             // Identity Number (e.g. ENG-101, OP-202, ADMIN-001)
  password: string;       // Password
  name: string;
  role: 'ENGINEER' | 'OPERATOR' | 'ADMIN';
  roleTitle: string;
  station: string;
  initials: string;
}

const REGISTERED_USERS: Record<string, UserAccount> = {
  'ENG-101': {
    id: 'ENG-101',
    password: 'password123',
    name: 'Jeet',
    role: 'ENGINEER',
    roleTitle: 'Lead Reliability Engineer',
    station: 'Station 01 - Induction Drives',
    initials: 'JT',
  },
  'OP-202': {
    id: 'OP-202',
    password: 'password123',
    name: 'Dhruchit',
    role: 'OPERATOR',
    roleTitle: 'Plant Condition Operator',
    station: 'Station 01 - Vibration Monitoring',
    initials: 'DH',
  },
  'ADMIN-001': {
    id: 'ADMIN-001',
    password: 'admin123',
    name: 'Manav Sinh',
    role: 'ADMIN',
    roleTitle: 'Industrial Systems Admin',
    station: 'Central Maintenance Operations',
    initials: 'MV',
  },
};

interface ActiveSession {
  user: {
    id: string;
    name: string;
    role: 'ENGINEER' | 'OPERATOR' | 'ADMIN';
    roleTitle: string;
    station: string;
    initials: string;
  };
  token: string;
  expiresAt: number;
}

const activeSessions = new Map<string, ActiveSession>();

function getSessionFromRequest(req: express.Request): ActiveSession | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

// REST APIs
// Authentication Endpoints
app.post('/api/auth/login', (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) {
    return res.status(400).json({ error: 'Identity Number (ID) and password are required' });
  }

  const normalizedId = String(id).trim().toUpperCase();
  let user = REGISTERED_USERS[normalizedId];

  // If ID is registered, check password
  if (user) {
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid Identity Number or Password' });
    }
  } else {
    // Also allow custom industrial badge IDs if password meets minimum length
    if (normalizedId.length >= 3 && String(password).length >= 4) {
      user = {
        id: normalizedId,
        password: String(password),
        name: `Operator ${normalizedId}`,
        role: normalizedId.startsWith('ADM') ? 'ADMIN' : normalizedId.startsWith('ENG') ? 'ENGINEER' : 'OPERATOR',
        roleTitle: normalizedId.startsWith('ADM') ? 'Field System Administrator' : normalizedId.startsWith('ENG') ? 'Field Reliability Engineer' : 'Station Shift Operator',
        station: 'Motor Test Bench Station 01',
        initials: normalizedId.slice(0, 2),
      };
      REGISTERED_USERS[normalizedId] = user;
    } else {
      return res.status(401).json({ error: 'Invalid Identity Number or Password' });
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const session: ActiveSession = {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      roleTitle: user.roleTitle,
      station: user.station,
      initials: user.initials,
    },
    token,
    expiresAt: Date.now() + 24 * 3600 * 1000, // 24 hours
  };

  activeSessions.set(token, session);

  res.json({
    status: 'success',
    user: {
      ...session.user,
      token,
      loginTime: Date.now(),
    },
  });
});

app.get('/api/auth/verify', (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  res.json({
    status: 'authenticated',
    user: {
      ...session.user,
      token: session.token,
      loginTime: Date.now(),
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const token = tokenFromHeader || req.body?.token;

  if (token && activeSessions.has(token)) {
    activeSessions.delete(token);
  }

  res.json({ status: 'logged_out' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: 'IntelliDrive AI',
    system: 'Predictive Motor Health Intelligence',
    isSimulating,
    currentMode,
    isDemoMode,
    totalPackets: packetCounter,
  });
});

app.get('/api/motor/telemetry', (req, res) => {
  const limit = Math.min(500, Math.max(10, parseInt((req.query.limit as string) || '60', 10)));
  const latest = telemetryBuffer[telemetryBuffer.length - 1];
  res.json({
    latest,
    history: telemetryBuffer.slice(-limit),
    motorInfo: {
      motorId: 'MTR-IND-415V-01',
      model: 'Three-Phase Squirrel Cage Induction (15kW / 20HP)',
      ratedPower: '15 kW',
      ratedVoltage: '415 V 3-Phase 50Hz',
      ratedRpm: 1800,
      currentRpm: motorRpm,
      status: 'RUNNING',
      operatingTimeHours: Math.floor(operatingSeconds / 3600),
      operatingTimeMinutes: Math.floor((operatingSeconds % 3600) / 60),
      samplingRateHz: 10000,
      fftWindowSize: 1024,
      sensors: {
        hallEffect: 'ONLINE',
        accelerometer: 'ONLINE',
        tempProbe: 'ONLINE',
      },
    },
    simulation: {
      isSimulating,
      currentMode,
      isDemoMode,
      demoStep: DEMO_STEPS[demoStepIndex],
      demoSecondsRemaining: DEMO_STEP_SECONDS - demoTimeInStep,
    },
  });
});

// Endpoint for hardware (ESP32 / Arduino / HTTP) to send real sensor metrics
app.post('/api/motor/telemetry', (req, res) => {
  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Payload empty' });
  }

  // If real hardware posts data, we can switch simulator off or blend
  const point = pushTelemetry(body);
  res.json({
    status: 'recorded',
    id: point.id,
    condition: point.condition,
    healthScore: point.healthScore,
    timestamp: point.timestamp,
  });
});

// Endpoint to control simulation modes and demo
app.post('/api/motor/control', (req, res) => {
  const { action, mode } = req.body;

  if (action === 'START_SIM') {
    isSimulating = true;
  } else if (action === 'STOP_SIM') {
    isSimulating = false;
  } else if (action === 'START_DEMO') {
    isDemoMode = true;
    demoStepIndex = 0;
    demoTimeInStep = 0;
    currentMode = DEMO_STEPS[demoStepIndex];
    isSimulating = true;
  } else if (action === 'STOP_DEMO') {
    isDemoMode = false;
  } else if (action === 'SET_PRESET') {
    isDemoMode = false;
    if (mode === 'NORMAL' || mode === 'WARNING' || mode === 'CRITICAL') {
      currentMode = mode;
      isSimulating = true;
    }
  }

  // Immediately push a representative point to update instantly
  const features = generateSimulatedFeatures(currentMode);
  const updated = pushTelemetry(features);

  res.json({
    status: 'updated',
    isSimulating,
    currentMode,
    isDemoMode,
    latestPoint: updated,
  });
});

// Historical Data endpoint for 1h, 6h, 24h, 7d
app.get('/api/motor/history', (req, res) => {
  const range = (req.query.range as string) || '1h';
  const now = Date.now();
  let pointsCount = 60;
  let intervalMs = 60 * 1000; // 1 minute per point for 1h

  if (range === '6h') {
    pointsCount = 72;
    intervalMs = 5 * 60 * 1000;
  } else if (range === '24h') {
    pointsCount = 96;
    intervalMs = 15 * 60 * 1000;
  } else if (range === '7d') {
    pointsCount = 84;
    intervalMs = 2 * 3600 * 1000;
  }

  const generatedHistory = [];
  const startTime = now - pointsCount * intervalMs;

  for (let i = 0; i < pointsCount; i++) {
    const t = startTime + i * intervalMs;
    // Gradual progression simulation over time: early is pristine normal, then gentle bearing fatigue
    const degradationRatio = i / pointsCount;
    let baseScore = 95 - degradationRatio * (currentMode === 'CRITICAL' ? 50 : currentMode === 'WARNING' ? 24 : 6);
    baseScore += (Math.random() - 0.5) * 4;
    baseScore = Math.max(15, Math.min(100, Math.round(baseScore)));

    const jitter = Number((0.6 + degradationRatio * (currentMode === 'CRITICAL' ? 3.2 : currentMode === 'WARNING' ? 1.6 : 0.25) + (Math.random() - 0.5) * 0.15).toFixed(2));
    const rms = Number((1.2 + degradationRatio * (currentMode === 'CRITICAL' ? 3.6 : currentMode === 'WARNING' ? 1.8 : 0.3) + (Math.random() - 0.5) * 0.2).toFixed(2));
    const crest = Number((2.6 + degradationRatio * (currentMode === 'CRITICAL' ? 3.0 : 1.2) + (Math.random() - 0.5) * 0.2).toFixed(2));
    const kurt = Number((2.9 + degradationRatio * (currentMode === 'CRITICAL' ? 3.6 : 1.4) + (Math.random() - 0.5) * 0.2).toFixed(2));
    const tempRise = Number((0.2 + degradationRatio * (currentMode === 'CRITICAL' ? 1.5 : 0.6) + (Math.random() - 0.5) * 0.08).toFixed(2));

    const cond = baseScore < 50 ? 'CRITICAL' : baseScore < 78 ? 'WARNING' : 'HEALTHY';

    const d = new Date(t);
    const label = range === '7d' 
      ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`
      : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    generatedHistory.push({
      timestamp: t,
      label,
      healthScore: baseScore,
      rmsVibration: Math.max(0.4, rms),
      revolutionJitter: Math.max(0.2, jitter),
      temperatureRiseRate: Math.max(0.05, tempRise),
      crestFactor: Math.max(1.8, crest),
      kurtosis: Math.max(2.5, kurt),
      condition: cond,
    });
  }

  res.json({
    range,
    count: generatedHistory.length,
    data: generatedHistory,
  });
});

async function start() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    connectedSockets.add(ws);

    // Send initial snapshot on connect
    const latest = telemetryBuffer[telemetryBuffer.length - 1];
    ws.send(JSON.stringify({
      type: 'init',
      latest,
      history: telemetryBuffer.slice(-60),
      mode: currentMode,
      isSimulating,
      isDemoMode,
    }));

    ws.on('message', (data: string) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'control') {
          if (parsed.action === 'SET_PRESET') {
            currentMode = parsed.mode;
            isDemoMode = false;
            isSimulating = true;
          } else if (parsed.action === 'TOGGLE_SIM') {
            isSimulating = !isSimulating;
          } else if (parsed.action === 'START_DEMO') {
            isDemoMode = true;
            demoStepIndex = 0;
            demoTimeInStep = 0;
            currentMode = DEMO_STEPS[demoStepIndex];
            isSimulating = true;
          } else if (parsed.action === 'STOP_DEMO') {
            isDemoMode = false;
          }
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    });

    ws.on('close', () => connectedSockets.delete(ws));
    ws.on('error', () => connectedSockets.delete(ws));
  });

  const distPath = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
    ? path.join(process.cwd(), 'dist')
    : __dirname;

  if (fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`IntelliDrive AI Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
