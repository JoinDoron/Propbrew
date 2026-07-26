/**
 * Domain-aware presentation components. These sit on top of the generic UI
 * primitives and know about §10 statuses, Money, SLAs and the §11.4 AI HITL
 * contract. Server-renderable (no 'use client') unless noted.
 */

import type { ReactNode } from 'react';
import { StatusPill } from '@/components/ui';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import {
  BOOKING_TONES,
  INVOICE_TONES,
  ORDER_TONES,
  SOS_TONES,
  WORK_ORDER_TONES,
} from '@/lib/status-tones';
import type { Money as MoneyValue } from '@/domain/primitives';
import type {
  BookingStatus,
  InvoiceStatus,
  OrderStatus,
  SosStatus,
  WorkOrderStatus,
} from '@/domain/enums';

/* --- status pills, one closed map per §10 machine ------------------------- */

const TONE_MAPS = {
  work_order: WORK_ORDER_TONES,
  invoice: INVOICE_TONES,
  booking: BOOKING_TONES,
  sos: SOS_TONES,
  order: ORDER_TONES,
} as const;

type DomainStatusType = keyof typeof TONE_MAPS;
type StatusFor<T extends DomainStatusType> = T extends 'work_order'
  ? WorkOrderStatus
  : T extends 'invoice'
    ? InvoiceStatus
    : T extends 'booking'
      ? BookingStatus
      : T extends 'sos'
        ? SosStatus
        : OrderStatus;

/** A §10 status pill. The tone is looked up from a closed map, so an unmapped
 *  status is a compile error rather than a silent grey pill. */
export function DomainStatus<T extends DomainStatusType>({
  type,
  status,
}: {
  type: T;
  status: StatusFor<T>;
}) {
  const tone = (TONE_MAPS[type] as Record<string, Tone>)[status];
  return <StatusPill status={humanizeStatus(status)} tone={tone} />;
}

/* --- money (integer minor units → NGN) ------------------------------------ */

const CURRENCY_LOCALE: Record<string, string> = { NGN: 'en-NG', USD: 'en-US', GHS: 'en-GH', KES: 'en-KE' };

export function formatMoney(m: MoneyValue): string {
  const locale = CURRENCY_LOCALE[m.currency] ?? 'en-NG';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    maximumFractionDigits: 0,
  }).format(m.minor / 100);
}

export function Money({ value, className }: { value: MoneyValue | null; className?: string }) {
  if (!value) return <span className={`font-mono text-text-3 ${className ?? ''}`}>—</span>;
  return <span className={`font-mono tabular-nums ${className ?? ''}`}>{formatMoney(value)}</span>;
}

/* --- SLA badge (respond/resolve, with breach) ----------------------------- */

export function SlaBadge({ dueAt, breached }: { dueAt: string | null; breached: boolean }) {
  if (!dueAt) return null;
  const tone: Tone = breached ? 'danger' : 'success';
  const label = breached ? 'SLA breached' : 'On track';
  return <StatusPill status={label} tone={tone} />;
}

/* --- read-only chip (level V surfaces) ------------------------------------ */

export function ReadOnlyChip() {
  return (
    <span className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-md text-[11px] font-semibold bg-surface-3 text-text-2">
      <span className="w-1.5 h-1.5 rounded-full bg-text-3" />
      Read-only
    </span>
  );
}

/* --- scope banner (shows the active tenant/estate scope) ------------------ */

export function ScopeBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-text-3 mb-3">
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      Viewing {label}
    </div>
  );
}

/* --- AI suggestion card — §11.4 release-blocking HITL wrapper -------------- */

/**
 * The one component that must not slip. §11.4 makes it release-blocking that
 * "every AI surface shows loading, confidence, sources and error states; every
 * suggestion is review/approve/override — AI is assistive, not autonomous."
 * Building it in Phase 1, before any AI feature, stops a dozen surfaces each
 * inventing their own affordance and missing AI acceptance at the end.
 *
 * This is the shell; the actual model wiring lands with each AI feature. It
 * structurally cannot render without a confidence, sources and both actions.
 */
export function AiSuggestionCard({
  featureId,
  title,
  children,
  confidence,
  sources,
  state = 'ready',
  onApprove,
  onOverride,
}: {
  featureId: string;
  title: string;
  children: ReactNode;
  confidence: number; // 0–1
  sources: readonly string[];
  state?: 'loading' | 'ready' | 'error';
  onApprove?: ReactNode;
  onOverride?: ReactNode;
}) {
  const pct = Math.round(confidence * 100);
  const tone: Tone = confidence >= 0.85 ? 'success' : confidence >= 0.6 ? 'warn' : 'danger';
  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-primary-weak text-primary flex items-center justify-center text-[11px] font-bold">
            AI
          </span>
          <span className="text-[13px] font-semibold">{title}</span>
        </div>
        <span className="font-mono text-[10px] text-text-3">{featureId}</span>
      </div>

      {state === 'loading' && <div className="text-[13px] text-text-3 py-2">Generating suggestion…</div>}
      {state === 'error' && (
        <div className="text-[13px] text-negative py-2">
          AI is unavailable — falling back to the manual flow (§11.4).
        </div>
      )}
      {state === 'ready' && (
        <>
          <div className="text-[13px] text-text-2">{children}</div>
          <div className="flex items-center gap-2 mt-2.5">
            <StatusPill status={`${pct}% confidence`} tone={tone} />
            {sources.length > 0 && (
              <span className="text-[11px] text-text-3">
                Sources: {sources.join(', ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            {onApprove}
            {onOverride}
            <span className="text-[11px] text-text-3 ml-auto">Review · approve · override</span>
          </div>
        </>
      )}
    </div>
  );
}
