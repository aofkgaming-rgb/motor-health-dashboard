import {
  MotorCondition,
  MotorSensorFeatures,
  AiPredictionData,
  FeatureContribution,
  MotorAlert,
  MaintenanceRecommendation,
  FeatureStatusInfo,
} from '../types';

// Engineering thresholds for the 6 input features
export const FEATURE_THRESHOLDS = {
  rmsVibration: {
    name: 'RMS Vibration',
    shortName: 'RMS Vib',
    unit: 'mm/s',
    nominal: 1.2,
    warning: 2.8,
    critical: 4.5,
    normalRange: '0.5 – 2.8 mm/s',
    description: 'Root-Mean-Square velocity vibration (ISO 10816-3 standard for industrial motors).',
  },
  peakValue: {
    name: 'Peak Value',
    shortName: 'Peak',
    unit: 'mm/s',
    nominal: 2.5,
    warning: 5.5,
    critical: 9.0,
    normalRange: '1.0 – 5.5 mm/s',
    description: 'Maximum instantaneous vibration velocity amplitude captured per sampling window.',
  },
  crestFactor: {
    name: 'Crest Factor',
    shortName: 'Crest Factor',
    unit: 'ratio',
    nominal: 2.8,
    warning: 4.2,
    critical: 6.0,
    normalRange: '2.0 – 4.2',
    description: 'Ratio of Peak to RMS value. Spikes indicate repetitive impulsive bearing flaking.',
  },
  kurtosis: {
    name: 'Kurtosis',
    shortName: 'Kurtosis',
    unit: 'dimless',
    nominal: 3.0,
    warning: 4.0,
    critical: 6.0,
    normalRange: '2.8 – 3.8',
    description: 'Statistical peakedness of vibration signal. Normal Gaussian ~3.0; higher means spalling.',
  },
  revolutionJitter: {
    name: 'Revolution Jitter',
    shortName: 'Rev Jitter',
    unit: '%',
    nominal: 0.65,
    warning: 1.5,
    critical: 3.5,
    normalRange: '< 1.5 %',
    description: 'Cycle-to-cycle revolution duration variance from Hall-effect sensor pulses.',
  },
  temperatureRiseRate: {
    name: 'Temperature Rise Rate',
    shortName: 'Temp Rise',
    unit: '°C/min',
    nominal: 0.15,
    warning: 0.65,
    critical: 1.5,
    normalRange: '< 0.65 °C/min',
    description: 'Rate of stator/bearing core temperature climb measured over rolling 60s windows.',
  },
};

export function getFeatureCondition(key: keyof MotorSensorFeatures, value: number): MotorCondition {
  const thresh = FEATURE_THRESHOLDS[key];
  if (value >= thresh.critical) return 'CRITICAL';
  if (value >= thresh.warning) return 'WARNING';
  return 'HEALTHY';
}

export function evaluateEdgeAiPrediction(features: MotorSensorFeatures): AiPredictionData {
  const rmsCond = getFeatureCondition('rmsVibration', features.rmsVibration);
  const peakCond = getFeatureCondition('peakValue', features.peakValue);
  const crestCond = getFeatureCondition('crestFactor', features.crestFactor);
  const kurtCond = getFeatureCondition('kurtosis', features.kurtosis);
  const jitterCond = getFeatureCondition('revolutionJitter', features.revolutionJitter);
  const tempCond = getFeatureCondition('temperatureRiseRate', features.temperatureRiseRate);

  // Compute feature penalty contributions
  const contributions: FeatureContribution[] = [
    {
      featureKey: 'revolutionJitter',
      name: 'Revolution Jitter',
      value: features.revolutionJitter,
      unit: '%',
      status: jitterCond,
      importanceScore: Math.min(100, Math.round((features.revolutionJitter / FEATURE_THRESHOLDS.revolutionJitter.critical) * 85 + 15)),
      impactLevel: jitterCond === 'CRITICAL' ? 'HIGH' : jitterCond === 'WARNING' ? 'MEDIUM' : 'LOW',
    },
    {
      featureKey: 'rmsVibration',
      name: 'RMS Vibration',
      value: features.rmsVibration,
      unit: 'mm/s',
      status: rmsCond,
      importanceScore: Math.min(100, Math.round((features.rmsVibration / FEATURE_THRESHOLDS.rmsVibration.critical) * 80 + 10)),
      impactLevel: rmsCond === 'CRITICAL' ? 'HIGH' : rmsCond === 'WARNING' ? 'MEDIUM' : 'LOW',
    },
    {
      featureKey: 'kurtosis',
      name: 'Kurtosis',
      value: features.kurtosis,
      unit: '',
      status: kurtCond,
      importanceScore: Math.min(100, Math.round((features.kurtosis / FEATURE_THRESHOLDS.kurtosis.critical) * 75 + 10)),
      impactLevel: kurtCond === 'CRITICAL' ? 'HIGH' : kurtCond === 'WARNING' ? 'MEDIUM' : 'LOW',
    },
    {
      featureKey: 'crestFactor',
      name: 'Crest Factor',
      value: features.crestFactor,
      unit: '',
      status: crestCond,
      importanceScore: Math.min(100, Math.round((features.crestFactor / FEATURE_THRESHOLDS.crestFactor.critical) * 70 + 8)),
      impactLevel: crestCond === 'CRITICAL' ? 'HIGH' : crestCond === 'WARNING' ? 'MEDIUM' : 'LOW',
    },
    {
      featureKey: 'temperatureRiseRate',
      name: 'Temperature Rise Rate',
      value: features.temperatureRiseRate,
      unit: '°C/min',
      status: tempCond,
      importanceScore: Math.min(100, Math.round((features.temperatureRiseRate / FEATURE_THRESHOLDS.temperatureRiseRate.critical) * 65 + 10)),
      impactLevel: tempCond === 'CRITICAL' ? 'HIGH' : tempCond === 'WARNING' ? 'MEDIUM' : 'LOW',
    },
    {
      featureKey: 'peakValue',
      name: 'Peak Value',
      value: features.peakValue,
      unit: 'mm/s',
      status: peakCond,
      importanceScore: Math.min(100, Math.round((features.peakValue / FEATURE_THRESHOLDS.peakValue.critical) * 60 + 5)),
      impactLevel: peakCond === 'CRITICAL' ? 'HIGH' : peakCond === 'WARNING' ? 'MEDIUM' : 'LOW',
    },
  ];

  // Sort contributions by importance descending
  contributions.sort((a, b) => b.importanceScore - a.importanceScore);

  // Overall condition deduction
  let penalty = 0;
  // Revolution Jitter is the key feature: weighted heavily (30%)
  const jitterPenalty = Math.max(0, (features.revolutionJitter - 0.7) / (FEATURE_THRESHOLDS.revolutionJitter.critical - 0.7)) * 30;
  // RMS Vibration weighted 25%
  const rmsPenalty = Math.max(0, (features.rmsVibration - 1.2) / (FEATURE_THRESHOLDS.rmsVibration.critical - 1.2)) * 25;
  // Kurtosis & Crest factor weighted 20%
  const kurtPenalty = Math.max(0, (features.kurtosis - 3.0) / (FEATURE_THRESHOLDS.kurtosis.critical - 3.0)) * 12;
  const crestPenalty = Math.max(0, (features.crestFactor - 2.8) / (FEATURE_THRESHOLDS.crestFactor.critical - 2.8)) * 10;
  // Temp rise rate weighted 15%
  const tempPenalty = Math.max(0, (features.temperatureRiseRate - 0.2) / (FEATURE_THRESHOLDS.temperatureRiseRate.critical - 0.2)) * 15;
  // Peak weighted 8%
  const peakPenalty = Math.max(0, (features.peakValue - 2.5) / (FEATURE_THRESHOLDS.peakValue.critical - 2.5)) * 8;

  penalty = Math.min(95, jitterPenalty + rmsPenalty + kurtPenalty + crestPenalty + tempPenalty + peakPenalty);

  const rawScore = Math.max(5, Math.min(100, Math.round(100 - penalty)));

  let overallCondition: MotorCondition = 'HEALTHY';
  let predictedClass = 'Normal Balanced Operation';
  let explanation = 'All 6 condition features are within ISO-10816 normal limits. Continuous revolution period is stable with minimal cycle variance.';
  let anomalyDetected = false;
  let anomalyType: string | null = null;
  let confidence = 94.5;

  if (rawScore < 50 || jitterCond === 'CRITICAL' || rmsCond === 'CRITICAL' || tempCond === 'CRITICAL') {
    overallCondition = 'CRITICAL';
    confidence = 96.8;
    anomalyDetected = true;

    if (jitterCond === 'CRITICAL' && rmsCond === 'CRITICAL') {
      predictedClass = 'Severe Shaft Misalignment & Bearing Outer Race Spall';
      anomalyType = 'Coupled Mechanical & Rotational Fault';
      explanation = 'Critical revolution jitter (>3.5%) coupled with high RMS vibration (>4.5 mm/s) indicates severe shaft eccentricity and bearing race deterioration requiring immediate intervention.';
    } else if (jitterCond === 'CRITICAL') {
      predictedClass = 'Excessive Torsional Revolution Jitter';
      anomalyType = 'Severe Rotational Asymmetry / Loose Coupling';
      explanation = 'Cycle-to-cycle revolution periods show severe instability, signaling shaft misalignment, broken rotor bars, or loose mechanical coupling.';
    } else if (tempCond === 'CRITICAL') {
      predictedClass = 'Thermal Runaway with Lubricant Breakdown';
      anomalyType = 'Thermal Overheating';
      explanation = 'Temperature rise rate exceeds critical thresholds (>1.5 °C/min), indicating cooling fan failure or severe bearing friction.';
    } else {
      predictedClass = 'High Vibration Structural Degradation';
      anomalyType = 'Bearing & Structural Damage';
      explanation = 'Peak vibration and kurtosis indicate severe localized metal-on-metal impacts inside the bearing assembly.';
    }
  } else if (rawScore < 78 || jitterCond === 'WARNING' || rmsCond === 'WARNING' || crestCond === 'WARNING' || kurtCond === 'WARNING' || tempCond === 'WARNING') {
    overallCondition = 'WARNING';
    confidence = 91.2;
    anomalyDetected = true;

    if (jitterCond === 'WARNING') {
      predictedClass = 'Incipient Shaft Jitter & Load Fluctuation';
      anomalyType = 'Early Rotational Irregularity';
      explanation = 'Revolution jitter has elevated above nominal threshold (1.5%), pointing to developing coupling looseness, torsional vibration, or uneven mechanical resistance.';
    } else if (kurtCond === 'WARNING' || crestCond === 'WARNING') {
      predictedClass = 'Early Bearing Surface Micro-Impacts';
      anomalyType = 'Incipient Bearing Defect';
      explanation = 'Elevated Kurtosis and Crest Factor indicate early micro-spalling on raceway surfaces, generating sharp impulsive velocity spikes.';
    } else if (tempCond === 'WARNING') {
      predictedClass = 'Elevated Thermal Gradient';
      anomalyType = 'Thermal Buildup';
      explanation = 'Motor temperature rise rate is higher than steady-state baseline. Check ventilation and lubrication levels.';
    } else {
      predictedClass = 'Vibration Amplitude Elevation';
      anomalyType = 'Moderate Imbalance';
      explanation = 'RMS velocity is entering warning zone. Schedule visual and acoustic bearing inspection.';
    }
  }

  return {
    condition: overallCondition,
    healthScore: rawScore,
    confidence,
    predictedClass,
    explanation,
    contributions,
    anomalyDetected,
    anomalyType,
  };
}

export function generateAlerts(features: MotorSensorFeatures, now = Date.now()): MotorAlert[] {
  const alerts: MotorAlert[] = [];

  // Revolution Jitter
  if (features.revolutionJitter >= FEATURE_THRESHOLDS.revolutionJitter.critical) {
    alerts.push({
      id: 'alt-jitter-crit',
      severity: 'CRITICAL',
      parameter: 'Revolution Jitter',
      currentReading: `${features.revolutionJitter.toFixed(2)} %`,
      threshold: `> ${FEATURE_THRESHOLDS.revolutionJitter.critical}%`,
      timestamp: now - 12000,
      recommendedAction: 'Inspect shaft coupling alignment and examine rotor bars for torsional fatigue.',
    });
  } else if (features.revolutionJitter >= FEATURE_THRESHOLDS.revolutionJitter.warning) {
    alerts.push({
      id: 'alt-jitter-warn',
      severity: 'WARNING',
      parameter: 'Revolution Jitter',
      currentReading: `${features.revolutionJitter.toFixed(2)} %`,
      threshold: `> ${FEATURE_THRESHOLDS.revolutionJitter.warning}%`,
      timestamp: now - 35000,
      recommendedAction: 'Monitor revolution period stability. Check for belt slippage or load fluctuation.',
    });
  }

  // RMS Vibration
  if (features.rmsVibration >= FEATURE_THRESHOLDS.rmsVibration.critical) {
    alerts.push({
      id: 'alt-rms-crit',
      severity: 'CRITICAL',
      parameter: 'RMS Vibration',
      currentReading: `${features.rmsVibration.toFixed(2)} mm/s`,
      threshold: `> ${FEATURE_THRESHOLDS.rmsVibration.critical} mm/s`,
      timestamp: now - 20000,
      recommendedAction: 'Halt motor immediately for bearing assembly inspection according to ISO 10816.',
    });
  } else if (features.rmsVibration >= FEATURE_THRESHOLDS.rmsVibration.warning) {
    alerts.push({
      id: 'alt-rms-warn',
      severity: 'WARNING',
      parameter: 'RMS Vibration',
      currentReading: `${features.rmsVibration.toFixed(2)} mm/s`,
      threshold: `> ${FEATURE_THRESHOLDS.rmsVibration.warning} mm/s`,
      timestamp: now - 45000,
      recommendedAction: 'Schedule vibration spectrum analysis to pinpoint 1X vs 2X harmonic components.',
    });
  }

  // Crest Factor
  if (features.crestFactor >= FEATURE_THRESHOLDS.crestFactor.critical) {
    alerts.push({
      id: 'alt-crest-crit',
      severity: 'CRITICAL',
      parameter: 'Crest Factor',
      currentReading: `${features.crestFactor.toFixed(2)}`,
      threshold: `> ${FEATURE_THRESHOLDS.crestFactor.critical}`,
      timestamp: now - 28000,
      recommendedAction: 'Extreme impulsive impact spikes detected. Inspect bearing raceway for spalling.',
    });
  } else if (features.crestFactor >= FEATURE_THRESHOLDS.crestFactor.warning) {
    alerts.push({
      id: 'alt-crest-warn',
      severity: 'WARNING',
      parameter: 'Crest Factor',
      currentReading: `${features.crestFactor.toFixed(2)}`,
      threshold: `> ${FEATURE_THRESHOLDS.crestFactor.warning}`,
      timestamp: now - 60000,
      recommendedAction: 'Impulse spikes rising above RMS background. Inspect lubricant cleanliness.',
    });
  }

  // Kurtosis
  if (features.kurtosis >= FEATURE_THRESHOLDS.kurtosis.critical) {
    alerts.push({
      id: 'alt-kurt-crit',
      severity: 'CRITICAL',
      parameter: 'Kurtosis',
      currentReading: `${features.kurtosis.toFixed(2)}`,
      threshold: `> ${FEATURE_THRESHOLDS.kurtosis.critical}`,
      timestamp: now - 15000,
      recommendedAction: 'Non-Gaussian peaked distribution indicates progressive bearing spall development.',
    });
  } else if (features.kurtosis >= FEATURE_THRESHOLDS.kurtosis.warning) {
    alerts.push({
      id: 'alt-kurt-warn',
      severity: 'WARNING',
      parameter: 'Kurtosis',
      currentReading: `${features.kurtosis.toFixed(2)}`,
      threshold: `> ${FEATURE_THRESHOLDS.kurtosis.warning}`,
      timestamp: now - 72000,
      recommendedAction: 'Incipient surface pitting indicated. Plan scheduled bearing relubrication.',
    });
  }

  // Temperature Rise Rate
  if (features.temperatureRiseRate >= FEATURE_THRESHOLDS.temperatureRiseRate.critical) {
    alerts.push({
      id: 'alt-temp-crit',
      severity: 'CRITICAL',
      parameter: 'Temperature Rise Rate',
      currentReading: `${features.temperatureRiseRate.toFixed(2)} °C/min`,
      threshold: `> ${FEATURE_THRESHOLDS.temperatureRiseRate.critical} °C/min`,
      timestamp: now - 10000,
      recommendedAction: 'Thermal runaway risk. Check motor cooling fan cowl and winding insulation.',
    });
  } else if (features.temperatureRiseRate >= FEATURE_THRESHOLDS.temperatureRiseRate.warning) {
    alerts.push({
      id: 'alt-temp-warn',
      severity: 'WARNING',
      parameter: 'Temperature Rise Rate',
      currentReading: `${features.temperatureRiseRate.toFixed(2)} °C/min`,
      threshold: `> ${FEATURE_THRESHOLDS.temperatureRiseRate.warning} °C/min`,
      timestamp: now - 50000,
      recommendedAction: 'Verify airflow clearance and check motor load profile for excessive draw.',
    });
  }

  return alerts;
}

export function generateRecommendations(condition: MotorCondition, features: MotorSensorFeatures): MaintenanceRecommendation[] {
  const recs: MaintenanceRecommendation[] = [];

  if (condition === 'CRITICAL') {
    recs.push({
      id: 'rec-crit-1',
      priority: 'URGENT',
      title: 'Emergency Maintenance Shutdown & Inspection',
      description: 'Multiple condition indicators exceed critical thresholds. Continuing operation risks catastrophic bearing seizure or shaft damage.',
      triggerFeature: features.revolutionJitter > 3.0 ? 'Revolution Jitter & RMS Vibration' : 'Composite Multi-Feature Deviation',
      actionItem: 'De-energize motor, lock out power, conduct dial-indicator runout test and endoscopic bearing inspection.',
      estimatedWindow: 'Immediate (Within 4 hours)',
    });
    if (features.revolutionJitter >= FEATURE_THRESHOLDS.revolutionJitter.warning) {
      recs.push({
        id: 'rec-crit-2',
        priority: 'URGENT',
        title: 'Check Shaft Rotation & Coupling Alignment',
        description: 'High revolution jitter directly proves angular or parallel shaft misalignment causing cycle-to-cycle rotational drag.',
        triggerFeature: `Revolution Jitter: ${features.revolutionJitter.toFixed(2)}%`,
        actionItem: 'Perform laser shaft alignment and check flexible coupling elastomeric insert for wear.',
        estimatedWindow: 'Prior to restart',
      });
    }
  } else if (condition === 'WARNING') {
    if (features.revolutionJitter >= FEATURE_THRESHOLDS.revolutionJitter.warning) {
      recs.push({
        id: 'rec-warn-1',
        priority: 'PLANNED',
        title: 'Revolution Jitter Abnormal — Check Shaft Rotation / Alignment',
        description: 'Cycle-to-cycle revolution duration is irregular. Revolution jitter is early evidence of mechanical resistance fluctuation.',
        triggerFeature: `Revolution Jitter: ${features.revolutionJitter.toFixed(2)}%`,
        actionItem: 'Verify motor foundation bolting torque, check belt tension, and inspect driven load coupling.',
        estimatedWindow: 'Within 24–48 hours',
      });
    }
    if (features.rmsVibration >= FEATURE_THRESHOLDS.rmsVibration.warning || features.kurtosis >= FEATURE_THRESHOLDS.kurtosis.warning) {
      recs.push({
        id: 'rec-warn-2',
        priority: 'PLANNED',
        title: 'Vibration is Increasing — Inspect Bearing Condition',
        description: 'Vibration amplitude and peakedness (Kurtosis) indicate surface stress on rolling elements.',
        triggerFeature: `RMS: ${features.rmsVibration.toFixed(2)} mm/s | Kurtosis: ${features.kurtosis.toFixed(2)}`,
        actionItem: 'Inspect grease consistency, purge old lubricant, and take FFT spectrum reading to isolate ball-pass frequency.',
        estimatedWindow: 'Next planned maintenance shift',
      });
    }
    if (features.temperatureRiseRate >= FEATURE_THRESHOLDS.temperatureRiseRate.warning) {
      recs.push({
        id: 'rec-warn-3',
        priority: 'PLANNED',
        title: 'Temperature Rise is Increasing — Check Cooling System',
        description: 'Winding/bearing thermal gradient exceeds steady-state dissipation capacity.',
        triggerFeature: `Temp Rise: ${features.temperatureRiseRate.toFixed(2)} °C/min`,
        actionItem: 'Clear dust build-up from stator cooling fins and check fan blade integrity.',
        estimatedWindow: 'Within 24 hours',
      });
    }
  } else {
    recs.push({
      id: 'rec-norm-1',
      priority: 'ROUTINE',
      title: 'Motor Condition is Normal — Continue Monitoring',
      description: 'All 6 predictive maintenance features exhibit stable baselines. Edge AI model classifies current operation as balanced.',
      triggerFeature: 'All 6 Features Nominal',
      actionItem: 'Maintain standard telemetry logging at 10 kHz Hall/vibration sample rate. No action required.',
      estimatedWindow: 'Routine monthly audit',
    });
  }

  return recs;
}
