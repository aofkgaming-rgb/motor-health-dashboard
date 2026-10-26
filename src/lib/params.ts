/**
 * Parameter descriptions as shown in the dashboard: the built-in text in content/info.ts,
 * with any label, unit, decimals, limits or description the admin has changed.
 */
import { useEffect, useState } from 'react';
import type { PublicConfig, TelemetryRow } from '../types';
import type { FeatureKey } from '../shared/contract';
import type { CustomParam, Limits, MetricKey } from '../shared/settings';
import { DEFAULT_PARAMS } from '../shared/settings';
import { INFO, InfoContent, PARAMS } from '../content/info';

export interface ParamView {
  key: string; // FeatureKey, 'rpm', 'temp_c', 'current' or a custom key
  name: string;
  unit: string;
  decimals: number;
  info: InfoContent;
  limits: Limits;
  custom: boolean;
  feature: boolean; // one of the six health features (has a z-score)
  get: (r: TelemetryRow) => number | null;
}

function withOverride(base: InfoContent, title: string, what: string, why: string): InfoContent {
  return { ...base, title, what: what || base.what, why: why || base.why };
}

const BUILTIN_INFO: Record<MetricKey, InfoContent> = {
  ...(Object.fromEntries(PARAMS.map((p) => [p.key, p.info])) as Record<FeatureKey, InfoContent>),
  rpm: INFO.rpm,
  temp_c: INFO.temp_c,
  current: INFO.current,
};

export function maxCurrent(r: TelemetryRow): number | null {
  const v = [r.i_l1_a, r.i_l2_a, r.i_l3_a].filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}

export function metricView(key: MetricKey, cfg: PublicConfig | null): ParamView {
  const s = cfg?.params?.[key] ?? DEFAULT_PARAMS[key];
  return {
    key,
    name: s.label,
    unit: s.unit,
    decimals: s.decimals,
    info: withOverride(BUILTIN_INFO[key], s.label, s.what, s.why),
    limits: s,
    custom: false,
    feature: (PARAMS as { key: string }[]).some((p) => p.key === key),
    get: key === 'current' ? maxCurrent : (r) => r[key as keyof TelemetryRow] as number | null,
  };
}

export function customView(c: CustomParam): ParamView {
  return {
    key: c.key,
    name: c.label,
    unit: c.unit || '—',
    decimals: c.decimals,
    info: {
      title: c.label,
      what: c.what || `Custom parameter added by the admin. Board B sends it in the packet as "${c.key}".`,
      why: 'Added from Administration → Motor & parameters, without a code change.',
      details: [{ label: 'Packet field', text: `"${c.key}": number. It is exported after the 21 standard columns.` }],
    },
    limits: c,
    custom: true,
    feature: false,
    get: (r) => r.extra?.[c.key] ?? null,
  };
}

/** The six health features, in the usual order. */
export function featureViews(cfg: PublicConfig | null): ParamView[] {
  return PARAMS.map((p) => metricView(p.key, cfg));
}

/** Everything that can be charted: six features, speed, temperature, current, then custom ones. */
export function allViews(cfg: PublicConfig | null): ParamView[] {
  return [
    ...featureViews(cfg),
    metricView('rpm', cfg),
    metricView('temp_c', cfg),
    metricView('current', cfg),
    ...(cfg?.customParams ?? []).map(customView),
  ];
}

export function limitLines(l: Limits) {
  const out: { y: number; label: string }[] = [];
  if (l.warnHigh !== null) out.push({ y: l.warnHigh, label: `warning ${l.warnHigh}` });
  if (l.critHigh !== null) out.push({ y: l.critHigh, label: `critical ${l.critHigh}` });
  if (l.warnLow !== null) out.push({ y: l.warnLow, label: `warning ${l.warnLow}` });
  if (l.critLow !== null) out.push({ y: l.critLow, label: `critical ${l.critLow}` });
  return out;
}

/** Settings everyone needs. Reloads whenever the admin saves a change. */
export function useConfig(token: string | null, tick: number) {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => {
    if (!token) return;
    fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCfg(d))
      .catch(() => {});
  }, [token, tick]);
  return cfg;
}

/** Maintenance dates of the active motor, for chart markers. */
export function useMaintenanceMarkers(token: string, tick: number) {
  const [m, setM] = useState<{ date: string; type: string; id: string }[]>([]);
  useEffect(() => {
    fetch('/api/maintenance/markers', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { markers: [] }))
      .then((d) => setM(d.markers || []))
      .catch(() => {});
  }, [token, tick]);
  return m;
}
