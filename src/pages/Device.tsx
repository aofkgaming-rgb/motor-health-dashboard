import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import type { AuthUser, PublicConfig, Scenario, ServerState } from '../types';
import { can } from '../lib/access';
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
  config,
  clockOffset,
  onChanged,
}: {
  token: string;
  user: AuthUser;
  state: ServerState | null;
  config: PublicConfig | null;
  clockOffset: number;
  onChanged: () => void;
}) {
  const now = useNow() + clockOffset;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const d = state?.device;
  const canDemo = can(user, 'demo.control');
  const m = config?.activeMotor ?? state?.motor;
  const info = config?.deviceInfo;

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
              ['Server history', `15 min full, 24 h at 10 s, ${config?.retentionDays ?? 31} days at 1 min`],
            ]}
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Motor · ${m?.name ?? ''}`}>
          {m && (
            <KeyValue
              rows={[
                ['Motor ID', m.id],
                ['Make', m.make || '—'],
                ['Type', m.type || '—'],
                ['Rating', m.power || '—'],
                ['Supply', m.voltage || '—'],
                ['Connection', m.connection || '—'],
                ['Rated current', m.ratedCurrentA !== null ? `${m.ratedCurrentA} A (line)` : '—'],
                ['Rated speed', m.ratedRpm !== null ? `${m.ratedRpm} rpm${m.poles ? ` (${m.poles}-pole)` : ''}` : '—'],
                ['Frame / insulation', `${m.frame || '—'} / ${m.insulation || '—'}`],
                ['Location', m.location || '—'],
              ]}
            />
          )}
          {user.role === 'ADMIN' && <p className="text-[12px] text-[var(--muted)] mt-3">Change this in Administration → Motor & parameters.</p>}
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
          <PinTable title="Board A — sensor node (ESP32, 30-pin)" rows={info?.boardA ?? []} />
          <PinTable title="Board B — inference and gateway (ESP32, 38-pin)" rows={info?.boardB ?? []} />
        </div>
        {info?.notes && <p className="text-[12px] text-[var(--muted)] mt-3">{info.notes}</p>}
        <p className="text-[12px] text-[var(--muted)] mt-1">Designed connections, not yet verified on hardware.</p>
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
            <p className="text-[13px] text-[var(--text-2)]">Your role cannot start or stop the demo.</p>
          )}
        </Card>

        <Card title="Server data">
          <p className="text-[13px] text-[var(--text-2)]">
            Clearing history, importing SD-card files, generating demo history and backups are in{' '}
            {user.role === 'ADMIN' ? 'Administration → System & data.' : 'the admin’s System & data page.'}
          </p>
        </Card>
      </section>
    </div>
  );
}
