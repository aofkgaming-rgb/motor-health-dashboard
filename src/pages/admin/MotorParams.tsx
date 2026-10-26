import React, { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { AuthUser } from '../../types';
import { CustomParam, DEFAULT_MOTOR, METRIC_KEYS, MetricKey, MotorProfile, ParamSetting, PinRow, Settings } from '../../shared/settings';
import { Card } from '../../components/ui';
import { Banner, Field, NumCell, toNum, useAdminSettings } from './common';

const BLANK_MOTOR: MotorProfile = {
  ...DEFAULT_MOTOR,
  id: '',
  name: '',
  make: '',
  type: '',
  power: '',
  voltage: '',
  connection: '',
  ratedCurrentA: null,
  ratedRpm: null,
  poles: null,
  frame: '',
  insulation: '',
  location: '',
  installedOn: '',
  notes: '',
};

function MotorForm({ m, setM, isNew }: { m: MotorProfile; setM: (m: MotorProfile) => void; isNew: boolean }) {
  const f = (k: keyof MotorProfile, label: string, hint?: string, type = 'text') => (
    <Field
      label={label}
      hint={hint}
      type={type}
      value={m[k] as any}
      disabled={k === 'id' && !isNew}
      onChange={(v) => setM({ ...m, [k]: type === 'number' ? (v === '' ? null : Number(v)) : k === 'id' ? v.toUpperCase() : v })}
    />
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {f('id', 'Motor ID', isNew ? 'e.g. MHM-BENCH-02 (cannot be changed later)' : 'Fixed')}
      {f('name', 'Name')}
      {f('location', 'Location')}
      {f('make', 'Make')}
      {f('type', 'Type')}
      {f('power', 'Rating', 'e.g. 0.75 kW / 1.0 HP')}
      {f('voltage', 'Supply', 'e.g. 415 V, 3-phase, 50 Hz')}
      {f('connection', 'Connection')}
      {f('ratedCurrentA', 'Rated current (A)', 'Used for “% of rated” on the overview', 'number')}
      {f('ratedRpm', 'Rated speed (rpm)', undefined, 'number')}
      {f('poles', 'Poles', undefined, 'number')}
      {f('frame', 'Frame')}
      {f('insulation', 'Insulation class')}
      {f('installedOn', 'Installed on', undefined, 'date')}
      <label className="block text-[12.5px] font-medium sm:col-span-2 xl:col-span-3">
        Notes
        <textarea className="field mt-1 py-2 h-16" value={m.notes} maxLength={500} onChange={(e) => setM({ ...m, notes: e.target.value })} />
      </label>
    </div>
  );
}

function PinEditor({ title, rows, setRows }: { title: string; rows: PinRow[]; setRows: (r: PinRow[]) => void }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_2.5fr_auto] gap-1.5">
            {[0, 1, 2].map((c) => (
              <input
                key={c}
                aria-label={['Module', 'Pin', 'Connection'][c] + ` row ${i + 1}`}
                className="field h-8 text-[12.5px] px-2"
                value={r[c]}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? (x.map((y, k) => (k === c ? e.target.value : y)) as PinRow) : x)))}
              />
            ))}
            <button type="button" className="btn" aria-label={`Remove row ${i + 1}`} title="Remove row" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setRows([...rows, ['', '', '']])}>
          <Plus size={13} /> Add row
        </button>
      </div>
    </div>
  );
}

export function AdminMotor({ token }: { token: string; user: AuthUser }) {
  const { settings: s, msg, busy, save } = useAdminSettings(token);
  const [sel, setSel] = useState<string | 'new' | null>(null);
  const [m, setM] = useState<MotorProfile | null>(null);
  const [confirmAct, setConfirmAct] = useState<string | null>(null);
  const [params, setParams] = useState<Settings['params'] | null>(null);
  const [custom, setCustom] = useState<CustomParam[]>([]);
  const [th, setTh] = useState<{ zWarn: any; zCrit: any; debounceRows: any } | null>(null);
  const [info, setInfo] = useState<Pick<Settings, 'deviceInfo' | 'model'> | null>(null);
  const [descFor, setDescFor] = useState<MetricKey | null>(null);

  useEffect(() => {
    if (!s) return;
    setParams(JSON.parse(JSON.stringify(s.params)));
    setCustom(JSON.parse(JSON.stringify(s.customParams)));
    setTh({ ...s.thresholds });
    setInfo({ deviceInfo: JSON.parse(JSON.stringify(s.deviceInfo)), model: { ...s.model } });
    if (sel === null) {
      setSel(s.activeMotorId);
      setM({ ...s.motors.find((x) => x.id === s.activeMotorId)! });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  if (!s || !params || !th || !info) return <p className="text-[13px] text-[var(--text-2)]">Loading settings…</p>;

  const setP = (k: MetricKey, patch: Partial<ParamSetting>) => setParams({ ...params, [k]: { ...params[k], ...patch } });
  const limitKeys = ['warnLow', 'critLow', 'warnHigh', 'critHigh'] as const;

  return (
    <div className="space-y-4">
      <Banner msg={msg} />

      {/* Motors */}
      <Card
        title="Motors"
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSel('new');
              setM({ ...BLANK_MOTOR });
            }}
          >
            <Plus size={14} /> Add a new motor
          </button>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Motor profiles">
          {s.motors.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={sel === x.id}
              onClick={() => {
                setSel(x.id);
                setM({ ...x });
                setConfirmAct(null);
              }}
              className={`rounded-md border px-3 py-2 text-left text-[12.5px] cursor-pointer ${
                sel === x.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-strong)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {x.name}
                {x.id === s.activeMotorId && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-[#08700a]">
                    <CheckCircle2 size={12} /> monitored
                  </span>
                )}
              </span>
              <span className="text-[11.5px] text-[var(--muted)] num">{x.id}</span>
            </button>
          ))}
        </div>
        {m && (
          <div className="space-y-3">
            <MotorForm m={m} setM={setM} isNew={sel === 'new'} />
            <div className="flex flex-wrap gap-2 items-center">
              {sel === 'new' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    if (await save('POST', '/api/admin/motors', m, `Added ${m.name}. Make it the monitored motor when it is connected.`)) setSel(m.id);
                  }}
                >
                  Create motor profile
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save('PUT', `/api/admin/motors/${m.id}`, m, `Saved ${m.name}.`)}>
                    Save motor details
                  </button>
                  {m.id !== s.activeMotorId &&
                    (confirmAct === m.id ? (
                      <>
                        <span className="text-[12.5px]">Monitor {m.name} from now on? Board B needs a new healthy baseline for this motor.</span>
                        <button type="button" className="btn" onClick={() => setConfirmAct(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={async () => {
                            if (await save('POST', `/api/admin/motors/${m.id}/activate`, undefined, `${m.name} is now the monitored motor. An alert reminds everyone to recalibrate.`)) setConfirmAct(null);
                          }}
                        >
                          Switch to {m.name}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn" onClick={() => setConfirmAct(m.id)}>
                          Make this the monitored motor…
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy}
                          onClick={async () => {
                            if (await save('DELETE', `/api/admin/motors/${m.id}`, undefined, `Deleted ${m.name}.`)) {
                              setSel(s.activeMotorId);
                              setM({ ...s.motors.find((x) => x.id === s.activeMotorId)! });
                            }
                          }}
                        >
                          Delete {m.name}
                        </button>
                      </>
                    ))}
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Thresholds */}
      <Card title="Baseline thresholds (z-score)">
        <div className="flex flex-wrap items-start gap-3">
          <Field label="Warning at |z| ≥" type="number" step="0.1" value={th.zWarn} onChange={(v) => setTh({ ...th, zWarn: v })} className="w-40" />
          <Field label="Critical at |z| ≥" type="number" step="0.1" value={th.zCrit} onChange={(v) => setTh({ ...th, zCrit: v })} className="w-40" />
          <Field label="Rows to confirm a change" type="number" step="1" value={th.debounceRows} onChange={(v) => setTh({ ...th, debounceRows: v })} className="w-48" hint="Stops one noisy row raising an alert" />
          <button
            type="button"
            className="btn btn-primary mt-[22px]"
            disabled={busy}
            onClick={() => save('PUT', '/api/admin/thresholds', { zWarn: toNum(th.zWarn), zCrit: toNum(th.zCrit), debounceRows: toNum(th.debounceRows) }, 'Thresholds saved. New rows are judged with them at once.')}
          >
            Save thresholds
          </button>
        </div>
        <p className="text-[12px] text-[var(--muted)] mt-2">
          Project defaults are 3 and 5. They are statistical choices, not values from a standard. Board B uses its own copy for the OLED; keep them equal.
        </p>
      </Card>

      {/* Built-in parameters */}
      <Card title="Parameters: names, units and limits" bodyClass="p-0 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Packet field</th>
              <th>Name shown</th>
              <th>Unit</th>
              <th>Decimals</th>
              <th>Warn low</th>
              <th>Crit low</th>
              <th>Warn high</th>
              <th>Crit high</th>
              <th aria-label="Description" />
            </tr>
          </thead>
          <tbody>
            {METRIC_KEYS.map((k) => (
              <React.Fragment key={k}>
                <tr>
                  <td className="font-mono text-[12px] whitespace-nowrap">{k === 'current' ? 'i_l1_a…i_l3_a (max)' : k}</td>
                  <td>
                    <input aria-label={`Name of ${k}`} className="field h-8 text-[12.5px] px-2 min-w-[180px]" value={params[k].label} onChange={(e) => setP(k, { label: e.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`Unit of ${k}`} className="field h-8 text-[12.5px] px-2 w-[80px]" value={params[k].unit} onChange={(e) => setP(k, { unit: e.target.value })} />
                  </td>
                  <td>
                    <NumCell label={`Decimals of ${k}`} step="1" value={params[k].decimals} onChange={(v) => setP(k, { decimals: Number(v) })} />
                  </td>
                  {limitKeys.map((lk) => (
                    <td key={lk}>
                      <NumCell label={`${lk} of ${k}`} value={params[k][lk] as any} onChange={(v) => setP(k, { [lk]: v as any })} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="text-[12px] text-[var(--accent-ink)] hover:underline cursor-pointer whitespace-nowrap" onClick={() => setDescFor(descFor === k ? null : k)}>
                      {descFor === k ? 'Close text' : params[k].what || params[k].why ? 'Edit ⓘ text (changed)' : 'Edit ⓘ text'}
                    </button>
                  </td>
                </tr>
                {descFor === k && (
                  <tr>
                    <td colSpan={9} className="bg-[var(--surface-2)]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block text-[12.5px] font-medium">
                          What it is (empty = built-in text)
                          <textarea className="field mt-1 py-2 h-20" maxLength={800} value={params[k].what} onChange={(e) => setP(k, { what: e.target.value })} />
                        </label>
                        <label className="block text-[12.5px] font-medium">
                          Why we monitor it (empty = built-in text)
                          <textarea className="field mt-1 py-2 h-20" maxLength={800} value={params[k].why} onChange={(e) => setP(k, { why: e.target.value })} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-[var(--border)] flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              const clean: any = {};
              for (const k of METRIC_KEYS) clean[k] = { ...params[k], ...Object.fromEntries(limitKeys.map((lk) => [lk, toNum(params[k][lk] as any)])) };
              save('PUT', '/api/admin/params', { params: clean }, 'Parameters saved. Every open dashboard updates.');
            }}
          >
            Save parameters
          </button>
          <p className="text-[12px] text-[var(--muted)]">
            Limits are optional absolute values in the parameter’s unit. Leave empty to rely on the baseline z-score only. A value outside a limit for the
            confirm count raises a “Limit” alert.
          </p>
        </div>
      </Card>

      {/* Custom parameters */}
      <Card
        title="Custom parameters (new packet fields)"
        actions={
          <button
            type="button"
            className="btn"
            disabled={custom.length >= 12}
            onClick={() => setCustom([...custom, { key: '', label: '', unit: '', decimals: 2, what: '', warnHigh: null, critHigh: null, warnLow: null, critLow: null }])}
          >
            <Plus size={14} /> Add parameter
          </button>
        }
      >
        <p className="text-[13px] text-[var(--text-2)] mb-3">
          When the firmware starts sending a new number, register its field name here. The dashboard then shows it on the Overview, Parameters and History
          pages and adds it as an extra column in exports — no code change needed.
        </p>
        {custom.length ? (
          <div className="space-y-3">
            {custom.map((c, i) => {
              const set = (patch: Partial<CustomParam>) => setCustom(custom.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="border border-[var(--border)] rounded-md p-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 items-end">
                  <Field label="Field name" value={c.key} onChange={(v) => set({ key: v.toLowerCase() })} hint="e.g. vib_axial_g" className="col-span-2" />
                  <Field label="Name shown" value={c.label} onChange={(v) => set({ label: v })} className="col-span-2" />
                  <Field label="Unit" value={c.unit} onChange={(v) => set({ unit: v })} />
                  <Field label="Decimals" type="number" value={c.decimals} onChange={(v) => set({ decimals: Number(v) })} />
                  <Field label="Warn high" type="number" value={c.warnHigh as any} onChange={(v) => set({ warnHigh: v as any })} />
                  <Field label="Crit high" type="number" value={c.critHigh as any} onChange={(v) => set({ critHigh: v as any })} />
                  <label className="block text-[12.5px] font-medium col-span-2 md:col-span-3 xl:col-span-7">
                    Description (ⓘ text)
                    <input className="field h-9 mt-1" value={c.what} maxLength={800} onChange={(e) => set({ what: e.target.value })} />
                  </label>
                  <button type="button" className="btn btn-danger" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--muted)]">No custom parameters.</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              save(
                'PUT',
                '/api/admin/params',
                { params: {}, customParams: custom.map((c) => ({ ...c, warnHigh: toNum(c.warnHigh as any), critHigh: toNum(c.critHigh as any), warnLow: toNum(c.warnLow as any), critLow: toNum(c.critLow as any) })) },
                'Custom parameters saved.',
              )
            }
          >
            Save custom parameters
          </button>
          <p className="text-[12px] text-[var(--muted)] font-mono">
            {custom.filter((c) => c.key).length ? `Board B sends: { ..., ${custom.filter((c) => c.key).map((c) => `"${c.key}": 0.0`).join(', ')} }` : ''}
          </p>
        </div>
      </Card>

      {/* Information */}
      <Card title="Information shown on the Edge AI and Device pages">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Model algorithm" value={info.model.algorithm} onChange={(v) => setInfo({ ...info, model: { ...info.model, algorithm: v } })} />
            <Field label="Classes" value={info.model.classes} onChange={(v) => setInfo({ ...info, model: { ...info.model, classes: v } })} />
            <Field label="Trained on" value={info.model.trainedOn} onChange={(v) => setInfo({ ...info, model: { ...info.model, trainedOn: v } })} hint="e.g. MaFaulDa normal + imbalance, 26 Oct 2026" />
            <Field label="Validation result" value={info.model.validation} onChange={(v) => setInfo({ ...info, model: { ...info.model, validation: v } })} hint="e.g. Accuracy 0.97 on held-out files" />
          </div>
          <PinEditor title="Board A wiring" rows={info.deviceInfo.boardA} setRows={(r) => setInfo({ ...info, deviceInfo: { ...info.deviceInfo, boardA: r } })} />
          <PinEditor title="Board B wiring" rows={info.deviceInfo.boardB} setRows={(r) => setInfo({ ...info, deviceInfo: { ...info.deviceInfo, boardB: r } })} />
          <label className="block text-[12.5px] font-medium">
            Wiring note
            <textarea
              className="field mt-1 py-2 h-16"
              maxLength={1000}
              value={info.deviceInfo.notes}
              onChange={(e) => setInfo({ ...info, deviceInfo: { ...info.deviceInfo, notes: e.target.value } })}
            />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save('PUT', '/api/admin/info', info, 'Information saved.')}>
            Save information
          </button>
        </div>
      </Card>
    </div>
  );
}
