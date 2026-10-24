import { expect, type Locator } from '@playwright/test';

async function waitForClientPortal(control: Locator): Promise<void> {
  const headerTabs = control.page().locator('[data-page-tabs-outlet="true"] [data-header-page-tabs="true"][role="tablist"]').first();
  await expect(headerTabs).toBeVisible({ timeout: 30_000 });
}

/** Wait for the shell's client portal, then retry only a reversible dialog opener.
 * Save, confirm and transition submissions must remain single attempts. */
export async function openDialog(trigger: Locator, dialog: Locator): Promise<void> {
  await waitForClientPortal(trigger);
  await expect(async () => {
    if (await dialog.isVisible()) return;
    await trigger.click({ timeout: 3_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1000] });
}

/** Tab selection is read-only. Confirm both the selected tab and its visible
 * panel so a cold development refresh cannot silently discard the click. */
export async function selectTab(tab: Locator, panel: Locator): Promise<void> {
  await waitForClientPortal(tab);
  await expect(async () => {
    if (await tab.getAttribute('aria-selected') === 'true' && await panel.isVisible()) return;
    await tab.click({ timeout: 3_000 });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1000] });
}
