import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sidebarRailMetrics } from '@/components/navigation/sidebar-motion-rail';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('global sidebar motion system', () => {
  it('maps an active route onto the authorised visible navigation range', () => {
    expect(sidebarRailMetrics(22, 222, 122)).toEqual({ start: 22, span: 200, offset: 100, progress: 0.5 });
    expect(sidebarRailMetrics(22, 222, -10).progress).toBe(0);
    expect(sidebarRailMetrics(22, 222, 500).progress).toBe(1);
  });

  it('is mounted once in the shared AppShell without owning navigation content', () => {
    const shell = read('src/components/app-shell.tsx');
    expect(shell.match(/<SidebarMotionRail\b/g)).toHaveLength(1);
    expect(shell).not.toContain('SidebarBranch');
    expect(shell).toContain('data-nav-branch="true"');
    expect(shell).toContain('<SidebarSubmenuStrands');
    expect(shell).toContain('data-nav-entry="true"');
    expect(shell).toContain("data-nav-active={active ? 'true' : undefined}");
    expect(shell.indexOf('<SidebarMotionRail')).toBeLessThan(shell.indexOf('groups.map'));
  });

  it('uses shared measured tokens and transform/opacity/filter-only motion', () => {
    const globals = read('src/app/globals.css');
    const railCss = read('src/components/navigation/sidebar-motion-rail.module.css');
    const shellCss = read('src/components/app-shell.module.css');
    expect(globals).toContain('--motion-sidebar-duration: 320ms');
    expect(globals).toContain('--motion-sidebar-ease: cubic-bezier(0.22, 1, 0.36, 1)');
    for (const css of [railCss, shellCss]) {
      const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map((match) => match[1]);
      for (const transition of transitions.filter((value) => value.includes('motion-sidebar'))) {
        expect(transition).not.toMatch(/(?:width|height|top|left|margin|padding|grid)/);
      }
    }
    expect(railCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(shellCss).toContain('@keyframes sidebar-items-reveal');
    expect(railCss).toContain('.route');
    expect(railCss).toContain('.map');
    const source = read('src/components/navigation/sidebar-motion-rail.tsx');
    expect(source.match(/data-sidebar-route="true"/g)).toHaveLength(1);
    expect(source.match(/data-sidebar-active-dash="true"/g)).toHaveLength(1);
    expect(source).toContain('data-sidebar-strands="true"');
    expect(source).not.toContain('strandTrunk');
    expect(source).toContain(' Q 4 ${centre}, 11 ${centre} H');
    expect(source).toContain("'idle' | 'hover' | 'pressed' | 'active' | 'loading' | 'done'");
    expect(source).toContain("rail.dataset.direction = reverse ? 'reverse' : 'forward'");
    expect(source).toContain("reverse ? '6px' : '-6px'");
    expect(source).toContain('previousActiveOrderRef.current !== activeOrder');
    expect(source).toContain('lastMotionKeyRef.current !== motionKey');
    expect(railCss).toContain('@keyframes sidebar-strand-draw');
    expect(railCss).toContain('stroke: color-mix(in srgb, var(--text) 12%, var(--border))');
    expect(railCss).not.toContain('stroke-dashoffset');
    expect(globals).toContain('--motion-sidebar-submenu-duration: 560ms');
    expect(globals).toContain('--motion-sidebar-strand-duration: 300ms');
    expect(globals).toContain('--motion-sidebar-stagger: 40ms');
  });

  it('keeps navigation and collapse controls at least 44px tall', () => {
    const css = read('src/components/app-shell.module.css');
    expect(css).toMatch(/\.collapseButton\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
    expect(css).toMatch(/\.groupToggle\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.navLink\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.nestedLink\s*\{[^}]*min-height:\s*44px\s*!important/);
    expect(css).toMatch(/\.mobileClose\s*\{[^}]*width:\s*44px\s*!important[^}]*height:\s*44px\s*!important/);
  });
});
