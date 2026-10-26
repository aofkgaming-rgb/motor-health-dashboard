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

First-run accounts (change the passwords in Administration → Users & sessions):
`ADMIN-001` / `admin123` · `ENG-101` / `password123` · `OP-202` / `password123`

## Roles (RBAC)

| Role | Sidebar | Can do (project default) |
|---|---|---|
| Operator (Dhruchit) | Overview, Parameters, Alerts, Maintenance | Watch the status banner, acknowledge alerts, view maintenance, 24 h charts |
| Engineer (Jeet) | + Edge AI, History & export, Device | 7/30-day trends, one-day and date-range CSV/Excel export, add/edit maintenance, demo control |
| Admin (Manav Sinh) | + Administration: Users & sessions, Motor & parameters, Permissions, Audit log, System & data | Everything: users, force sign-out, motor profiles, parameter names/limits/custom parameters/ⓘ text, thresholds, permissions, backup/restore, SD-card import |

The admin can change what Operators and Engineers may do in **Permissions** — no code change. Every API route checks the role on the server (`server/auth.ts`), and every action is written to the audit log.

## Data kept by the server

`DATA_DIR` (default `./data`): `settings.json`, `users.json` (scrypt password hashes), `maintenance.json`, `alerts.json`, `audit.ndjson`, and `rows/<device|demo>/<YYYY-MM-DD>.ndjson` (one row per 10 s). On the Render free plan this folder is wiped on every redeploy — download a backup from System & data.

## Deploy (Render)

`render.yaml` builds with `npm install && npm run build` and starts `npm start`. Set **DEVICE_KEY** in Render → Environment; Board B must send the same value in the `X-Device-Key` header.

## Code map

| Path | Purpose |
|---|---|
| `server.ts` | Express + WebSocket server: device ingestion, API routes with role checks, alerts, demo, admin routes |
| `server/auth.ts` | Users, password hashing, sessions, permission middleware, audit log |
| `server/config.ts` | Admin settings (motors, parameters, custom parameters, thresholds, information), maintenance records |
| `server/rowsdb.ts` | Live / 24 h / 31-day storage and day files |
| `server/exporter.ts` | CSV and Excel (.xlsx) export |
| `src/shared/rbac.ts` | Roles, permission list, default permission table |
| `src/shared/settings.ts` | Settings types and defaults |
| `src/shared/contract.ts` | The data format shared by device, server, SD log and export |
| `src/content/info.ts` | Text behind every ⓘ button |
| `src/pages/` | Overview, Parameters, Edge AI, Alerts, History & export, Maintenance, Device |
| `src/pages/admin/` | Users & sessions, Motor & parameters, Permissions, Audit log, System & data |
| `src/components/` | App frame, login, cards and popovers, trend chart |

See `MHM_Dashboard_Change_Report.md` for what changed, what was tested and what still depends on hardware and firmware.
