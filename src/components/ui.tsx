import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Info, MinusCircle, X } from 'lucide-react';
import type { Severity } from '../shared/contract';
import type { InfoContent } from '../content/info';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export const Card: React.FC<{
  title?: React.ReactNode;
  info?: InfoContent;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}> = ({ title, info, actions, children, className = '', bodyClass = 'p-4' }) => {
  return (
    <section className={`card flex flex-col min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h2 className="card-title">
            {title}
            {info && <InfoButton content={info} />}
          </h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`flex-1 min-w-0 ${bodyClass}`}>{children}</div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Information popover (ⓘ)
// ---------------------------------------------------------------------------
export function InfoButton({ content, label }: { content: InfoContent; label?: string }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setAlignRight(r.left > window.innerWidth - 360);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    pop.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={btn}
        type="button"
        aria-label={`About ${label || content.title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((o) => !o);
          setMore(false);
        }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
      >
        <Info size={14} strokeWidth={2} />
      </button>
      {open && (
        <div
          ref={pop}
          id={id}
          role="dialog"
          aria-label={content.title}
          tabIndex={-1}
          className={`absolute z-50 top-6 ${alignRight ? 'right-0' : 'left-0'} w-[min(340px,calc(100vw-2rem))] card p-0 text-left font-normal normal-case tracking-normal shadow-[0_8px_24px_rgba(15,23,42,0.07)] outline-none`}
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">{content.title}</h3>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <div className="px-4 pb-3 pt-1 space-y-2 text-[12.5px] leading-relaxed text-[var(--text-2)] max-h-[60vh] overflow-y-auto">
            <p>{content.what}</p>
            <p>
              <span className="font-semibold text-[var(--text)]">Why we monitor it. </span>
              {content.why}
            </p>
            {content.how && (
              <p>
                <span className="font-semibold text-[var(--text)]">How it is calculated. </span>
                {content.how}
              </p>
            )}
            {more &&
              content.details.map((d) => (
                <p key={d.label}>
                  <span className="font-semibold text-[var(--text)]">{d.label}. </span>
                  {d.text}
                </p>
              ))}
            {content.details.length > 0 && (
              <button
                type="button"
                onClick={() => setMore((m) => !m)}
                className="text-[12px] font-medium text-[var(--accent-ink)] hover:underline cursor-pointer"
              >
                {more ? 'Show less' : 'Show details and limitations'}
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

/** The same content, laid out inline (used on detail pages). */
export function InfoBlock({ content }: { content: InfoContent }) {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[var(--text-2)]">
      <p>{content.what}</p>
      <dl className="grid gap-3">
        <div>
          <dt className="eyebrow mb-0.5">Why we monitor it</dt>
          <dd>{content.why}</dd>
        </div>
        {content.how && (
          <div>
            <dt className="eyebrow mb-0.5">How it is calculated</dt>
            <dd>{content.how}</dd>
          </div>
        )}
        {content.details.map((d) => (
          <div key={d.label}>
            <dt className="eyebrow mb-0.5">{d.label}</dt>
            <dd>{d.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
const SEV: Record<Severity, { label: string; color: string; soft: string; ink: string; Icon: any }> = {
  normal: { label: 'Normal', color: 'var(--good)', soft: 'var(--good-soft)', ink: '#08700a', Icon: CheckCircle2 },
  warning: { label: 'Warning', color: 'var(--warn)', soft: 'var(--warn-soft)', ink: 'var(--warn-ink)', Icon: AlertTriangle },
  critical: { label: 'Critical', color: 'var(--crit)', soft: 'var(--crit-soft)', ink: '#a82626', Icon: AlertOctagon },
  uncalibrated: { label: 'Not calibrated', color: 'var(--none)', soft: 'var(--none-soft)', ink: 'var(--text-2)', Icon: CircleDashed },
  unavailable: { label: 'No baseline value', color: 'var(--none)', soft: 'var(--none-soft)', ink: 'var(--text-2)', Icon: MinusCircle },
};

export function SeverityBadge({ severity, size = 'sm' }: { severity: Severity; size?: 'sm' | 'md' }) {
  const s = SEV[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[5px] font-medium whitespace-nowrap ${
        size === 'md' ? 'text-[13px] px-2 py-1' : 'text-[11.5px] px-1.5 py-0.5'
      }`}
      style={{ background: s.soft, color: s.ink }}
    >
      <s.Icon size={size === 'md' ? 15 : 13} style={{ color: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

export function severityColor(sev: Severity) {
  return SEV[sev].color;
}

export function EmptyNote({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-6 px-1">
      <p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>
      {children && <p className="text-[13px] text-[var(--text-2)] max-w-prose">{children}</p>}
      {action}
    </div>
  );
}

export function KeyValue({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-[var(--border)] text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-[var(--text-2)]">{k}</dt>
          <dd className="text-right font-medium text-[var(--text)] num break-words min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
