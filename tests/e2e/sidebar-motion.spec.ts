import { expect, test } from '@playwright/test';

const workspaces = ['/estate', '/facility', '/shortlet', '/construction'] as const;

test.describe('original global workspace rail', () => {
  for (const path of workspaces) {
    test(`${path} uses one straight guide and one active row`, async ({ page }) => {
      await page.goto(path);
      const navigation = page.locator('#application-sidebar nav');
      const guide = navigation.locator('[data-sidebar-guide="true"]');

      await expect(guide).toHaveCount(1);
      await expect(guide).toBeVisible();
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(navigation.locator('[data-sidebar-motion], [data-sidebar-strands], [data-sidebar-active-dash]')).toHaveCount(0);

      const guideStyle = await guide.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: Number.parseFloat(style.width), background: style.backgroundColor };
      });
      expect(guideStyle.width).toBeLessThanOrEqual(1.5);
      expect(guideStyle.background).not.toBe('rgba(0, 0, 0, 0)');
    });
  }

  test('keeps the same single guide through nested project navigation', async ({ page }) => {
    await page.goto('/construction/projects/cp-cedar/setup?section=programme');
    const sidebar = page.locator('#application-sidebar');
    const guide = sidebar.locator('[data-sidebar-guide="true"]');

    await expect(guide).toHaveCount(1);
    await expect(sidebar.locator('[data-sidebar-motion], [data-sidebar-strands], [data-sidebar-active-dash]')).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'WBS & programme' })).toHaveAttribute('aria-current', 'page');
    const firstX = (await guide.boundingBox())?.x;

    await sidebar.getByRole('link', { name: 'Calendar & baselines' }).click();
    await expect(page).toHaveURL(/section=baselines/);
    await expect(sidebar.getByRole('link', { name: 'Calendar & baselines' })).toHaveAttribute('aria-current', 'page');
    await expect(guide).toHaveCount(1);
    const secondX = (await guide.boundingBox())?.x;
    expect(Math.abs((firstX ?? 0) - (secondX ?? 0))).toBeLessThanOrEqual(1);
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
