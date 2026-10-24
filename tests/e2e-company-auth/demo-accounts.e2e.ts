import { expect, test, type Page } from '@playwright/test';

const workspaces = [
  { module: 'estate', name: 'Estate', entry: '/sign-up' },
  { module: 'facility', name: 'Facility', entry: '/login' },
  { module: 'shortlet', name: 'Shortlet', entry: '/sign-up' },
  { module: 'construction', name: 'Construction', entry: '/login' },
] as const;

async function assertDemoChoices(page: Page) {
  await expect(page.getByRole('heading', { name: 'Explore a demo', exact: true })).toBeVisible();
  const chooser = page.getByRole('form', { name: 'Demo workspaces', exact: true });
  await expect(chooser).toBeVisible();
  for (const workspace of workspaces) await expect(chooser.getByRole('button', { name: `Explore ${workspace.name} demo`, exact: true })).toBeVisible();
  await expect(page.getByText('Step into a workspace with sample data. No sign-up required.', { exact: true })).toBeVisible();
}

for (const workspace of workspaces) {
  test(`public ${workspace.name} demo opens populated sample records with view-only access and exits cleanly`, async ({ page }) => {
    await page.goto(workspace.entry);
    await assertDemoChoices(page);
    await page.getByRole('button', { name: `Explore ${workspace.name} demo`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${workspace.module}$`));
    await expect(page.getByRole('navigation', { name: `${workspace.name} navigation`, exact: true })).toBeVisible();
    const notice = page.getByRole('complementary', { name: 'Demo account notice', exact: true });
    await expect(notice).toContainText('Sample data');
    await expect(notice).toContainText('View only');

    if (workspace.module === 'estate') {
      await page.getByRole('button', { name: 'Notifications', exact: true }).click();
      await expect(page.getByText('You’re all caught up.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark all read', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Notifications', exact: true }).click();
      await page.getByRole('button', { name: 'Messages', exact: true }).click();
      await expect(page.getByText('No conversations yet.', { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Messages', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add property', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add tenant', exact: true })).toHaveCount(0);
      await page.goto('/properties');
      await expect(page.getByRole('table', { name: 'Property list', exact: true })).toContainText('Lekki Gardens Estate');
    } else if (workspace.module === 'facility') {
      await expect(page.getByRole('heading', { name: 'Diesel tank — Block C', exact: true })).toBeVisible();
      await page.getByRole('tab', { name: /^Alarms(?: \d+)?$/ }).click();
      await expect(page.getByText('Coolant temperature high — sustained overheating', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create work order', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toHaveCount(0);
    } else if (workspace.module === 'shortlet') {
      await page.getByRole('tab', { name: 'Availability', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Next seven nights apartment occupancy calendar', exact: true })).toContainText('Marina Suites');
      await page.goto('/shortlet/bookings');
      await expect(page.getByText('SL-4200 · Unit 1A · Marina Suites', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New booking', exact: true })).toBeDisabled();
    } else {
      await page.goto('/construction/projects');
      await expect(page.getByRole('heading', { name: 'Marina Heights', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
    }

    await notice.getByRole('button', { name: 'Exit demo', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await assertDemoChoices(page);
    await page.goto(`/${workspace.module}`);
    await expect(page).toHaveURL(/\/login$/);
  });
}
