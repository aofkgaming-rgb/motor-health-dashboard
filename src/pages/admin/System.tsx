import React, { useCallback, useEffect, useState } from 'react';
import { Download, FlaskConical, Upload } from 'lucide-react';
import type { AuthUser } from '../../types';
import { Card, KeyValue } from '../../components/ui';
import { api, download } from '../../lib/useLive';
import { Banner, Field, Msg, toNum, useAdminSettings } from './common';

interface Stats {
  liveRows: number;
  histRows: number;
  longRows: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  diskBytes: number;
}

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

export function AdminSystem({ token }: { token: string; user: AuthUser }) {
  const { settings: s, msg, setMsg, busy, save } = useAdminSettings(token);
  const [sys, setSys] = useState<any>(null);
  const [storage, setStorage] = useState<{ totalBytes: number; device: Stats; demo: Stats; renderFree: boolean; dataDir: string } | null>(null);
  const [confirm, setConfirm] = useState<null | 'device' | 'demo' | 'backfill' | 'restore'>(null);
  const [work, setWork] = useState(false);
  const [restoreFile, setRestoreFile] = useState<any>(null);
  const [days, setDays] = useState(30);

  const loadStorage = useCallback(() => api(token, '/api/admin/storage').then(setStorage).catch(() => {}), [token]);
  useEffect(() => {
    loadStorage();
  }, [loadStorage]);
  useEffect(() => {
    if (s)
      setSys({
        plantName: s.site.plantName,
        station: s.site.station,
        retentionDays: s.retentionDays,
        tzOffsetMin: s.tzOffsetMin,
        sessionHours: s.sessionHours,
        staleAfterS: s.staleAfterS,
        offlineAfterS: s.offlineAfterS,
        showAccountsOnLogin: s.showAccountsOnLogin,
      });
  }, [s]);

  const act = async (fn: () => Promise<any>, ok: (d: any) => string) => {
    setWork(true);
    setMsg(null);
    try {
      const d = await fn();
      setMsg({ ok: true, text: ok(d) });
      setConfirm(null);
      loadStorage();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setWork(false);
    }
  };

  const importSd = async (f: File) => {
    await act(async () => {
      const text = await f.text();
      const r = await fetch('/api/admin/import', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' }, body: text });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Import failed (${r.status}).`);
      return d;
    }, (d) => `${f.name}: ${d.added} rows added, ${d.skipped} already present${d.bad ? `, ${d.bad} lines could not be read` : ''}. Days with data: ${d.daysAfter}.`);
  };

  if (!s || !sys) return <p className="text-[13px] text-[var(--text-2)]">Loading settings…</p>;

  return (
    <div className="space-y-4">
      <Banner msg={msg} />

      <Card title="Site and system settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Field label="Plant / organisation" value={sys.plantName} onChange={(v) => setSys({ ...sys, plantName: v })} />
          <Field label="Station name" value={sys.station} onChange={(v) => setSys({ ...sys, station: v })} hint="Shown in the sidebar" />
          <Field label="Keep data for (days)" type="number" value={sys.retentionDays} onChange={(v) => setSys({ ...sys, retentionDays: v })} hint="1–120; older data is deleted" />
          <Field label="Time zone offset (minutes)" type="number" value={sys.tzOffsetMin} onChange={(v) => setSys({ ...sys, tzOffsetMin: v })} hint="India = 330. Used to cut data into days" />
          <Field label="Stay signed in for (hours)" type="number" value={sys.sessionHours} onChange={(v) => setSys({ ...sys, sessionHours: v })} />
          <Field label="Stale after (s)" type="number" value={sys.staleAfterS} onChange={(v) => setSys({ ...sys, staleAfterS: v })} />
          <Field label="Offline after (s)" type="number" value={sys.offlineAfterS} onChange={(v) => setSys({ ...sys, offlineAfterS: v })} />
          <label className="flex items-center gap-2 text-[12.5px] font-medium self-end pb-2 cursor-pointer">
            <input type="checkbox" checked={sys.showAccountsOnLogin} onChange={(e) => setSys({ ...sys, showAccountsOnLogin: e.target.checked })} />
            List accounts on the sign-in page
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary mt-3"
          disabled={busy}
          onClick={() =>
            save(
              'PUT',
              '/api/admin/system',
              {
                site: { plantName: sys.plantName, station: sys.station },
                retentionDays: toNum(sys.retentionDays),
                tzOffsetMin: toNum(sys.tzOffsetMin),
                sessionHours: toNum(sys.sessionHours),
                staleAfterS: toNum(sys.staleAfterS),
                offlineAfterS: toNum(sys.offlineAfterS),
                showAccountsOnLogin: sys.showAccountsOnLogin,
              },
              'System settings saved.',
            )
          }
        >
          Save system settings
        </button>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Stored data">
          {storage ? (
            <>
              <KeyValue
                rows={[
                  ['Device data', storage.device.days ? `${storage.device.days} days (${storage.device.firstDay} → ${storage.device.lastDay}) · ${mb(storage.device.diskBytes)}` : 'None'],
                  ['Demo data', storage.demo.days ? `${storage.demo.days} days (${storage.demo.firstDay} → ${storage.demo.lastDay}) · ${mb(storage.demo.diskBytes)}` : 'None'],
                  ['Total on server disk', mb(storage.totalBytes)],
                ]}
              />
              {storage.renderFree && (
                <p className="text-[12px] rounded-md px-3 py-2 mt-3 bg-[var(--warn-soft)] text-[var(--warn-ink)]">
                  This server has no persistent disk (Render free plan). Stored data, settings and users are lost on every redeploy or restart. Download a
                  backup after changes, and import SD-card files to refill history.
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-[var(--text-2)]">Loading…</p>
          )}
        </Card>

        <Card title="Backup and restore">
          <p className="text-[13px] text-[var(--text-2)]">
            The backup holds settings, motors, parameters, permissions, maintenance records and user accounts (password hashes, not passwords). Keep the file
            private.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn btn-primary" onClick={() => download(token, '/api/admin/backup', 'MHM_backup.json').catch((e) => setMsg({ ok: false, text: e.message }))}>
              <Download size={14} /> Download backup
            </button>
            <label className="btn cursor-pointer">
              <Upload size={14} /> Choose backup to restore…
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const j = JSON.parse(await f.text());
                    if (j.kind !== 'mhm-backup') throw new Error();
                    setRestoreFile({ name: f.name, data: j });
                    setConfirm('restore');
                  } catch {
                    setMsg({ ok: false, text: `${f.name} is not an MHM backup file.` });
                  }
                }}
              />
            </label>
          </div>
          {confirm === 'restore' && restoreFile && (
            <div className="mt-3 space-y-2">
              <p className="text-[12.5px]">
                Replace all settings, users and maintenance records with <strong>{restoreFile.name}</strong> (made {restoreFile.data.createdAt?.slice(0, 16).replace('T', ' ')})?
                Everyone else is signed out. Telemetry history is not changed.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => setConfirm(null)}>
                  Keep current settings
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={work}
                  onClick={() => act(() => api(token, '/api/admin/restore', { method: 'POST', body: JSON.stringify(restoreFile.data) }), () => 'Backup restored. Reload the page to see every change.')}
                >
                  Restore {restoreFile.name}
                </button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Import an SD-card file">
          <p className="text-[13px] text-[var(--text-2)]">
            Board B writes one CSV per day to its SD card, with the same columns as the export. Importing a file fills the server history for those days,
            for example after a Wi-Fi outage or a server restart. Rows already present are skipped.
          </p>
          <label className="btn btn-primary mt-3 cursor-pointer w-fit">
            <Upload size={14} /> {work ? 'Importing…' : 'Choose SD-card CSV…'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={work}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) importSd(f);
              }}
            />
          </label>
        </Card>

        <Card title="Demo history" actions={<FlaskConical size={16} className="text-[var(--muted)]" aria-hidden />}>
          <p className="text-[13px] text-[var(--text-2)]">
            Generate simulated history (one row per minute) so the 7-day and 30-day charts and exports can be shown before the hardware runs. It replaces the
            current demo history and is labelled DEMO everywhere.
          </p>
          {confirm === 'backfill' ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Days" type="number" value={days} min={1} max={60} onChange={(v) => setDays(Number(v))} className="w-24" />
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={work}
                onClick={() => act(() => api(token, '/api/admin/demo/backfill', { method: 'POST', body: JSON.stringify({ days }) }), (d) => `Generated ${d.days} days of demo history (${d.rows.toLocaleString()} rows).`)}
              >
                {work ? 'Generating…' : `Generate ${days} days of demo history`}
              </button>
            </div>
          ) : (
            <button type="button" className="btn mt-3" onClick={() => setConfirm('backfill')}>
              Generate demo history…
            </button>
          )}
        </Card>
      </section>

      <Card title="Clear server history">
        <p className="text-[13px] text-[var(--text-2)]">Removes stored rows from the server, for example before a fresh test run. Export first if you need them. The SD card is not affected.</p>
        {confirm === 'device' || confirm === 'demo' ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px]">
              Delete all <strong>{confirm}</strong> history on the server? This cannot be undone.
            </span>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              Keep data
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={work}
              onClick={() => act(() => api(token, `/api/admin/buffer?source=${confirm}`, { method: 'DELETE' }), () => `Cleared ${confirm} history.`)}
            >
              Clear {confirm} history
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('device')}>
              Clear device history…
            </button>
            <button type="button" className="btn" onClick={() => setConfirm('demo')}>
              Clear demo history…
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
