# MHM · Motor Health Monitor — Dashboard

Web dashboard for the B.Tech project **Edge AI Motor Health Monitor with Revolution Jitter Analysis for Predictive Maintenance**.

Live: https://motor-health-dashboard-wn5d.onrender.com/

## What it does

- Shows live data from the ESP32 system: six health features (RMS, peak, crest factor, kurtosis, revolution jitter, temperature rise rate), shaft speed, temperature and three phase currents.
- Displays the health class decided **on the device** (Random Forest on Board B) and the deviation from the motor's own healthy baseline. The server never recalculates the device's decision.
- Alerts, 24-hour trends, CSV export in the same columns as the SD-card log, and ⓘ explanations for every parameter.
- A clearly labelled demo mode runs when no device is connected and stops as soon as real data arrives.

## System

```
Sensors → ESP32 Board A (features) → UART → ESP32 Board B (inference, OLED, SD log)
                                                       │ Wi-Fi, HTTPS POST /api/v1/telemetry
                                                       ▼
                                           This dashboard (display only)
```

## Run locally

```bash
npm install
cp .env.example .env      # set DEVICE_KEY
npm run dev               # http://localhost:3000
```

Accounts: `ENG-101` / `password123` · `OP-202` / `password123` · `ADMIN-001` / `admin123`

## Deploy (Render)

`render.yaml` builds with `npm install && npm run build` and starts `npm start`. Set **DEVICE_KEY** in Render → Environment; Board B must send the same value in the `X-Device-Key` header.

## Code map

| Path | Purpose |
|---|---|
| `server.ts` | Express + WebSocket server: device ingestion, sessions, in-memory history, alerts, CSV export, demo |
| `src/shared/contract.ts` | The data format shared by device, server, SD log and export |
| `src/content/info.ts` | Text behind every ⓘ button |
| `src/pages/` | Overview, Parameters, Edge AI, Alerts, History & export, Device |
| `src/components/` | App frame, login, cards and popovers, trend chart |

See `MHM_Dashboard_Change_Report.md` for what changed, what was tested and what still depends on hardware and firmware.
