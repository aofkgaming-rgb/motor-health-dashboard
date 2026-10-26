import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Download, FileSpreadsheet } from 'lucide-react';
import type { AuthUser, PublicConfig, ServerState, Source } from '../types';
import { CSV_COLUMNS, SCHEMA_VERSION } from '../shared/contract';
import { dayKey } from '../shared/settings';
import { INFO } from '../content/info';
import { Card, EmptyNote, InfoButton } from '../components/ui';
import { Legend, TrendChart } from '../components/TrendChart';
import { dateTime, fmt } from '../lib/format';
import { RANGES, RangeKey, resolutionText, useSeries } from '../lib/useHistory';
import { allViews, limitLines, useMaintenanceMarkers } from '../lib/params';
import { api, download } from '../lib/useLive';
import { can } from '../lib/access';

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
  vote_share: ['0–1', 'Share of the trees voting for the class'],
  model: ['text', 'Model id; "rules" = fallback, "demo" = simulated'],
  z_max: ['—', 'Largest |z| against the healthy baseline'],
  calibrated: ['1 | 0', 'Whether the healthy baseline exists'],
  quality: ['flags', 'Data-quality notes added by the server, ; separated'],
};

const STEPS = [
  { s: 10, label: 'Every 10 s (all stored rows)' },
  { s: 60, label: 'One row per minute' },
  { s: 600, label: 'One row per 10 minutes' },
  { s: 3600, label: 'One row per hour' },
];

function niceDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** One-day export and date-range ("selective") export. */
function ExportPanel({ token, src, config }: { token: string; src: Source; config: PublicConfig | null }) {
  const tz = config?.tzOffsetMin ?? 330;
  const today = dayKey(Date.now(), tz);
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(dayKey(Date.now() - 6 * 86400e3, tz));
  const [to, setTo] = useState(today);
  const [step, setStep] = useState(60);
  const [fmt_, setFmt] = useState<'csv' | 'xlsx'>('xlsx');
  const [allCols, setAllCols] = useState(true);
  const custom = (config?.customParams ?? []).map((c) => c.key);
  const choosable = [...CSV_COLUMNS.filter((c) => c !== 'timestamp_utc'), ...custom];
  const [cols, setCols] = useState<string[]>(['rpm', 'jitter_pct', 'rms_g', 'peak_g', 'crest', 'kurtosis', 'temp_c', 'i_l1_a', 'i_l2_a', 'i_l3_a', 'class', 'z_max']);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ days: string[] }>(token, `/api/export/days?source=${src}`)
      .then((d) => setDays(d.days))
      .catch(() => setDays([]));
  }, [token, src]);

  const first = days[0] ?? today;
  const run = async (kind: 'day' | 'range', format: 'csv' | 'xlsx') => {
    setBusy(`${kind}-${format}`);
    setMsg(null);
    try {
      const q =
        kind === 'day'
          ? `day=${day}&step=10`
          : `from=${from}&to=${to}&step=${step}${allCols ? '' : `&columns=${encodeURIComponent(cols.join(','))}`}`;
      const r = await download(token, `/api/export?source=${src}&format=${format}&${q}`, `MHM_export.${format}`);
      setMsg({ ok: true, text: `Downloaded ${r.name}${r.count !== null ? ` — ${r.count} rows` : ''}.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };
  const rangeDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400e3) + 1;

  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card title="One-day export" info={INFO.storage}>
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--text-2)]">
            One calendar day, every stored row (one per 10 s, up to 8 640 rows). Same columns as the SD-card file.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12.5px] font-medium">
              Day
              <input type="date" className="field h-9 mt-1 w-[170px]" value={day} min={first} max={today} onChange={(e) => setDay(e.target.value)} />
            </label>
            <span className="text-[12px] text-[var(--muted)] pb-2">{days.includes(day) ? 'Data stored for this day' : 'No data stored for this day'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={!!busy || !day} onClick={() => run('day', 'xlsx')}>
              <FileSpreadsheet size={14} /> {busy === 'day-xlsx' ? 'Preparing…' : 'Download Excel'}
            </button>
            <button type="button" className="btn" disabled={!!busy || !day} onClick={() => run('day', 'csv')}>
              <Download size={14} /> {busy === 'day-csv' ? 'Preparing…' : 'Download CSV'}
            </button>
          </div>
          {days.length > 0 && (
            <div>
              <div className="eyebrow mb-1">Days with data ({days.length})</div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {days
                  .slice()
                  .reverse()
                  .map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDay(d)}
                      className={`text-[11.5px] num rounded px-1.5 py-0.5 border cursor-pointer ${
                        d === day ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      {d.slice(5)}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Selective data export" actions={<CalendarRange size={16} className="text-[var(--muted)]" aria-hidden />}>
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--text-2)]">Choose a date range on the calendar, the row spacing and the columns.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12.5px] font-medium">
              From
              <input type="date" className="field h-9 mt-1 w-[170px]" value={from} min={first} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-[12.5px] font-medium">
              To
              <input type="date" className="field h-9 mt-1 w-[170px]" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="text-[12.5px] font-medium">
              Rows
              <select className="field h-9 mt-1 w-auto" value={step} onChange={(e) => setStep(Number(e.target.value))}>
                {STEPS.map((s) => (
                  <option key={s.s} value={s.s}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[12px] text-[var(--muted)] num">
            {rangeDays > 0 ? `${rangeDays} day${rangeDays === 1 ? '' : 's'} · up to ${Math.ceil((rangeDays * 86400) / step).toLocaleString()} rows` : 'Choose a valid range'}
            {' · '}spacing keeps one measured row per step; nothing is averaged.
          </p>
          <fieldset>
            <legend className="text-[12.5px] font-medium mb-1">Columns</legend>
            <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={allCols} onChange={(e) => setAllCols(e.target.checked)} />
              All columns (same as the SD-card file{custom.length ? ', plus custom parameters' : ''})
            </label>
            {!allCols && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                <label className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
                  <input type="checkbox" checked disabled /> timestamp_utc
                </label>
                {choosable.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-[12px] font-mono cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cols.includes(c)}
                      onChange={(e) => setCols((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))}
                    />
                    {c}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg" role="group" aria-label="File type">
              <button type="button" aria-pressed={fmt_ === 'xlsx'} onClick={() => setFmt('xlsx')}>
                Excel (.xlsx)
              </button>
              <button type="button" aria-pressed={fmt_ === 'csv'} onClick={() => setFmt('csv')}>
                CSV
              </button>
            </div>
            <button type="button" className="btn btn-primary" disabled={!!busy || rangeDays < 1} onClick={() => run('range', fmt_)}>
              <Download size={14} /> {busy?.startsWith('range') ? 'Preparing…' : `Export ${from === to ? niceDay(from) : `${from} → ${to}`}`}
            </button>
          </div>
        </div>
      </Card>
      {msg && (
        <p
          role="status"
          className={`xl:col-span-2 text-[12.5px] rounded-md px-3 py-2 ${msg.ok ? 'bg-[var(--good-soft)] text-[#08700a]' : 'bg-[var(--crit-soft)] text-[#a82626]'}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}

export function History({
  token,
  user,
  state,
  config,
  maintenanceTick,
}: {
  token: string;
  user: AuthUser;
  state: ServerState | null;
  config: PublicConfig | null;
  maintenanceTick: number;
}) {
  const longOk = can(user, 'history.long');
  const exportOk = can(user, 'export.data');
  const [rangeKey, setRangeKey] = useState<RangeKey>('1h');
  const [source, setSource] = useState<Source | null>(null);
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const src: Source = source ?? state?.activeSource ?? 'device';
  const series = useSeries(token, src, range.ms, true, maintenanceTick);
  const inRange = series.rows;
  const showDate = range.ms > 6 * 3600e3;
  const tz = config?.tzOffsetMin ?? 330;
  const markersRaw = useMaintenanceMarkers(token, maintenanceTick);
  const markers = showDate ? markersRaw.map((m) => ({ ts: Date.parse(`${m.date}T12:00:00Z`) - tz * 60000, label: `Maintenance ${m.date}: ${m.type}` })) : [];
  const views = useMemo(() => allViews(config).filter((v) => v.key !== 'current' && v.key !== 'rpm' && v.key !== 'temp_c'), [config]);

  const currentSeries = [
    { key: 'l1', label: 'L1', color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r.i_l1_a] as [number, number | null]) },
    { key: 'l2', label: 'L2', color: 'var(--series-2)', points: inRange.map((r) => [r.ts, r.i_l2_a] as [number, number | null]) },
    { key: 'l3', label: 'L3', color: 'var(--series-3)', points: inRange.map((r) => [r.ts, r.i_l3_a] as [number, number | null]) },
  ];
  const tempV = allViews(config).find((v) => v.key === 'temp_c')!;
  const rpmV = allViews(config).find((v) => v.key === 'rpm')!;

  return (
    <div className="space-y-4">
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => {
            const blocked = r.long && !longOk;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={rangeKey === r.key}
                disabled={blocked}
                title={blocked ? 'Your role can view up to 24 hours. Ask the admin for longer trends.' : undefined}
                className={blocked ? 'opacity-50 cursor-not-allowed' : ''}
                onClick={() => setRangeKey(r.key)}
              >
                {r.label}
              </button>
            );
          })}
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
          {series.loading && !inRange.length ? 'Loading…' : `${inRange.length} points`} · {resolutionText(series.tier, series.bucketMs)}
        </span>
        <InfoButton content={INFO.storage} />
      </div>
      {series.error && <p className="text-[12.5px] text-[#a82626]">{series.error}</p>}
      {src === 'demo' && <p className="text-[12.5px] text-[var(--text-2)]">Demo rows are simulated. Exported files are named “DEMO-DATA”.</p>}

      {!series.loading && !inRange.length ? (
        <Card title="No data in this range">
          <EmptyNote title={`No ${src === 'demo' ? 'demo' : 'device'} rows in the last ${range.label}`}>
            {src === 'device'
              ? 'The device has not sent data in this period, or the server history was reset. Long-term history is on the SD card in Board B; the admin can import it.'
              : 'Start the demo from the Device page, or ask the admin to generate demo history (System & data).'}
          </EmptyNote>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {views.map((p) => (
              <Card key={p.key} title={`${p.name}${p.unit !== '—' ? ` (${p.unit})` : ''}`} info={p.info}>
                <TrendChart
                  height={150}
                  unit={p.unit !== '—' ? p.unit : ''}
                  decimals={p.decimals}
                  showDate={showDate}
                  refLines={limitLines(p.limits)}
                  markers={markers}
                  ariaLabel={`${p.name} over ${range.label}`}
                  series={[{ key: p.key, label: p.name, color: 'var(--series-1)', points: inRange.map((r) => [r.ts, p.get(r)]) }]}
                />
              </Card>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Phase currents (A)" info={INFO.current} actions={<Legend series={currentSeries} />}>
              <TrendChart height={150} unit="A" decimals={2} showDate={showDate} markers={markers} ariaLabel="Phase currents" series={currentSeries} />
            </Card>
            <Card title={`${tempV.name} (°C)`} info={tempV.info}>
              <TrendChart
                height={150}
                unit="°C"
                decimals={1}
                showDate={showDate}
                refLines={limitLines(tempV.limits)}
                markers={markers}
                ariaLabel="Temperature"
                series={[{ key: 't', label: 'Temperature', color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r.temp_c]) }]}
              />
            </Card>
            <Card title={`${rpmV.name} (rpm)`} info={rpmV.info}>
              <TrendChart
                height={150}
                unit="rpm"
                decimals={0}
                showDate={showDate}
                refLines={limitLines(rpmV.limits)}
                markers={markers}
                ariaLabel="Shaft speed"
                series={[{ key: 'rpm', label: 'Speed', color: 'var(--series-1)', points: inRange.map((r) => [r.ts, r.rpm]) }]}
              />
            </Card>
          </section>

          <Card title={range.long || series.bucketMs ? 'Latest points (averaged)' : 'Latest rows'} bodyClass="p-0 overflow-x-auto">
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

      {exportOk ? (
        <ExportPanel token={token} src={src} config={config} />
      ) : (
        <Card title="Export">
          <p className="text-[13px] text-[var(--text-2)]">Your role cannot export data. Ask the admin if you need a file.</p>
        </Card>
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
            {(config?.customParams ?? []).map((c) => (
              <tr key={c.key}>
                <td className="font-mono text-[12px]">{c.key}</td>
                <td className="whitespace-nowrap">{c.unit || '—'}</td>
                <td className="text-[var(--text-2)]">Custom parameter added by the admin: {c.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[12px] text-[var(--muted)] border-t border-[var(--border)]">
          Missing values are left empty, never written as 0. Decimal point is “.”, separator is “,”. Excel files add a local-time column
          and an “About” sheet. The first 21 columns are the SD-card log on Board B, so files from both open the same way.
        </p>
      </Card>
    </div>
  );
}
