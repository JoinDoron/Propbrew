import { expect, type Locator } from '@playwright/test';

/** Wait for the shell's client portal, then retry only a reversible dialog opener.
 * Save, confirm and transition submissions must remain single attempts. */
export async function openDialog(trigger: Locator, dialog: Locator): Promise<void> {
  const headerTabs = trigger.page().locator('[data-page-tabs-outlet="true"] [data-header-page-tabs="true"][role="tablist"]').first();
  await expect(headerTabs).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    if (await dialog.isVisible()) return;
    await trigger.click({ timeout: 3_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1000] });
}
