'use client';

/**
 * Vesta UI primitives.
 *
 * The repeating patterns of the design system:
 * cards, KPI tiles, status pills, filter chips, buttons, tabs and tables.
 * Everything resolves through the design tokens in globals.css, so all of it
 * themes automatically.
 */

import type { ButtonHTMLAttributes, ReactNode, ThHTMLAttributes } from 'react';

export type LoadStatus =
  | 'Draft'
  | 'Posted'
  | 'Booked'
  | 'In Transit'
  | 'Delivered'
  | 'Closed';

/** The template's status colour scale. */
export const STATUS_COLORS: Record<LoadStatus, string> = {
  Draft: '#8b93a1',
  Posted: '#3b82f6',
  Booked: '#8b5cf6',
  'In Transit': '#f59e0b',
  Delivered: '#10b981',
  Closed: '#6b7280',
};

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
        'bg-surface border border-border rounded-[16px] shadow-card',
        padded && 'p-4 sm:p-[18px]',
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
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12.5px] text-text-3 mt-0.5">{subtitle}</p>
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
    <div className="bg-surface border border-border rounded-[16px] p-4 sm:px-[18px] shadow-card transition-transform duration-150 hover:-translate-y-px">
      {icon && (
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: iconBg ?? 'var(--primary-weak)',
            color: iconColor ?? 'var(--primary)',
          }}
        >
          {icon}
        </span>
      )}
      <div className="text-[13px] text-text-2 font-medium mt-3.5">{label}</div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="text-[26px] font-bold tracking-[-0.02em] leading-none">
          {value}
        </span>
        {delta && (
          <span
            className="text-[11.5px] font-semibold px-1.5 py-1 rounded-md whitespace-nowrap"
            style={{
              color: positive ? 'var(--color-positive)' : 'var(--color-negative)',
              background: positive
                ? 'rgba(16,185,129,.12)'
                : 'rgba(239,68,68,.12)',
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

export function StatusPill({ status }: { status: LoadStatus | string }) {
  const color = STATUS_COLORS[status as LoadStatus] ?? '#8b93a1';
  return (
    <span
      className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[11.5px] font-semibold whitespace-nowrap"
      style={{ color, background: hexA(color, 0.13) }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-none"
        style={{ background: color }}
      />
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
  const base =
    'inline-flex items-center justify-center gap-2 h-[38px] px-4 rounded-[11px] text-sm font-medium cursor-pointer transition-[filter,background,border-color,transform] duration-150 hover:brightness-[1.03] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-primary text-on-primary border border-transparent',
    secondary: 'bg-surface text-text border border-border-2 hover:bg-surface-2',
    ghost: 'bg-transparent text-text-2 border border-transparent hover:bg-surface-2',
  } as const;

  return (
    <button className={cx(base, variants[variant], className)} {...rest}>
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
        'w-[38px] h-[38px] flex-none rounded-[10px] flex items-center justify-center text-text-2 cursor-pointer transition-colors duration-150 hover:bg-surface-2 hover:text-text relative',
        bordered ? 'border border-border bg-surface' : 'border-none bg-transparent',
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
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 h-[38px] px-4 rounded-[11px] text-sm cursor-pointer transition-colors duration-150',
        active
          ? 'border-[1.5px] border-primary bg-primary-weak text-primary font-semibold'
          : 'border border-border-2 bg-surface text-text font-medium hover:bg-surface-2',
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

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
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
      className={cx(
        'text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-3 py-2.5 border-b border-border whitespace-nowrap',
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
    <td className={cx('px-3 py-3 border-b border-border align-middle', className)}>
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

/** Circular initials avatar with the template's warm gradient. */
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
      className="rounded-full flex-none flex items-center justify-center text-white font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: 'linear-gradient(135deg,#ffb27a,#ff7ac2)',
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
      <p className="font-semibold text-[15px]">{title}</p>
      {description && (
        <p className="text-[13px] text-text-3 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
