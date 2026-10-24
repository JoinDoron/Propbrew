'use client';

/**
 * Propbrew UI primitives — Clinexa-inspired application foundations.
 *
 * The repeating patterns of the design system:
 * cards, KPI tiles, status pills, filter chips, buttons, tabs and tables.
 * Everything resolves through the design tokens in globals.css, so all of it
 * themes automatically.
 */

import type { ButtonHTMLAttributes, ReactNode, ThHTMLAttributes } from 'react';
import { toneVar, type Tone } from '@/lib/status-tones';
import styles from './primitives.module.css';

/** Fade a hex colour to an rgba() string — used for soft status backgrounds. */
export function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        styles.card,
        padded && styles.cardPadded,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className={styles.heading}>
          {title}
        </h3>
        {subtitle && (
          <p className={styles.subtitle}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI tile                                                                    */
/* -------------------------------------------------------------------------- */

export function KpiCard({
  label,
  value,
  delta,
  positive = true,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className={cx(styles.card, styles.kpi)}>
      <div className={styles.kpiHeader}>
      {icon && (
        <span
          className={styles.kpiIcon}
          style={{
            ...(iconBg ? { background: iconBg, borderRadius: 6, padding: 3 } : {}),
            color: iconColor ?? 'var(--primary)',
          }}
        >
          {icon}
        </span>
      )}
        <div className={styles.kpiLabel}>{label}</div>
      </div>
      <div className={styles.kpiBody}>
        <span className={styles.kpiValue}>
          {value}
        </span>
        {delta && (
          <span
            className={styles.kpiDelta}
            style={{
              color: positive ? 'var(--color-positive)' : 'var(--color-negative)',
            }}
          >
            {positive ? '↑' : '↓'} {delta}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status pill                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Status pill. The colour comes from a semantic `tone`, resolved through the
 * theme tokens, so an unmapped domain status is a compile error at the call
 * site (via the closed tone maps in status-tones.ts) rather than a silent grey
 * pill. `status` is the display label; `tone` is required.
 */
export function StatusPill({ status, tone }: { status: string; tone: Tone }) {
  const color = toneVar(tone);
  return (
    <span
      className="inline-flex items-center gap-1.5 min-h-[24px] px-2 rounded-md text-[11.5px] font-medium whitespace-nowrap border border-transparent"
      style={{ color, background: `color-mix(in srgb, ${color} 8%, var(--surface))`, borderColor: `color-mix(in srgb, ${color} 18%, var(--border))` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: color }} />
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  icon,
  children,
  className,
  ...rest
}: ButtonProps) {
  const variants = {
    primary: styles.primary,
    secondary: '',
    ghost: styles.ghost,
  } as const;

  return (
    <button className={cx(styles.button, variants[variant], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  bordered = true,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { bordered?: boolean }) {
  return (
    <button
      className={cx(
        styles.iconButton,
        !bordered && styles.unbordered,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter chip                                                                 */
/* -------------------------------------------------------------------------- */

export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(active)}
      onClick={onClick}
      className={cx(
        styles.filter,
      )}
    >
      {label}
      {count !== undefined && (
        <span className={active ? 'text-primary' : 'text-text-3'}>{count}</span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs (underline style, as used across Fuel / Maintenance / Settings)        */
/* -------------------------------------------------------------------------- */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 border-b border-border overflow-x-auto"
      role="tablist"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative h-[42px] px-3.5 text-[13.5px] whitespace-nowrap cursor-pointer border-b-2 -mb-px transition-colors duration-150',
              isActive
                ? 'text-text font-semibold border-primary'
                : 'text-text-3 font-medium border-transparent hover:text-text-2',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-text-3">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

export function Table({ children, label = 'Data register' }: { children: ReactNode; label?: string }) {
  return (
    <div className="pb-table-frame" role="region" aria-label={label} tabIndex={0}>
      <table className="pb-data-table">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx(
        'text-left text-[12px] font-medium tracking-[-0.02em] text-text-3 bg-surface-2 px-4 py-3 border-b border-border whitespace-nowrap',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cx('px-4 py-3.5 border-b border-border align-middle', className)}>
      {children}
    </td>
  );
}

export function TableRow({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        'transition-colors duration-100',
        onClick && 'cursor-pointer hover:bg-surface-2',
      )}
    >
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

/** Honest initials fallback; user photographs remain dynamic, never stock faces. */
export function Avatar({
  name,
  size = 34,
}: {
  name: string;
  size?: number;
}) {
  const parts = name.trim().split(/\s+/);
  const initials =
    ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </span>
  );
}

/** Monospace treatment for refs, VINs, plates and money. */
export function Mono({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('font-mono tabular-nums', className)}>{children}</span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && (
        <span className="w-12 h-12 rounded-2xl bg-surface-2 text-text-3 flex items-center justify-center mb-3.5">
          {icon}
        </span>
      )}
      <p className="font-medium text-base">{title}</p>
      {description && (
        <p className="text-sm text-text-3 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
