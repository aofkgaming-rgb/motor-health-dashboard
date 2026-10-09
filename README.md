<div align="center">

# ⚡ IntelliDrive AI — Predictive Motor Health Intelligence

**Real-time 6-Feature Condition Monitoring • Revolution Jitter Analysis • Edge ML Predictions**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-IntelliDrive_AI-00d4ff?style=for-the-badge)](https://motor-health-dashboard-wn5d.onrender.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)

</div>

---

## 🔬 Overview

**IntelliDrive AI** is an industrial-grade predictive maintenance dashboard that monitors motor health in real-time using 6 key sensor features:

| Feature | Sensor | Warning | Critical |
|---------|--------|---------|----------|
| RMS Vibration (mm/s) | MEMS Accelerometer | ≥ 2.8 | ≥ 4.5 |
| Peak Value (mm/s) | MEMS Accelerometer | ≥ 5.5 | ≥ 9.0 |
| Crest Factor | Computed | ≥ 4.2 | ≥ 6.0 |
| Kurtosis | Computed | ≥ 4.0 | ≥ 6.0 |
| Revolution Jitter (%) | Hall Effect Sensor | ≥ 1.5 | ≥ 3.5 |
| Temperature Rise Rate (°C/min) | Thermocouple | ≥ 0.65 | ≥ 1.5 |

## 🚀 Quick Start

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Set your Gemini API key (optional, for AI features)
cp .env.example .env.local
# Edit .env.local with your GEMINI_API_KEY

# 3. Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Default Login Credentials

| ID | Password | Role |
|----|----------|------|
| `ENG-101` | `password123` | Lead Reliability Engineer |
| `OP-202` | `password123` | Plant Condition Operator |
| `ADMIN-001` | `admin123` | Industrial Systems Admin |

## 🏗️ Tech Stack

- **Frontend:** React 19 + TypeScript + TailwindCSS 4 + Recharts + Framer Motion
- **Backend:** Express + WebSocket (real-time 1Hz telemetry push)
- **Build:** Vite 6 + esbuild (server CJS bundle)
- **Deployment:** Render (Web Service)
- **Hardware Ready:** ESP32 Arduino firmware included for real sensor data

## 📦 Deployment

Deployed on [Render](https://render.com) via `render.yaml`:

```bash
npm run build    # Builds Vite SPA + esbuild server bundle
npm start        # Runs production server (node dist/server.cjs)
```

## 📁 Project Structure

```
├── server.ts                    # Express + WebSocket backend
├── src/
│   ├── App.tsx                  # Main dashboard layout
│   ├── types.ts                 # TypeScript interfaces
│   ├── utils/motorCalculations.ts
│   └── components/
│       ├── LoginScreen.tsx      # Identity auth portal
│       ├── Header.tsx           # IntelliDrive AI top bar
│       ├── MainHealthCard.tsx   # Health score gauge
│       ├── AnalogGauge.tsx      # RPM/Temp analog dials
│       ├── RealTimeGraphSection.tsx
│       ├── RevolutionJitterSection.tsx
│       ├── SensorFeatureCards.tsx
│       ├── AlertsPanel.tsx
│       └── Esp32IntegrationModal.tsx
├── index.html
├── render.yaml
└── package.json
```

---

<div align="center">
<sub>Built with ⚡ by IntelliDrive AI Team</sub>
</div>
