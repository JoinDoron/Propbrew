import { expect, test } from '@playwright/test';

const workspaces = ['/estate', '/facility', '/shortlet', '/construction'] as const;

test.describe('global workspace sidebar motion', () => {
  for (const path of workspaces) {
    test(`${path} uses the shared active-route trail`, async ({ page }) => {
      await page.goto(path);
      const navigation = page.locator('#application-sidebar nav');
      const rail = navigation.locator('[data-sidebar-motion="true"]');
      await expect(rail).toHaveAttribute('data-visible', 'true');
      await expect(navigation.locator('[data-nav-active="true"]')).toHaveCount(1);

      await expect.poll(async () => rail.evaluate((element) => {
        const dotRect = element.lastElementChild?.getBoundingClientRect();
        const activeRect = element.parentElement?.querySelector<HTMLElement>('[data-nav-active="true"]')?.getBoundingClientRect();
        const markerY = dotRect ? dotRect.top + dotRect.height / 2 : -1;
        const activeY = activeRect ? activeRect.top + activeRect.height / 2 : -1;
        return Math.abs(markerY - activeY);
      })).toBeLessThanOrEqual(5);
    });
  }

  test('respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/estate');
    const transitions = await page.locator('[data-sidebar-motion="true"] span').evaluateAll((nodes) =>
      nodes.map((node) => Number.parseFloat(getComputedStyle(node).transitionDuration)),
    );
    expect(transitions.every((duration) => duration <= 0.001)).toBe(true);
  });

  test('renders one guide with curved submenu strands and reverses when returning to an earlier project', async ({ page }) => {
    await page.goto('/construction/projects/cp-cedar/setup?section=programme');
    const sidebar = page.locator('#application-sidebar');
    const route = sidebar.locator('[data-sidebar-route="true"]');
    await expect(route).toHaveCount(1);
    await expect.poll(async () => route.getAttribute('d')).toMatch(/^M 4 [\d.]+ L 4 [\d.]+$/);
    await expect(sidebar.locator('[data-sidebar-active-dash="true"]')).toHaveCount(1);
    await expect(sidebar.locator('[data-sidebar-strands="true"]:visible')).toHaveCount(2);
    await expect(sidebar.locator('[data-sidebar-strands="true"]:visible').last().locator('path')).toHaveCount(7);
    await expect.poll(async () => sidebar.locator('[data-sidebar-strands="true"]:visible').last().locator('path').first().getAttribute('d')).toContain(' Q ');
    await expect.poll(async () => sidebar.evaluate((element) => {
      const route = element.querySelector<SVGPathElement>('[data-sidebar-route="true"]');
      const nestedBranch = Array.from(element.querySelectorAll<SVGSVGElement>('[data-sidebar-strands="true"]'))
        .filter((strand) => strand.getClientRects().length > 0)
        .at(-1)?.querySelector<SVGPathElement>('path');
      if (!route || !nestedBranch) return Number.POSITIVE_INFINITY;
      return Math.abs(route.getBoundingClientRect().x - nestedBranch.getBoundingClientRect().x);
    })).toBeLessThanOrEqual(1);
    const dash = sidebar.locator('[data-sidebar-active-dash="true"]');
    const setupHeader = sidebar.getByRole('button', { name: 'Project setup & mobilisation' });
    const activeLeaf = sidebar.getByRole('link', { name: 'WBS & programme' });
    await expect.poll(async () => {
      const [dashBox, headerBox] = await Promise.all([dash.boundingBox(), setupHeader.boundingBox()]);
      if (!dashBox || !headerBox) return Number.POSITIVE_INFINITY;
      return Math.abs((dashBox.y + dashBox.height / 2) - (headerBox.y + headerBox.height / 2));
    }).toBeLessThanOrEqual(5);
    await expect.poll(async () => {
      const [dashBox, leafBox] = await Promise.all([dash.boundingBox(), activeLeaf.boundingBox()]);
      if (!dashBox || !leafBox) return 0;
      return Math.abs((dashBox.y + dashBox.height / 2) - (leafBox.y + leafBox.height / 2));
    }).toBeGreaterThan(20);
    await sidebar.getByRole('link', { name: 'Calendar & baselines' }).click();
    await expect(page).toHaveURL(/section=baselines/);
    await expect.poll(async () => {
      const [dashBox, headerBox] = await Promise.all([dash.boundingBox(), setupHeader.boundingBox()]);
      if (!dashBox || !headerBox) return Number.POSITIVE_INFINITY;
      return Math.abs((dashBox.y + dashBox.height / 2) - (headerBox.y + headerBox.height / 2));
    }).toBeLessThanOrEqual(5);

    const marina = sidebar.getByRole('button', { name: 'Marina Heights' });
    await marina.click();
    await marina.locator('..').getByRole('link', { name: 'Project dashboard' }).click();
    await expect(page).toHaveURL(/\/construction\/projects\/cp-marina$/);
    await expect(sidebar.locator('[data-sidebar-motion="true"]')).toHaveAttribute('data-direction', 'forward');

    const cedar = sidebar.getByRole('button', { name: 'Cedar Court' });
    await cedar.click();
    await cedar.locator('..').getByRole('link', { name: 'Project dashboard' }).click();
    await expect(page).toHaveURL(/\/construction\/projects\/cp-cedar$/);
    await expect(sidebar.locator('[data-sidebar-motion="true"]')).toHaveAttribute('data-direction', 'reverse');
  });

  test('keeps the mobile drawer inside 360px with 44px controls', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/shortlet');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('#application-sidebar')).toBeVisible();

    const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth }));
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
    const closeBox = await page.getByRole('button', { name: 'Close navigation menu' }).boundingBox();
    expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
