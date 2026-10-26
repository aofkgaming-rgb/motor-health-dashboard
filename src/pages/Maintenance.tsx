import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import type { AuthUser, PublicConfig, ServerState } from '../types';
import { dayKey, MAINTENANCE_TYPES, MaintenanceRecord } from '../shared/settings';
import { INFO } from '../content/info';
import { Card, EmptyNote, KeyValue } from '../components/ui';
import { api } from '../lib/useLive';
import { can } from '../lib/access';
import { dateTime } from '../lib/format';

interface Summary {
  last: MaintenanceRecord | null;
  nextDue: string | null;
  overdue: boolean;
  count: number;
  today: string;
}

type Draft = Pick<MaintenanceRecord, 'date' | 'type' | 'description' | 'doneBy' | 'nextDue' | 'motorId'>;

function niceDate(d: string) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export function Maintenance({ token, user, config, tick }: { token: string; user: AuthUser; state: ServerState | null; config: PublicConfig | null; tick: number }) {
  const canEdit = can(user, 'maintenance.edit');
  const tz = config?.tzOffsetMin ?? 330;
  const today = dayKey(Date.now(), tz);
  const motors = config?.motors ?? [];
  const activeId = config?.activeMotorId ?? '';
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [motorFilter, setMotorFilter] = useState<string>('active');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  const load = () =>
    api<{ records: MaintenanceRecord[]; summary: Summary }>(token, '/api/maintenance')
      .then((d) => {
        setRecords(d.records);
        setSummary(d.summary);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tick]);

  const startNew = () => {
    setEditing('new');
    setFieldErr(null);
    setDraft({ date: today, type: MAINTENANCE_TYPES[0], description: '', doneBy: user.name, nextDue: '', motorId: activeId });
  };
  const startEdit = (r: MaintenanceRecord) => {
    setEditing(r.id);
    setFieldErr(null);
    setDraft({ date: r.date, type: r.type, description: r.description, doneBy: r.doneBy, nextDue: r.nextDue, motorId: r.motorId });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.description.trim()) {
      setFieldErr('Describe the work that was done.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (editing === 'new') await api(token, '/api/maintenance', { method: 'POST', body: JSON.stringify(draft) });
      else await api(token, `/api/maintenance/${editing}`, { method: 'PUT', body: JSON.stringify(draft) });
      setMsg({ ok: true, text: editing === 'new' ? `Saved maintenance for ${niceDate(draft.date)}.` : 'Changes saved.' });
      setEditing(null);
      setDraft(null);
      load();
    } catch (err: any) {
      setFieldErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api(token, `/api/maintenance/${id}`, { method: 'DELETE' });
      setConfirmDel(null);
      setMsg({ ok: true, text: 'Record deleted. The deletion is kept in the audit log.' });
      load();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const shown = records.filter((r) => (motorFilter === 'all' ? true : r.motorId === (motorFilter === 'active' ? activeId : motorFilter)));
  const motorName = (id: string) => motors.find((m) => m.id === id)?.name ?? id;

  const form = draft && (
    <form onSubmit={save} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-[12.5px] font-medium">
          Date the work was done
          <input type="date" required className="field h-9 mt-1" value={draft.date} max={today} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <label className="text-[12.5px] font-medium">
          Type of work
          <select className="field h-9 mt-1" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {MAINTENANCE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-medium">
          Done by
          <input className="field h-9 mt-1" value={draft.doneBy} maxLength={60} onChange={(e) => setDraft({ ...draft, doneBy: e.target.value })} />
        </label>
        <label className="text-[12.5px] font-medium">
          Next due (optional)
          <input type="date" className="field h-9 mt-1" value={draft.nextDue} min={draft.date} onChange={(e) => setDraft({ ...draft, nextDue: e.target.value })} />
        </label>
        {motors.length > 1 && (
          <label className="text-[12.5px] font-medium sm:col-span-2">
            Motor
            <select className="field h-9 mt-1" value={draft.motorId} onChange={(e) => setDraft({ ...draft, motorId: e.target.value })}>
              {motors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="block text-[12.5px] font-medium">
        What was done
        <textarea
          className="field mt-1 py-2 h-24"
          value={draft.description}
          maxLength={1000}
          placeholder="e.g. Greased both bearings, checked coupling alignment, tightened base bolts"
          onChange={(e) => {
            setDraft({ ...draft, description: e.target.value });
            setFieldErr(null);
          }}
        />
      </label>
      {fieldErr && <p className="text-[12.5px] text-[#a82626]">{fieldErr}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setEditing(null);
            setDraft(null);
          }}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing === 'new' ? 'Save maintenance record' : 'Save changes'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      {msg && (
        <p role="status" className={`text-[12.5px] rounded-md px-3 py-2 ${msg.ok ? 'bg-[var(--good-soft)] text-[#08700a]' : 'bg-[var(--crit-soft)] text-[#a82626]'}`}>
          {msg.text}
        </p>
      )}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Last maintenance" info={INFO.maintenance}>
          {summary?.last ? (
            <KeyValue
              rows={[
                ['Date', niceDate(summary.last.date)],
                ['Type', summary.last.type],
                ['Days since', Math.round((Date.parse(summary.today) - Date.parse(summary.last.date)) / 86400e3)],
                ['Done by', summary.last.doneBy || '—'],
              ]}
            />
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">No record for the active motor yet.</p>
          )}
        </Card>
        <Card title="Next due">
          {summary?.nextDue ? (
            <div>
              <div className={`text-[22px] font-semibold ${summary.overdue ? 'text-[#a82626]' : ''}`}>{niceDate(summary.nextDue)}</div>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1">
                {summary.overdue
                  ? `Overdue by ${Math.round((Date.parse(summary.today) - Date.parse(summary.nextDue)) / 86400e3)} days.`
                  : `In ${Math.round((Date.parse(summary.nextDue) - Date.parse(summary.today)) / 86400e3)} days.`}
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">No next-due date set. Add one when you record maintenance.</p>
          )}
        </Card>
        <Card title="Motor">
          <p className="text-[13px] font-medium">{config?.activeMotor.name ?? '—'}</p>
          <p className="text-[12.5px] text-[var(--text-2)]">
            {config?.activeMotor.id} · {config?.activeMotor.location || 'location not set'}
          </p>
          <p className="text-[12px] text-[var(--muted)] mt-2">
            After major work (bearing change, re-alignment) capture a new healthy baseline on Board B so the z-scores compare against the repaired motor.
          </p>
        </Card>
      </section>

      <Card
        title={`Maintenance records (${shown.length})`}
        bodyClass="p-0"
        actions={
          <div className="flex items-center gap-2">
            {motors.length > 1 && (
              <select className="field h-8 w-auto text-[12.5px]" value={motorFilter} aria-label="Motor" onChange={(e) => setMotorFilter(e.target.value)}>
                <option value="active">Active motor</option>
                <option value="all">All motors</option>
                {motors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {canEdit && editing === null && (
              <button type="button" className="btn btn-primary" onClick={startNew}>
                <Plus size={14} /> Record maintenance
              </button>
            )}
          </div>
        }
      >
        {editing === 'new' && <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-2)]">{form}</div>}
        {shown.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {shown.map((r) => (
              <li key={r.id} className="px-4 py-3">
                {editing === r.id ? (
                  form
                ) : (
                  <div className="flex gap-3">
                    <Wrench size={16} className="mt-0.5 text-[var(--text-2)] shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-[13px] font-semibold">
                          {niceDate(r.date)} · {r.type}
                        </p>
                        {r.nextDue && <span className="text-[12px] text-[var(--text-2)]">Next due {niceDate(r.nextDue)}</span>}
                      </div>
                      <p className="text-[13px] text-[var(--text)] mt-0.5 whitespace-pre-line">{r.description}</p>
                      <p className="text-[11.5px] text-[var(--muted)] mt-1">
                        {r.doneBy ? `Done by ${r.doneBy} · ` : ''}
                        {motors.length > 1 ? `${motorName(r.motorId)} · ` : ''}
                        Recorded by {r.createdBy} {dateTime(r.createdAt)}
                        {r.updatedAt ? ` · edited by ${r.updatedBy} ${dateTime(r.updatedAt)}` : ''}
                      </p>
                      {canEdit && editing === null && (
                        <div className="mt-2 flex gap-2">
                          {confirmDel === r.id ? (
                            <>
                              <span className="text-[12.5px] self-center">Delete this record?</span>
                              <button type="button" className="btn" onClick={() => setConfirmDel(null)}>
                                Keep record
                              </button>
                              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(r.id)}>
                                Delete record
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn" onClick={() => startEdit(r)}>
                                <Pencil size={13} /> Edit
                              </button>
                              <button type="button" className="btn btn-danger" onClick={() => setConfirmDel(r.id)}>
                                <Trash2 size={13} /> Delete…
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          editing !== 'new' && (
            <div className="px-4">
              <EmptyNote
                title="No maintenance recorded"
                action={
                  canEdit && (
                    <button type="button" className="btn btn-primary" onClick={startNew}>
                      <Plus size={14} /> Record the first maintenance
                    </button>
                  )
                }
              >
                Record the date and what was done each time the motor is serviced. The dates appear on the 7-day and 30-day charts.
              </EmptyNote>
            </div>
          )
        )}
      </Card>
      {!canEdit && <p className="text-[12px] text-[var(--muted)]">Your role can view maintenance records. Engineers and the admin can add or edit them.</p>}
    </div>
  );
}
