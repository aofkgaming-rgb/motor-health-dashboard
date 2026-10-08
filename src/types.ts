export type MotorCondition = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export type SimulationPreset = 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface MotorSensorFeatures {
  rmsVibration: number;       // mm/s
  peakValue: number;          // mm/s
  crestFactor: number;        // dimensionless ratio (Peak / RMS)
  kurtosis: number;           // dimensionless peakedness (Gaussian ~ 3.0)
  revolutionJitter: number;   // % cycle-to-cycle period variation
  temperatureRiseRate: number;// °C/min
}

export interface MotorTelemetryPoint extends MotorSensorFeatures {
  id: number;
  timestamp: number;
  rpm: number;
  motorTemp: number;          // °C
  condition: MotorCondition;
  healthScore: number;        // 0 - 100%
  aiConfidence: number;       // %
  aiPrediction: string;
}

export interface FeatureStatusInfo {
  key: keyof MotorSensorFeatures;
  name: string;
  shortName: string;
  unit: string;
  value: number;
  status: MotorCondition;
  normalRange: string;
  warningThreshold: number;
  criticalThreshold: number;
  description: string;
  trend: number[];
}

export interface RevolutionJitterStats {
  currentJitter: number;
  averageJitter: number;
  maxJitter: number;
  condition: MotorCondition;
  revolutionPeriods: {
    cycle: number;
    periodUs: number;
    nominalUs: number;
    deviationPct: number;
  }[];
}

export interface FeatureContribution {
  featureKey: keyof MotorSensorFeatures;
  name: string;
  value: number;
  unit: string;
  importanceScore: number;    // 0 - 100%
  status: MotorCondition;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AiPredictionData {
  condition: MotorCondition;
  healthScore: number;
  confidence: number;
  predictedClass: string;
  explanation: string;
  contributions: FeatureContribution[];
  anomalyDetected: boolean;
  anomalyType: string | null;
}

export interface MotorAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  parameter: string;
  currentReading: string;
  threshold: string;
  timestamp: number;
  recommendedAction: string;
}

export interface MotorInfo {
  motorId: string;
  model: string;
  ratedPower: string;
  ratedVoltage: string;
  ratedRpm: number;
  currentRpm: number;
  status: 'RUNNING' | 'IDLE' | 'STOPPED';
  operatingTimeHours: number;
  operatingTimeMinutes: number;
  samplingRateHz: number;
  fftWindowSize: number;
  sensors: {
    hallEffect: 'ONLINE' | 'OFFLINE';
    accelerometer: 'ONLINE' | 'OFFLINE';
    tempProbe: 'ONLINE' | 'OFFLINE';
  };
}

export interface HistoricalDataPoint {
  timestamp: number;
  label: string;
  healthScore: number;
  rmsVibration: number;
  revolutionJitter: number;
  temperatureRiseRate: number;
  crestFactor: number;
  kurtosis: number;
  condition: MotorCondition;
}

export interface MaintenanceRecommendation {
  id: string;
  priority: 'URGENT' | 'PLANNED' | 'ROUTINE';
  title: string;
  description: string;
  triggerFeature: string;
  actionItem: string;
  estimatedWindow: string;
}

export interface AuthUser {
  id: string;             // Identity Number (e.g. ENG-101, OP-202)
  name: string;           // Operator / Engineer Name
  role: 'ENGINEER' | 'OPERATOR' | 'ADMIN';
  roleTitle: string;      // e.g. "Lead Reliability Engineer"
  station: string;        // e.g. "Unit-4 Induction Drives"
  token: string;          // Session Bearer token
  initials: string;       // e.g. "CM"
  loginTime: number;
}

export interface AuthCredentials {
  id: string;             // Identity Number
  password: string;
  rememberMe?: boolean;
}
