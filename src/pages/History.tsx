import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { ServerState, Source, TelemetryRow } from '../types';
import { CSV_COLUMNS, SCHEMA_VERSION } from '../shared/contract';
import { INFO, PARAMS } from '../content/info';
import { Card, EmptyNote, InfoButton } from '../components/ui';
import { Legend, TrendChart } from '../components/TrendChart';
import { dateTime, fmt } from '../lib/format';

const RANGES = [
  { key: '15m', label: '15 min', ms: 15 * 60e3, res: 'live' as const },
  { key: '1h', label: '1 h', ms: 3600e3, res: 'hist' as const },
  { key: '6h', label: '6 h', ms: 6 * 3600e3, res: 'hist' as const },
  { key: '24h', label: '24 h', ms: 24 * 3600e3, res: 'hist' as const },
];

const COLUMN_DOCS: Record<(typeof CSV_COLUMNS)[number], [string, string]> = {
  timestamp_utc: ['ISO 8601, UTC', 'Device clock (DS3231 / NTP); server time if the device time was invalid'],
  device_id: ['text', 'Board B identity'],
  source: ['device | demo', 'Whether the row was measured or simulated'],
  seq: ['integer', 'Board B row counter, used to drop duplicates'],
  rpm: ['rpm', 'Hall sensor, 60 / mean revolution period'],
  jitter_pct: ['%', 'σ/mean of revolution period over 50 revolutions'],
  rms_g: ['g', 'ADXL345, RMS over 1 s (3200 samples), mean removed'],
  peak_g: ['g', 'ADXL345, max |x − mean| over 1 s'],
  crest: ['ratio', 'peak_g / rms_g'],
  kurtosis: ['—', 'Pearson kurtosis (Gaussian = 3.0)'],
  temp_c: ['°C', 'MLX90614 frame surface temperature'],
  temp_rise_c_min: ['°C/min', 'Temperature slope over 6 samples'],
  i_l1_a: ['A RMS', 'ZMCT103C, line 1'],
  i_l2_a: ['A RMS', 'ZMCT103C, line 2'],
  i_l3_a: ['A RMS', 'ZMCT103C, line 3'],
  class: ['text', 'Class label from the on-device model'],
  vote_share: ['0–1', 'Share of the 50 trees voting for the class'],
  model: ['text', 'Model id; "rules" = fallback, "demo" = simulated'],
  z_max: ['—', 'Largest |z| against the healthy baseline'],
  calibrated: ['1 | 0', 'Whether the healthy baseline exists'],
  quality: ['flags', 'Data-quality notes added by the server, ; separated'],
};

export function History({ token, state }: { token: string; state: ServerState | null }) {
  const [rangeKey, setRangeKey] = useState('1h');
  const [source, setSource] = useState<Source | null>(null);
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const range = RANGES.find((r) => r.key === rangeKey)!;
  const src: Source = source ?? state?.activeSource ?? 'device';

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/telemetry?source=${src}&res=${range.res}&limit=10000`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          if (!alive) return;
          setRows(d.rows || []);
          setLoadError(null);
        })
        .catch(() => alive && setLoadError('Could not load data from the server. Retrying every 15 s.'))
        .finally(() => alive && setLoading(false));
    setLoading(true);
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token, src, range.res]);

  const newest = rows.length ? rows[rows.length - 1].ts : Date.now();
  const from = newest - range.ms;
  const inRange = useMemo(() => rows.filter((r) => r.ts >= from), [rows, from]);
  const showDate = range.ms > 6 * 3600e3;

  const doExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const url = `/api/export.csv?source=${src}&res=${range.res}&from=${Math.floor(from)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const count = Number(res.headers.get('X-Row-Count') || '0');
      if (!count) {
        setExportMsg({ ok: false, text: 'There are no rows in this range to export. Choose a longer range or wait for data.' });
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'MHM_export.csv';
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setExportMsg({ ok: true, text: `Downloaded ${name} — ${count} rows.` });
    } catch {
      setExportMsg({ ok: false, text: 'Export failed. Check the connection and try again.' });
    } finally {
      setExporting(false);
    }
  };

  const currentSeries = [
    { key: 'l1', label: 'L1', color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r.i_l1_a] as [number, number | null]) },
    { key: 'l2', label: 'L2', color: 'var(--series-2)', points: inRange.map((r) => [r.ts, r.i_l2_a] as [number, number | null]) },
    { key: 'l3', label: 'L3', color: 'var(--series-3)', points: inRange.map((r) => [r.ts, r.i_l3_a] as [number, number | null]) },
  ];

  return (
    <div className="space-y-4">
      {/* Filters + export, one row */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Data source">
          <button type="button" aria-pressed={src === 'device'} onClick={() => setSource('device')}>
            Device data
          </button>
          <button type="button" aria-pressed={src === 'demo'} onClick={() => setSource('demo')}>
            Demo data
          </button>
        </div>
        <span className="text-[12.5px] text-[var(--text-2)] num">
          {loading ? 'Loading…' : `${inRange.length} rows`} · {range.res === 'live' ? 'every row' : 'one row per 10 s'}
        </span>
        <InfoButton content={INFO.storage} />
        <button type="button" className="btn btn-primary ml-auto" onClick={doExport} disabled={exporting || loading}>
          <Download size={14} /> {exporting ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>
      {exportMsg && (
        <p
          role="status"
          className={`text-[12.5px] rounded-md px-3 py-2 ${exportMsg.ok ? 'bg-[var(--good-soft)] text-[#08700a]' : 'bg-[var(--crit-soft)] text-[#a82626]'}`}
        >
          {exportMsg.text}
        </p>
      )}
      {loadError && <p className="text-[12.5px] text-[#a82626]">{loadError}</p>}
      {src === 'demo' && (
        <p className="text-[12.5px] text-[var(--text-2)]">Demo rows are simulated. Exported files are named “DEMO-DATA”.</p>
      )}

      {!loading && !inRange.length ? (
        <Card title="No data in this range">
          <EmptyNote title={`No ${src === 'demo' ? 'demo' : 'device'} rows in the last ${range.label}`}>
            {src === 'device'
              ? 'The device has not sent data in this period, or the server restarted. Long-term history is on the SD card in Board B.'
              : 'Start the demo from the Device page to generate simulated rows.'}
          </EmptyNote>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {PARAMS.map((p) => (
              <Card key={p.key} title={`${p.name}${p.unit !== '—' ? ` (${p.unit})` : ''}`} info={p.info}>
                <TrendChart
                  height={150}
                  unit={p.unit !== '—' ? p.unit : ''}
                  decimals={p.decimals}
                  showDate={showDate}
                  ariaLabel={`${p.name} over ${range.label}`}
                  series={[{ key: p.key, label: p.name, color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r[p.key]]) }]}
                />
              </Card>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Phase currents (A)" info={INFO.current} actions={<Legend series={currentSeries} />}>
              <TrendChart height={150} unit="A" decimals={2} showDate={showDate} ariaLabel="Phase currents" series={currentSeries} />
            </Card>
            <Card title="Surface temperature (°C)" info={INFO.temp_c}>
              <TrendChart
                height={150}
                unit="°C"
                decimals={1}
                showDate={showDate}
                ariaLabel="Temperature"
                series={[{ key: 't', label: 'Temperature', color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r.temp_c]) }]}
              />
            </Card>
            <Card title="Shaft speed (rpm)" info={INFO.rpm}>
              <TrendChart
                height={150}
                unit="rpm"
                decimals={0}
                showDate={showDate}
                ariaLabel="Shaft speed"
                series={[{ key: 'rpm', label: 'Speed', color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r.rpm]) }]}
              />
            </Card>
          </section>

          <Card title="Latest rows" bodyClass="p-0 overflow-x-auto">
            <table className="table num">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Class</th>
                  <th>rpm</th>
                  <th>Jitter %</th>
                  <th>RMS g</th>
                  <th>Peak g</th>
                  <th>Crest</th>
                  <th>Kurt.</th>
                  <th>Temp °C</th>
                  <th>dT/dt</th>
                  <th>L1/L2/L3 A</th>
                  <th>|z| max</th>
                </tr>
              </thead>
              <tbody>
                {inRange
                  .slice(-20)
                  .reverse()
                  .map((r) => (
                    <tr key={`${r.ts}-${r.seq}`}>
                      <td className="whitespace-nowrap">{dateTime(r.ts)}</td>
                      <td>{r.cls ?? '—'}</td>
                      <td>{fmt(r.rpm, 0)}</td>
                      <td>{fmt(r.jitter_pct, 3)}</td>
                      <td>{fmt(r.rms_g, 3)}</td>
                      <td>{fmt(r.peak_g, 3)}</td>
                      <td>{fmt(r.crest, 2)}</td>
                      <td>{fmt(r.kurtosis, 2)}</td>
                      <td>{fmt(r.temp_c, 1)}</td>
                      <td>{fmt(r.temp_rise_c_min, 2)}</td>
                      <td className="whitespace-nowrap">
                        {fmt(r.i_l1_a, 2)} / {fmt(r.i_l2_a, 2)} / {fmt(r.i_l3_a, 2)}
                      </td>
                      <td>{fmt(r.z_max, 1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Card title={`CSV columns (schema v${SCHEMA_VERSION})`} bodyClass="p-0 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Unit</th>
              <th>Source / meaning</th>
            </tr>
          </thead>
          <tbody>
            {CSV_COLUMNS.map((c) => (
              <tr key={c}>
                <td className="font-mono text-[12px]">{c}</td>
                <td className="whitespace-nowrap">{COLUMN_DOCS[c][0]}</td>
                <td className="text-[var(--text-2)]">{COLUMN_DOCS[c][1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[12px] text-[var(--muted)] border-t border-[var(--border)]">
          Missing values are left empty, never written as 0. Decimal point is “.”, separator is “,”. The same columns are used in the SD-card
          log on Board B, so files from both open the same way in Excel, MATLAB or Python.
        </p>
      </Card>
    </div>
  );
}
