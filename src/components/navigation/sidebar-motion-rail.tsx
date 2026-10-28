'use client';

import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import styles from './sidebar-motion-rail.module.css';

type RailMetrics = {
  start: number;
  span: number;
  offset: number;
  progress: number;
};

/** Keep the marker maths deterministic and independently testable. */
export function sidebarRailMetrics(first: number, last: number, active: number): RailMetrics {
  const start = Math.min(first, last);
  const span = Math.max(Math.abs(last - first), 1);
  const offset = Math.min(Math.max(active - start, 0), span);
  return { start, span, offset, progress: offset / span };
}

/**
 * Shared active-route trail for every Propbrew workspace rail.
 *
 * The component measures existing, authorised navigation entries. It does not
 * own or reorder the information architecture; it only adds the motion layer.
 */
export function SidebarMotionRail({ activeHref, activeOrder, layoutKey }: { activeHref?: string; activeOrder: number; layoutKey: string }) {
  const railRef = useRef<HTMLSpanElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const previousActiveYRef = useRef<number | null>(null);
  const previousActiveOrderRef = useRef<number | null>(null);
  const lastMotionKeyRef = useRef<string | null>(null);

  const measure = useCallback(() => {
    const rail = railRef.current;
    const container = rail?.parentElement;
    if (!rail || !container) return;

    const entries = Array.from(container.querySelectorAll<HTMLElement>('[data-nav-entry="true"]'))
      .filter((entry) => entry.getClientRects().length > 0);
    const active = container.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (!active || active.getClientRects().length === 0 || entries.length === 0) {
      rail.dataset.visible = 'false';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const centre = (entry: HTMLElement) => {
      const entryRect = entry.getBoundingClientRect();
      return entryRect.top - containerRect.top + entryRect.height / 2;
    };
    const metrics = sidebarRailMetrics(centre(entries[0]), centre(entries.at(-1) ?? entries[0]), centre(active));
    const height = Math.max(container.scrollHeight, containerRect.height, metrics.start + metrics.span + 1);
    const baseX = 4;
    const activeY = centre(active);
    const path = `M ${baseX} ${metrics.start} L ${baseX} ${metrics.start + metrics.span}`;

    const route = routeRef.current;
    route?.setAttribute('d', path);
    rail.style.setProperty('--nav-map-height', `${height}px`);
    rail.style.setProperty('--nav-active-x', '0px');
    rail.style.setProperty('--nav-active-y', `${activeY}px`);
    rail.querySelector('svg')?.setAttribute('viewBox', `0 0 40 ${height}`);
    const motionKey = `${activeHref ?? ''}::${activeOrder}::${layoutKey}`;
    if (route && lastMotionKeyRef.current !== motionKey && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const tokens = getComputedStyle(container);
      const duration = Number.parseFloat(tokens.getPropertyValue('--motion-sidebar-duration')) || 320;
      const easing = tokens.getPropertyValue('--motion-sidebar-ease').trim() || 'ease-out';
      const changedGroup = previousActiveOrderRef.current !== null && previousActiveOrderRef.current !== activeOrder;
      const reverse = changedGroup
        ? activeOrder < (previousActiveOrderRef.current ?? activeOrder)
        : previousActiveYRef.current !== null && activeY < previousActiveYRef.current;
      rail.dataset.direction = reverse ? 'reverse' : 'forward';
      route.animate(
        [
          { opacity: 0.4, transform: `translate3d(0, ${reverse ? '6px' : '-6px'}, 0) scaleY(.985)` },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scaleY(1)' },
        ],
        { duration, easing },
      );
    }
    previousActiveYRef.current = activeY;
    previousActiveOrderRef.current = activeOrder;
    lastMotionKeyRef.current = motionKey;
    rail.dataset.visible = 'true';
  }, [activeHref, activeOrder, layoutKey]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const container = rail?.parentElement;
    if (!container) return;

    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const active = container.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (active) observer.observe(active);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeHref, activeOrder, layoutKey, measure]);

  return (
    <span ref={railRef} className={styles.rail} data-visible="false" data-sidebar-motion="true" aria-hidden="true">
      <svg className={styles.map} preserveAspectRatio="none" focusable="false">
        <path ref={routeRef} className={styles.route} data-sidebar-route="true" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.dot} data-sidebar-active-dash="true" />
    </span>
  );
}

export type SidebarSubmenuState = 'idle' | 'hover' | 'pressed' | 'active' | 'loading' | 'done';

/** Curved child strands, additive to the single global route. */
export function SidebarSubmenuStrands({ count, activeIndex, depth = 1, state = 'idle' }: { count: number; activeIndex: number; depth?: 1 | 2; state?: SidebarSubmenuState }) {
  if (count < 1) return null;
  const row = 47;
  const firstCentre = 22;
  const height = Math.max(44, firstCentre + (count - 1) * row + 22);

  return (
    <svg className={styles.strands} viewBox={`0 0 ${depth === 2 ? 64 : 40} ${height}`} preserveAspectRatio="none" data-sidebar-strands="true" data-depth={depth} data-state={state} aria-hidden="true" focusable="false">
      {Array.from({ length: count }, (_, index) => {
        const centre = firstCentre + index * row;
        return (
          <path
            key={index}
            className={`${styles.strand} ${index === activeIndex ? styles.strandActive : ''}`}
            d={`M 4 ${Math.max(0, centre - 7)} Q 4 ${centre}, 11 ${centre} H ${depth === 2 ? 62 : 38}`}
            pathLength="1"
            vectorEffect="non-scaling-stroke"
            style={{ '--strand-index': index } as CSSProperties}
          />
        );
      })}
    </svg>
  );
}
