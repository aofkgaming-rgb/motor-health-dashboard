/**
 * Text behind every ⓘ button. Written for this project's actual hardware.
 * Keep it factual: what is measured, how, and what it can and cannot tell you.
 */
import type { FeatureKey } from '../shared/contract';

export interface InfoContent {
  title: string;
  what: string;
  why: string;
  how?: string;
  details: { label: string; text: string }[];
}

export interface ParamMeta {
  key: FeatureKey;
  name: string;
  unit: string;
  decimals: number;
  info: InfoContent;
}

export const PARAMS: ParamMeta[] = [
  {
    key: 'rms_g',
    name: 'RMS vibration',
    unit: 'g',
    decimals: 3,
    info: {
      title: 'RMS vibration',
      what: 'The root-mean-square of the vibration acceleration over one feature window: a single number for how much the motor frame is vibrating overall.',
      why: 'Overall vibration energy rises with most mechanical problems — imbalance, looseness, misalignment — so it is the first trend to watch.',
      how: 'RMS = √( (1/N) · Σ (xᵢ − x̄)² ), with N = 3200 samples (1 s at 3200 Hz). The mean x̄ is removed first so gravity and sensor offset do not inflate the value.',
      details: [
        { label: 'Sensor', text: 'ADXL345 MEMS accelerometer on Board A, read over its own I²C bus and FIFO.' },
        { label: 'Unit and window', text: 'g (1 g = 9.81 m/s²) of acceleration. One value per 1 s window.' },
        { label: 'Fault relevance', text: 'A sustained rise against your own healthy baseline is meaningful. RMS alone does not identify which fault is present.' },
        { label: 'In this project', text: 'Computed on Board A, compared with the 2-hour healthy baseline on Board B as a z-score, and used as one of the model inputs.' },
        { label: 'Limitations', text: 'At 3200 Hz sampling the usable bandwidth is about 1600 Hz. The reading depends heavily on how rigidly the sensor is coupled to the frame. This is acceleration, not velocity, so velocity-based severity charts do not apply directly.' },
      ],
    },
  },
  {
    key: 'peak_g',
    name: 'Peak value',
    unit: 'g',
    decimals: 3,
    info: {
      title: 'Peak value',
      what: 'The largest absolute acceleration in the window, measured from the mean.',
      why: 'Short shocks and impacts can be invisible in an average but show up clearly as a peak.',
      how: 'Peak = max |xᵢ − x̄| over the same 3200-sample window used for RMS.',
      details: [
        { label: 'Sensor', text: 'ADXL345, same samples as RMS.' },
        { label: 'Unit and window', text: 'g, per 1 s window.' },
        { label: 'Fault relevance', text: 'Rising peaks with steady RMS suggest intermittent impacts, such as a developing bearing defect or a loose component.' },
        { label: 'In this project', text: 'Computed on Board A; also used to form the crest factor.' },
        { label: 'Limitations', text: 'Peak is a single sample, so electrical noise or one knock on the bench can produce a spike. Read it as a trend, not one value.' },
      ],
    },
  },
  {
    key: 'crest',
    name: 'Crest factor',
    unit: 'ratio',
    decimals: 2,
    info: {
      title: 'Crest factor',
      what: 'How spiky the vibration is: the peak divided by the RMS of the same window.',
      why: 'Impulsive vibration raises the peak much more than the RMS, so the ratio climbs before overall vibration does.',
      how: 'Crest factor = Peak / RMS. A pure sine wave gives √2 ≈ 1.41; smooth random vibration is typically around 3–4.',
      details: [
        { label: 'Sensor', text: 'Derived from the ADXL345 RMS and peak.' },
        { label: 'Unit', text: 'Dimensionless.' },
        { label: 'Fault relevance', text: 'Often rises in early bearing damage. In late-stage damage RMS also grows, so the crest factor can fall again — a falling value is not automatically good news.' },
        { label: 'In this project', text: 'Computed on Board A; model input.' },
        { label: 'Limitations', text: 'Inherits the noise sensitivity of the peak value, and depends on operating speed and load.' },
      ],
    },
  },
  {
    key: 'kurtosis',
    name: 'Kurtosis',
    unit: '—',
    decimals: 2,
    info: {
      title: 'Kurtosis',
      what: 'A statistical measure of how heavy the "tails" of the vibration signal are — how often large, sharp values appear compared with normal noise.',
      why: 'Repeated impacts, such as a ball rolling over a damaged race, produce sharp peaks that raise kurtosis early, sometimes before RMS changes.',
      how: 'K = [ (1/N) Σ (xᵢ − x̄)⁴ ] / σ⁴. This is Pearson kurtosis: Gaussian noise gives 3.0. (Excess kurtosis would be K − 3; it is not used here.)',
      details: [
        { label: 'Sensor', text: 'ADXL345, same 3200-sample window.' },
        { label: 'Convention', text: 'Pearson kurtosis, Gaussian = 3.0, dimensionless.' },
        { label: 'Fault relevance', text: 'Values clearly above your baseline point to impulsive behaviour. It does not say which component is responsible.' },
        { label: 'In this project', text: 'Computed on Board A; model input; also learned from the public bearing datasets during training.' },
        { label: 'Limitations', text: 'Bearing-impact energy sits mostly at high frequency. At 3200 Hz much of it is filtered out, so kurtosis here is less sensitive than in lab datasets sampled at 12–50 kHz.' },
      ],
    },
  },
  {
    key: 'jitter_pct',
    name: 'Revolution jitter',
    unit: '%',
    decimals: 3,
    info: {
      title: 'Revolution jitter (project feature)',
      what: 'How irregular the time between shaft revolutions is. A perfectly steady shaft takes exactly the same time for every turn.',
      why: 'This is the novel feature of this project. The hypothesis is that imbalance, looseness and load disturbances make some revolutions slightly faster or slower than others, and that this shows up in timing before it shows up elsewhere.',
      how: 'J = σ(T) / mean(T) × 100 %, where T is the time between consecutive Hall-sensor pulses, over a window of 50 revolutions.',
      details: [
        { label: 'Sensor', text: 'A3144 Hall sensor facing a 6 × 3 mm magnet on the shaft (one pulse per revolution), timed by a hardware interrupt on Board A at 1 µs resolution.' },
        { label: 'Unit and window', text: 'Percent. At 1400 rpm one revolution takes about 42.9 ms, so 50 revolutions is about 2.1 s, and 1 µs is about 0.002 % of a revolution.' },
        { label: 'Fault relevance', text: 'Still being evaluated in this project: public datasets do not contain shaft-pulse timing, so jitter is judged against your own healthy baseline rather than learned from data.' },
        { label: 'In this project', text: 'Kept out of the trained model; monitored through its z-score against the healthy baseline.' },
        { label: 'Limitations', text: 'Supply-frequency drift, load changes and a loosely fixed magnet also change jitter. The magnet itself adds a small imbalance unless balanced by an equal mass opposite it.' },
      ],
    },
  },
  {
    key: 'temp_rise_c_min',
    name: 'Temperature rise rate',
    unit: '°C/min',
    decimals: 2,
    info: {
      title: 'Temperature rise rate',
      what: 'How fast the motor surface temperature is changing — not how hot it is.',
      why: 'A motor heading for thermal overload shows a steady rise long before it reaches a dangerous absolute temperature.',
      how: 'Rate = ΔT / Δt from the MLX90614 object temperature over a sliding window of 6 temperature samples (window length set in the firmware).',
      details: [
        { label: 'Sensor', text: 'MLX90614 non-contact infrared thermometer looking at the motor frame through a hole in the enclosure base.' },
        { label: 'Absolute vs rate', text: 'Absolute temperature tells you where you are; the rise rate tells you where you are heading. Both are shown.' },
        { label: 'Fault relevance', text: 'A sustained positive rate at constant load suggests overload, blocked cooling or a supply problem.' },
        { label: 'In this project', text: 'Computed on Board A from the MLX90614 readings; monitored against the healthy baseline on Board B.' },
        { label: 'Limitations', text: 'Infrared readings depend on surface emissivity (painted metal is not a perfect emitter), so the absolute value can be offset. Frame temperature lags the winding temperature.' },
      ],
    },
  },
];

export const INFO: Record<string, InfoContent> = {
  health: {
    title: 'How motor health is shown',
    what: 'Two independent signals, both produced on the device: the model output (which condition the Random Forest thinks it sees) and the baseline deviation (how far today’s features are from this motor’s own healthy behaviour).',
    why: 'Showing both lets you see when they disagree — for example a normal-looking class with a temperature drifting away from baseline.',
    details: [
      { label: 'Where it is decided', text: 'On Board B (ESP32). This dashboard only displays what the device sends; it never recalculates or overrides it.' },
      { label: 'Not a diagnosis', text: 'A prediction is a prompt to inspect the motor, not a confirmed fault.' },
    ],
  },
  cls: {
    title: 'Model output',
    what: 'The class label produced by the Random Forest running on Board B for the latest feature window.',
    why: 'It combines all the vibration features into one judgement instead of watching each separately.',
    details: [
      { label: 'Model', text: 'Random Forest, 50 trees, trained in Python (scikit-learn) and converted to C++ for the ESP32.' },
      { label: 'Training data', text: 'Public datasets (CWRU bearing data and MaFaulDa), resampled to the device’s 3200 Hz, split by recording file rather than by window.' },
      { label: 'Class names', text: 'Set when training is finished. Until then the device may run the rule-based fallback, shown as model “rules”.' },
      { label: 'Limitations', text: 'The model was trained on different machines than this motor, so its output is checked against the baseline deviation and a bench test.' },
    ],
  },
  vote_share: {
    title: 'Tree agreement',
    what: 'The share of the 50 decision trees that voted for the displayed class. 45 of 50 trees agreeing shows as 90 %.',
    why: 'A low share means the model is torn between classes, so the output deserves less weight.',
    details: [
      { label: 'What it is not', text: 'It is not a calibrated probability of the fault being present. It is shown only when the device sends the vote count.' },
    ],
  },
  z_max: {
    title: 'Baseline deviation',
    what: 'For each feature, z = (value − healthy mean) / healthy standard deviation, using statistics captured during a 2-hour run of this motor in known-good condition. The largest |z| across features is shown.',
    why: 'Every motor vibrates differently. Comparing the motor with its own healthy self avoids borrowing limits that were set for other machines.',
    details: [
      { label: 'Levels', text: 'Normal below |z| = 3, warning from 3, critical from 5. These are project defaults based on how unusual such a deviation is statistically; they are not taken from a standard.' },
      { label: 'Not calibrated', text: 'Until the baseline run is done, no deviation can be computed and features show “Not calibrated”.' },
      { label: 'Where it is computed', text: 'On Board B; baseline statistics are stored in the ESP32’s non-volatile memory.' },
    ],
  },
  rpm: {
    title: 'Shaft speed',
    what: 'Revolutions per minute, from the same Hall-sensor pulses used for jitter.',
    why: 'Speed below synchronous (1500 rpm for this 4-pole, 50 Hz motor) reflects slip, which increases with load.',
    how: 'rpm = 60 / mean(T), with T the revolution period in seconds.',
    details: [
      { label: 'Nameplate', text: '1400 rpm at full load. At light load on the bench, expect closer to 1500 rpm.' },
    ],
  },
  temp_c: {
    title: 'Motor surface temperature',
    what: 'The frame temperature measured by the MLX90614 infrared sensor.',
    why: 'Combined with the rise rate it shows both the current thermal state and its direction.',
    details: [
      { label: 'Limitations', text: 'Non-contact reading of a painted surface: absolute accuracy depends on emissivity setting and viewing distance. Treat it as a trend first.' },
    ],
  },
  current: {
    title: 'Phase currents',
    what: 'RMS current in each of the three supply lines, from three ZMCT103C current transformers.',
    why: 'Current rises with mechanical load and overload, and unequal phase currents point to a supply or winding problem.',
    how: 'Each CT output is sampled by the ESP32 ADC; Board A removes the offset and computes RMS digitally. Imbalance = largest deviation from the mean ÷ mean × 100 %, computed in the dashboard from the three values.',
    details: [
      { label: 'Calibration', text: 'Scale factor set against a clamp meter on the running motor.' },
      { label: 'Limitations', text: 'Current transformers measure AC only. Resolution near the motor’s 2 A rating is limited by the ESP32 ADC.' },
    ],
  },
  freshness: {
    title: 'Data freshness',
    what: 'How recently the device delivered a row.',
    why: 'An old value must never look current.',
    details: [
      { label: 'Levels', text: 'Live: a row within the last 15 s. Stale: 15–60 s. Offline: more than 60 s.' },
      { label: 'When offline', text: 'Board B keeps classifying, shows results on its OLED and logs to the SD card. Buffered rows are re-sent when Wi-Fi returns.' },
    ],
  },
  sampling: {
    title: 'Acquisition settings',
    what: 'The ADXL345 is sampled at 3200 Hz; features are computed every 1 s window; jitter uses 50 revolutions.',
    why: 'These settings are identical in the firmware, the training pipeline and the simulation, so features mean the same thing everywhere.',
    details: [
      { label: 'Bandwidth', text: 'Usable vibration bandwidth is about 1600 Hz (half the sample rate).' },
    ],
  },
  demo: {
    title: 'Demo data',
    what: 'Simulated rows generated by the server to show the dashboard working when no device is connected.',
    why: 'Lets the interface be demonstrated and tested before the hardware is running.',
    details: [
      { label: 'Separation', text: 'Demo rows are stored separately, labelled DEMO everywhere, and exported only with “DEMO-DATA” in the file name.' },
      { label: 'Automatic stop', text: 'The demo stops as soon as a real device sends data, and cannot be started while a device is live.' },
    ],
  },
  storage: {
    title: 'Where history is kept',
    what: 'The server keeps every row for 15 minutes, one row per 10 s for 24 hours, and one row per minute for the retention period (31 days by default). One file per calendar day, at 10 s, is kept for exports.',
    why: 'Short ranges show every detail; 7-day and 30-day charts are averaged per bucket so they stay readable.',
    details: [
      { label: 'Permanent record', text: 'Board B writes every row to its SD card, one file per day. The admin can import an SD-card file to fill gaps in the server history.' },
      { label: 'Hosting', text: 'On the Render free plan the server disk is wiped on every redeploy or restart. Locally, or with a persistent disk, the history survives restarts.' },
      { label: 'Exports', text: 'Exports contain measured rows only, never averages. Choosing 1 min or 10 min keeps one measured row per step and skips the rest.' },
    ],
  },
  predictionLog: {
    title: 'Prediction changes',
    what: 'A log of every time the model’s output label changed, for example Healthy → Imbalance, with the time it changed and how long the previous label lasted.',
    why: 'It shows when a fault started and stopped being detected, which is easier to read than a stream of identical predictions.',
    how: 'A new label must be reported for several consecutive rows (3 by default) before it counts as a change, so one noisy window does not create an entry.',
    details: [
      { label: 'In demo mode', text: 'The demo runs a fixed 150 s cycle: 40 s healthy, 30 s imbalance, 20 s healthy, 30 s impulsive (labelled “Bearing fault”), 20 s healthy, 30 s thermal (still labelled healthy). The changes repeat every 2.5 minutes. They are simulated, not faults on the motor.' },
      { label: 'With the real device', text: 'Each entry is a change in the Random Forest output on Board B. Treat it as a prompt to inspect the motor, not a confirmed diagnosis.' },
    ],
  },
  maintenance: {
    title: 'Maintenance records',
    what: 'The dates when maintenance was done on the monitored motor, what was done, by whom, and when it is next due.',
    why: 'After maintenance the vibration and temperature often change. Marking the date on the trend charts explains a step in the data, and a repaired motor may need a new healthy baseline.',
    details: [
      { label: 'On the charts', text: 'Each maintenance date appears as a green dashed line on the 7-day and 30-day charts.' },
      { label: 'Who can edit', text: 'Engineers and the admin by default. The admin can change this in Permissions.' },
    ],
  },
  access: {
    title: 'Role-based access',
    what: 'Each account has a role: Operator, Engineer or Admin. The role decides which pages and actions are available.',
    why: 'Least privilege: each person gets the controls their job needs, which avoids accidental changes and makes every change traceable in the audit log.',
    details: [
      { label: 'Enforced on the server', text: 'The server checks the role on every request. Hiding a button is only for convenience.' },
      { label: 'Changing access', text: 'The admin can change what Operators and Engineers may do in Administration → Permissions. The change applies immediately.' },
    ],
  },
};
