import React, { useState } from 'react';
import {
  X,
  Cpu,
  Copy,
  Check,
} from 'lucide-react';

interface Esp32IntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Esp32IntegrationModal: React.FC<Esp32IntegrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const sampleJson = `{
  "motorId": "MTR-IND-415V-01",
  "rpm": 1785,
  "rmsVibration": 1.42,
  "peakValue": 3.65,
  "crestFactor": 2.57,
  "kurtosis": 3.12,
  "revolutionJitter": 0.68,
  "temperatureRiseRate": 0.18,
  "motorTemp": 48.6
}`;

  const arduinoCode = `// ESP32 IntelliDrive AI Motor Health Firmware
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/motor/telemetry";

// Sensor Pin Assignments
#define HALL_PIN 4        // Interrupt pin for Revolution Jitter timing
#define TEMP_PIN 34       // ADC for PT100 / DS18B20
// Accelerometer (e.g. ADXL345 or MPU6050) over I2C: SDA=21, SCL=22

volatile unsigned long lastRevMicros = 0;
volatile unsigned long currentPeriodUs = 0;
volatile float revolutionJitterPct = 0.0;
unsigned long nominalPeriodUs = 33613; // at ~1785 RPM

void IRAM_ATTR onHallPulse() {
  unsigned long nowUs = micros();
  if (lastRevMicros > 0) {
    currentPeriodUs = nowUs - lastRevMicros;
    long delta = (long)currentPeriodUs - (long)nominalPeriodUs;
    revolutionJitterPct = (abs(delta) / (float)nominalPeriodUs) * 100.0;
  }
  lastRevMicros = nowUs;
}

void setup() {
  Serial.begin(115200);
  pinMode(HALL_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(HALL_PIN), onHallPulse, FALLING);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void loop() {
  // 1. Calculate 6 Features (Vibration, Peak, Crest, Kurtosis, Jitter, Temp Rise)
  // 2. Transmit JSON packet to Dashboard Server
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{\\"rmsVibration\\":1.42,\\"peakValue\\":3.65,\\"crestFactor\\":2.57,"
                  "\\"kurtosis\\":3.12,\\"revolutionJitter\\":" + String(revolutionJitterPct, 2) + 
                  ",\\"temperatureRiseRate\\":0.18,\\"rpm\\":1785}";

    int httpCode = http.POST(json);
    http.end();
  }
  delay(1000); // 1 Hz Edge AI Telemetry Cycle
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(arduinoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0e141c] border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#121924]">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h3 className="font-mono font-bold text-sm sm:text-base text-white">
              ESP32 & Sensors Integration Architecture
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs font-mono text-slate-300">
          {/* Expected Sensors Block */}
          <div>
            <h4 className="text-cyan-400 font-bold mb-2 uppercase tracking-wide">
              1. Hardware Sensors Setup
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-200">
              <div className="p-3 rounded bg-slate-900 border border-slate-800">
                <span className="font-bold text-white block mb-1 text-xs">Hall-Effect Sensor</span>
                <span className="text-[11px] text-slate-400 block font-sans mb-1">
                  Pin: <strong>GPIO 4</strong> (Interrupt)
                </span>
                <span className="text-[10px] text-cyan-300 block font-sans">
                  Measures RPM and microsecond Revolution Jitter cycle variation.
                </span>
              </div>

              <div className="p-3 rounded bg-slate-900 border border-slate-800">
                <span className="font-bold text-white block mb-1 text-xs">3-Axis Accelerometer</span>
                <span className="text-[11px] text-slate-400 block font-sans mb-1">
                  I2C: <strong>SDA (21), SCL (22)</strong>
                </span>
                <span className="text-[10px] text-cyan-300 block font-sans">
                  Computes RMS Vibration, Peak Value, Crest Factor, and Kurtosis.
                </span>
              </div>

              <div className="p-3 rounded bg-slate-900 border border-slate-800">
                <span className="font-bold text-white block mb-1 text-xs">Temperature Sensor</span>
                <span className="text-[11px] text-slate-400 block font-sans mb-1">
                  Analog ADC: <strong>GPIO 34</strong>
                </span>
                <span className="text-[10px] text-cyan-300 block font-sans">
                  Monitors motor stator temperature rise rate (°C/min).
                </span>
              </div>
            </div>
          </div>

          {/* HTTP Ingestion Endpoint */}
          <div>
            <h4 className="text-cyan-400 font-bold mb-2 uppercase tracking-wide">
              2. REST Ingestion Endpoint
            </h4>
            <div className="p-3 rounded bg-slate-950 border border-slate-800 text-slate-300">
              <div className="flex items-center gap-2 mb-1.5 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                  POST
                </span>
                <span className="text-slate-100 font-bold">/api/motor/telemetry</span>
              </div>
              <pre className="text-[11px] text-slate-400 overflow-x-auto p-2 bg-slate-900 rounded border border-slate-800">
                {sampleJson}
              </pre>
            </div>
          </div>

          {/* ESP32 Arduino C++ Code */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-cyan-400 font-bold uppercase tracking-wide">
                3. ESP32 Arduino C++ Firmware Template
              </h4>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <pre className="text-[11px] text-slate-300 bg-slate-950 p-3 rounded border border-slate-800 overflow-x-auto max-h-56 leading-relaxed">
              {arduinoCode}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-[#121924] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-semibold cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
