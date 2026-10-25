import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import type { AuthUser, Scenario, ServerState } from '../types';
import { INFO } from '../content/info';
import { Card, EmptyNote, KeyValue } from '../components/ui';
import { api } from '../lib/useLive';
import { ago, dateTime } from '../lib/format';
import { useNow } from '../components/Shell';

const SENSORS: [string, string][] = [
  ['adxl', 'ADXL345 accelerometer'],
  ['mlx', 'MLX90614 IR temperature'],
  ['hall', 'A3144 Hall sensor'],
  ['ct', 'ZMCT103C current (×3)'],
  ['rtc', 'DS3231 real-time clock'],
  ['sd', 'microSD logger'],
];

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: 'cycle', label: 'Cycle through all' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'imbalance', label: 'Imbalance' },
  { key: 'impulsive', label: 'Impulsive (bearing-like)' },
  { key: 'thermal', label: 'Thermal / overload' },
];

const PINS_A: [string, string, string][] = [
  ['ADXL345', 'SDA / SCL', 'D21 / D22 (I²C bus 0, 400 kHz) · SDO→GND (0x53) · CS→3V3'],
  ['MLX90614', 'SDA / SCL', 'D25 / D26 (I²C bus 1, 100 kHz)'],
  ['A3144 Hall', 'OUT', '22 kΩ / 33 kΩ divider → D13 (interrupt) · VCC from VIN (5 V)'],
  ['ZMCT103C L1', 'AO', '22 kΩ / 33 kΩ + 10 nF → D34 (ADC1)'],
  ['ZMCT103C L2', 'AO', '22 kΩ / 33 kΩ + 10 nF → D35 (ADC1)'],
  ['ZMCT103C L3', 'AO', '22 kΩ / 33 kΩ + 10 nF → D32 (ADC1)'],
  ['UART to Board B', 'TX2', 'GPIO17 → Board B G16 · common GND'],
];

const PINS_B: [string, string, string][] = [
  ['OLED SSD1306', 'SDA / SCL', 'G21 / G22 (0x3C)'],
  ['DS3231 RTC', 'SDA / SCL', 'G21 / G22 shared (0x68)'],
  ['microSD', 'MOSI / MISO / SCK / CS', 'G23 / G19 / G18 / G5 · VCC 5 V'],
  ['UART from Board A', 'RX2', 'G16 ← Board A GPIO17'],
];

const EXAMPLE = `POST /api/v1/telemetry
X-Device-Key: <DEVICE_KEY>
Content-Type: application/json

{ "rows": [ {
  "device_id": "MHM-B01", "fw": "0.1.0", "boot": "3fa2", "seq": 1024,
  "ts": 1793000000,
  "rpm": 1438.2, "jitter_pct": 0.214,
  "rms_g": 0.051, "peak_g": 0.169, "crest": 3.31, "kurtosis": 3.02,
  "temp_c": 37.9, "temp_rise_c_min": 0.04,
  "i_l1_a": 1.31, "i_l2_a": 1.33, "i_l3_a": 1.29,
  "cls": "Healthy", "votes": 45, "trees": 50, "model": "rf-v1",
  "z_max": 1.2, "calibrated": true,
  "z": { "rms_g": 0.4, "peak_g": 0.2, "crest": -0.1,
         "kurtosis": 0.1, "jitter_pct": 1.2, "temp_rise_c_min": -0.3 },
  "sensors": { "adxl": "ok", "mlx": "ok", "hall": "ok", "ct": "ok", "sd": "ok", "rtc": "ok" }
} ] }`;

function PinTable({ title, rows }: { title: string; rows: [string, string, string][] }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      <div className="border border-[var(--border)] rounded-md overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Pin</th>
              <th>Connection</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([m, p, c]) => (
              <tr key={m}>
                <td className="whitespace-nowrap">{m}</td>
                <td className="whitespace-nowrap">{p}</td>
                <td className="text-[var(--text-2)]">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Device({
  token,
  user,
  state,
  clockOffset,
  onChanged,
}: {
  token: string;
  user: AuthUser;
  state: ServerState | null;
  clockOffset: number;
  onChanged: () => void;
}) {
  const now = useNow() + clockOffset;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState<null | 'device' | 'demo'>(null);
  const d = state?.device;
  const canDemo = user.role === 'ENGINEER' || user.role === 'ADMIN';
  const isAdmin = user.role === 'ADMIN';

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      onChanged();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <p
          role="status"
          className={`text-[12.5px] rounded-md px-3 py-2 ${msg.ok ? 'bg-[var(--good-soft)] text-[#08700a]' : 'bg-[var(--crit-soft)] text-[#a82626]'}`}
        >
          {msg.text}
        </p>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Device" info={INFO.freshness}>
          {d ? (
            <KeyValue
              rows={[
                ['Device id', d.device_id],
                ['Status', state?.deviceStatus.toLowerCase().replace('_', ' ')],
                ['Last row received', `${ago(now - d.lastSeen)}`],
                ['Firmware', d.fw ?? 'Not reported'],
                ['Boot id', d.boot ?? 'Not reported'],
                ['First seen (this server run)', dateTime(d.firstSeen)],
                ['Rows accepted', d.rowsAccepted],
                ['Duplicates dropped', d.rowsDuplicate],
                ['Rows rejected', d.rowsRejected],
                ['Baseline calibrated', d.calibrated === null ? 'Not reported' : d.calibrated ? 'Yes' : 'No'],
              ]}
            />
          ) : (
            <EmptyNote title="No device has connected">
              Since the server last started, no row has arrived at <code className="text-[12px]">/api/v1/telemetry</code>.
            </EmptyNote>
          )}
        </Card>

        <Card title="Sensors (as reported by the device)">
          <ul className="divide-y divide-[var(--border)]">
            {SENSORS.map(([k, label]) => {
              const v = d?.sensors?.[k];
              const Icon = v === 'ok' ? CheckCircle2 : v ? AlertTriangle : MinusCircle;
              const color = v === 'ok' ? 'var(--good)' : v ? 'var(--warn)' : 'var(--none)';
              return (
                <li key={k} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span>{label}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)]">
                    <Icon size={14} style={{ color }} aria-hidden />
                    {v === 'ok' ? 'OK' : v ? v : 'Not reported'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Server ingestion">
          <KeyValue
            rows={[
              ['Endpoint', '/api/v1/telemetry'],
              ['Device key', state?.ingestionConfigured ? 'Configured' : 'Not set — add DEVICE_KEY in Render'],
              ['Schema version', state?.schema ?? '—'],
              ['Stale after', `${(state?.staleAfterMs ?? 15000) / 1000} s`],
              ['Offline after', `${(state?.offlineAfterMs ?? 60000) / 1000} s`],
              ['Server history', '15 min full, 24 h at 10 s'],
            ]}
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Motor (bench)">
          {state && (
            <KeyValue
              rows={[
                ['Make', state.motor.make],
                ['Type', state.motor.type],
                ['Rating', state.motor.power],
                ['Supply', state.motor.voltage],
                ['Connection', state.motor.connection],
                ['Rated current', state.motor.ratedCurrent],
                ['Rated speed', `${state.motor.ratedRpm} rpm (${state.motor.poles}-pole)`],
                ['Frame / insulation', `${state.motor.frame} / ${state.motor.insulation}`],
              ]}
            />
          )}
        </Card>
        <Card title="Acquisition" info={INFO.sampling}>
          {state && (
            <KeyValue
              rows={[
                ['Vibration sensor', state.acquisition.vibrationSensor],
                ['Sample rate', `${state.acquisition.sampleRateHz} Hz`],
                ['Feature window', `${state.acquisition.featureWindowS} s (${state.acquisition.sampleRateHz * state.acquisition.featureWindowS} samples)`],
                ['Jitter window', `${state.acquisition.jitterWindowRevs} revolutions (~${((state.acquisition.jitterWindowRevs * state.acquisition.revPeriodMs) / 1000).toFixed(1)} s)`],
                ['Shaft frequency', `${state.acquisition.shaftHz.toFixed(1)} Hz at rated speed`],
                ['Kurtosis', state.acquisition.kurtosisConvention],
                ['Vibration unit', state.acquisition.vibrationUnit],
                ['Inference', state.acquisition.inferenceLocation],
              ]}
            />
          )}
        </Card>
      </section>

      <Card title="Wiring">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <PinTable title="Board A — sensor node (ESP32, 30-pin)" rows={PINS_A} />
          <PinTable title="Board B — inference and gateway (ESP32, 38-pin)" rows={PINS_B} />
        </div>
        <p className="text-[12px] text-[var(--muted)] mt-3">
          Measure each CT module’s output with a multimeter before connecting it to a GPIO. The divider keeps a 5 V signal at about 3.0 V.
        </p>
      </Card>

      <Card title="Packet format sent by Board B">
        <pre className="text-[12px] leading-relaxed bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3 overflow-x-auto">{EXAMPLE}</pre>
        <p className="text-[12px] text-[var(--muted)] mt-2">
          Unknown or unavailable values: send <code>null</code> or leave the field out. Up to 500 rows per request, so buffered rows can be
          re-sent after a Wi-Fi drop. The same field names are the SD-card CSV columns.
        </p>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Demo mode" info={INFO.demo}>
          {canDemo ? (
            <div className="space-y-3">
              <p className="text-[13px] text-[var(--text-2)]">
                {state?.demo.running ? 'The demo is running.' : 'The demo is stopped.'}{' '}
                {state?.deviceStatus === 'LIVE' && 'It cannot start while a real device is live.'}
              </p>
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                Scenario
                <select
                  className="field h-8 w-auto text-[12.5px]"
                  value={state?.demo.scenario ?? 'cycle'}
                  disabled={busy}
                  onChange={(e) => run(() => api(token, '/api/demo', { method: 'POST', body: JSON.stringify({ scenario: e.target.value }) }), 'Scenario changed.')}
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                {state?.demo.running ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => run(() => api(token, '/api/demo', { method: 'POST', body: JSON.stringify({ action: 'stop' }) }), 'Demo stopped.')}
                  >
                    Stop demo
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || state?.deviceStatus === 'LIVE'}
                    onClick={() => run(() => api(token, '/api/demo', { method: 'POST', body: JSON.stringify({ action: 'start' }) }), 'Demo started.')}
                  >
                    Start demo
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">Only engineer and admin accounts can start or stop the demo.</p>
          )}
        </Card>

        <Card title="Server data">
          {isAdmin ? (
            confirmClear ? (
              <div className="space-y-3">
                <p className="text-[13px] text-[var(--text)]">
                  Clear all <strong>{confirmClear === 'demo' ? 'demo' : 'device'}</strong> rows held in server memory? Charts and exports
                  for that source start empty. The SD card in Board B is not affected. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setConfirmClear(null)}>
                    Keep data
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await api(token, `/api/buffer?source=${confirmClear}`, { method: 'DELETE' });
                        setConfirmClear(null);
                        return r;
                      }, `Cleared ${confirmClear} rows from server memory.`)
                    }
                  >
                    Clear {confirmClear} history
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-[var(--text-2)]">
                  Remove rows from server memory, for example before a fresh test run. Export first if you need them.
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-danger" onClick={() => setConfirmClear('device')}>
                    Clear device history…
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmClear('demo')}>
                    Clear demo history…
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">Only the admin account can clear server data.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
