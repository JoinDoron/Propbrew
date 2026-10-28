'use client';

import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Minus,
} from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useId,
} from 'react';
import { StatusPill } from '@/components/ui';
import type { Tone } from '@/lib/status-tones';
import styles from './michael-dashboard-system.module.css';

/** Shared motion values for the reference-inspired dashboard surfaces. */
export const DASHBOARD_MOTION = {
  enterMs: 220,
  hoverMs: 160,
  pressMs: 90,
  stateMs: 180,
  staggerMs: 40,
  easing: 'cubic-bezier(.4, 0, .2, 1)',
} as const;

export type DashboardSystemState = 'loading' | 'ready' | 'empty' | 'error';
export type DashboardTrendDirection = 'up' | 'down' | 'flat';

export type DashboardMetricVisual =
  | {
    type: 'sparkline';
    points: number[];
    label: string;
  }
  | {
    type: 'matrix';
    values: number[];
    label: string;
  };

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  trend?: {
    direction: DashboardTrendDirection;
    label: string;
    tone: Tone;
  };
  visual?: DashboardMetricVisual;
};

export type DashboardActivity = {
  id: string;
  primary: string;
  secondary?: string;
  category: string;
  status: string;
  statusTone: Tone;
  amount?: string;
  timestamp: string;
  href?: string;
  actionLabel?: string;
};

export type MichaelDashboardSystemProps = {
  title: string;
  description?: string;
  state?: DashboardSystemState;
  metrics?: DashboardMetric[];
  activities?: DashboardActivity[];
  activityTitle?: string;
  activityDescription?: string;
  activeMetricId?: string;
  onMetricSelect?: (metric: DashboardMetric) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  onRetry?: () => void;
  leadingAction?: ReactNode;
};

const motionStyle = {
  '--dashboard-enter-duration': `${DASHBOARD_MOTION.enterMs}ms`,
  '--dashboard-hover-duration': `${DASHBOARD_MOTION.hoverMs}ms`,
  '--dashboard-press-duration': `${DASHBOARD_MOTION.pressMs}ms`,
  '--dashboard-state-duration': `${DASHBOARD_MOTION.stateMs}ms`,
  '--dashboard-stagger-duration': `${DASHBOARD_MOTION.staggerMs}ms`,
  '--dashboard-easing': DASHBOARD_MOTION.easing,
} as CSSProperties;

const LOADING_PANEL_COUNT = 2;
const LOADING_ROW_COUNT = 4;

/**
 * Reference-inspired analytical canvas for every Propbrew module. The
 * component owns loading, empty and error states so each module presents the
 * same operational rhythm while supplying its own domain records.
 */
export function MichaelDashboardSystem({
  title,
  description,
  state = 'ready',
  metrics = [],
  activities = [],
  activityTitle = 'Live activity',
  activityDescription = 'Recent changes across this workspace.',
  activeMetricId,
  onMetricSelect,
  emptyTitle = 'No activity yet',
  emptyDescription = 'New activity will appear here as your team starts working.',
  errorTitle = 'This view could not load',
  errorDescription = 'Try again. Your saved records have not been changed.',
  onRetry,
  leadingAction,
}: MichaelDashboardSystemProps) {
  const headingId = useId();

  return (
    <section
      className={styles.system}
      style={motionStyle}
      aria-labelledby={headingId}
      data-dashboard-system="michael"
      data-state={state}
    >
      <header className={styles.header}>
        <div className={styles.headingCopy}>
          <h2 id={headingId} className={styles.heading}>{title}</h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {leadingAction ? <div className={styles.leadingAction}>{leadingAction}</div> : null}
      </header>

      {state === 'loading' ? <DashboardLoadingState /> : null}
      {state === 'empty' ? (
        <DashboardMessageState
          kind="empty"
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : null}
      {state === 'error' ? (
        <DashboardMessageState
          kind="error"
          title={errorTitle}
          description={errorDescription}
          onRetry={onRetry}
        />
      ) : null}
      {state === 'ready' ? (
        <>
          <ul className={styles.metricGrid} aria-label={`${title} highlights`}>
            {metrics.map((metric, index) => (
              <li
                className={styles.metricItem}
                key={metric.id}
                style={{ '--item-index': index } as CSSProperties}
              >
                <MetricPanel
                  metric={metric}
                  active={metric.id === activeMetricId}
                  onSelect={onMetricSelect}
                />
              </li>
            ))}
          </ul>
          <ActivityRegister
            title={activityTitle}
            description={activityDescription}
            activities={activities}
          />
        </>
      ) : null}
    </section>
  );
}

function MetricPanel({
  metric,
  active,
  onSelect,
}: {
  metric: DashboardMetric;
  active: boolean;
  onSelect?: (metric: DashboardMetric) => void;
}) {
  const body = (
    <>
      <span className={styles.metricTopline}>
        <span className={styles.metricLabel}>{metric.label}</span>
        {metric.trend ? (
          <span
            className={styles.trend}
            style={{ color: `var(--tone-${metric.trend.tone})` }}
          >
            <TrendIcon direction={metric.trend.direction} />
            {metric.trend.label}
          </span>
        ) : null}
      </span>
      <span className={styles.metricValue}>{metric.value}</span>
      {metric.detail ? <span className={styles.metricDetail}>{metric.detail}</span> : null}
      {metric.visual ? <MetricVisual visual={metric.visual} /> : null}
    </>
  );

  if (onSelect) {
    return (
      <button
        className={styles.metricPanel}
        type="button"
        aria-pressed={active}
        onClick={() => onSelect(metric)}
      >
        {body}
      </button>
    );
  }

  return <article className={styles.metricPanel}>{body}</article>;
}

function MetricVisual({ visual }: { visual: DashboardMetricVisual }) {
  if (visual.type === 'matrix') {
    const maximum = Math.max(...visual.values, 1);
    return (
      <span className={styles.matrix} role="img" aria-label={visual.label}>
        {visual.values.map((value, index) => (
          <span
            className={styles.matrixCell}
            key={`${value}-${index}`}
            style={{ '--cell-intensity': Math.max(0.14, value / maximum) } as CSSProperties}
          />
        ))}
      </span>
    );
  }

  const points = sparklinePoints(visual.points, 240, 72);
  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 240 72"
      preserveAspectRatio="none"
      role="img"
      aria-label={visual.label}
    >
      <title>{visual.label}</title>
      <polyline points={points} pathLength="1" />
    </svg>
  );
}

function TrendIcon({ direction }: { direction: DashboardTrendDirection }) {
  if (direction === 'up') return <ArrowUp aria-hidden="true" size={14} />;
  if (direction === 'down') return <ArrowDown aria-hidden="true" size={14} />;
  return <Minus aria-hidden="true" size={14} />;
}

function ActivityRegister({
  title,
  description,
  activities,
}: {
  title: string;
  description: string;
  activities: DashboardActivity[];
}) {
  const registerId = useId();

  return (
    <section
      className={styles.register}
      aria-labelledby={registerId}
      style={{ '--item-index': 2 } as CSSProperties}
    >
      <header className={styles.registerHeader}>
        <div>
          <h3 id={registerId} className={styles.registerTitle}>{title}</h3>
          <p className={styles.registerDescription}>{description}</p>
        </div>
        <span className={styles.recordCount}>{activities.length} records</span>
      </header>

      {activities.length === 0 ? (
        <div className={styles.inlineEmpty} role="status">
          <p>No recent activity</p>
          <span>Updates will appear here when records change.</span>
        </div>
      ) : (
        <div className={styles.activityViewport}>
          <div
            className={styles.desktopActivityViewport}
            tabIndex={0}
            aria-label={`${title} register. Scroll to review all columns.`}
          >
            <table className={styles.activityTable}>
            <caption className={styles.visuallyHidden}>{description}</caption>
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Value</th>
                <th scope="col">Updated</th>
                <th scope="col"><span className={styles.visuallyHidden}>Action</span></th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity, index) => (
                <tr key={activity.id} style={{ '--row-index': index } as CSSProperties}>
                  <td>
                    <strong>{activity.primary}</strong>
                    {activity.secondary ? <span>{activity.secondary}</span> : null}
                  </td>
                  <td>{activity.category}</td>
                  <td><StatusPill status={activity.status} tone={activity.statusTone} /></td>
                  <td className={styles.numeric}>{activity.amount ?? '—'}</td>
                  <td>{activity.timestamp}</td>
                  <td className={styles.actionCell}>
                    {activity.href ? (
                      <Link
                        className={styles.rowLink}
                        href={activity.href}
                        aria-label={activity.actionLabel ?? `Open ${activity.primary}`}
                      >
                        <ArrowRight aria-hidden="true" size={16} />
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>

          <ol className={styles.activityCards} aria-label={`${title} records`}>
            {activities.map((activity) => (
              <li className={styles.activityCard} key={activity.id}>
                <div className={styles.cardHeading}>
                  <div>
                    <strong>{activity.primary}</strong>
                    {activity.secondary ? <span>{activity.secondary}</span> : null}
                  </div>
                  <StatusPill status={activity.status} tone={activity.statusTone} />
                </div>
                <dl className={styles.cardFacts}>
                  <div><dt>Category</dt><dd>{activity.category}</dd></div>
                  <div><dt>Value</dt><dd>{activity.amount ?? '—'}</dd></div>
                  <div><dt>Updated</dt><dd>{activity.timestamp}</dd></div>
                </dl>
                {activity.href ? (
                  <Link className={styles.cardLink} href={activity.href}>
                    {activity.actionLabel ?? 'Open record'}
                    <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function DashboardLoadingState() {
  return (
    <div className={styles.loadingState} role="status" aria-live="polite">
      <span className={styles.visuallyHidden}>Loading dashboard</span>
      <div className={styles.loadingMetrics} aria-hidden="true">
        {Array.from({ length: LOADING_PANEL_COUNT }, (_, index) => (
          <div className={styles.loadingPanel} key={index}>
            <span className={styles.skeletonShort} />
            <span className={styles.skeletonValue} />
            <span className={styles.skeletonVisual} />
          </div>
        ))}
      </div>
      <div className={styles.loadingRegister} aria-hidden="true">
        <span className={styles.skeletonShort} />
        {Array.from({ length: LOADING_ROW_COUNT }, (_, index) => (
          <span className={styles.loadingRow} key={index} />
        ))}
      </div>
    </div>
  );
}

function DashboardMessageState({
  kind,
  title,
  description,
  onRetry,
}: {
  kind: 'empty' | 'error';
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={styles.messageState}
      role={kind === 'error' ? 'alert' : 'status'}
      data-kind={kind}
    >
      <span className={styles.messageMark} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {kind === 'error' && onRetry ? (
        <button className={styles.retryButton} type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function sparklinePoints(values: number[], width: number, height: number) {
  if (values.length === 0) return '';
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - minimum) / range) * (height - 8) - 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
