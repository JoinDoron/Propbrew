import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { openDialog } from './dialog';

const passphrase = 'Disposable onboarding browser passphrase 2026!';

async function continueSetup(page: Page, heading: string) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

test('company owner resumes setup and creates one operational property with units isolated from another company', async ({ page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const email = `onboarding-${suffix}@example.test`;
  const company = `Onboarding company ${suffix}`;
  const secondCompany = `Separate company ${suffix}`;
  const property = `Onboarding Court ${suffix}`;
  await page.goto('/sign-up');
  await page.getByLabel('Your full name', { exact: true }).fill('Disposable Lagos Owner');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Company name', { exact: true }).fill(company);
  await page.getByLabel('Password', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Create account & company', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'What kind of portfolio are you managing?', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: /^Individual landlord/ }).check();
  await continueSetup(page, 'How many properties do you manage?');
  await page.getByRole('radio', { name: /^1 property/ }).check();
  await continueSetup(page, 'How many tenants do you look after?');
  await page.getByRole('radio', { name: /^No tenants yet/ }).check();
  await continueSetup(page, 'How do tenants usually pay rent?');

  // A new session must resume the same company's committed answers.
  await page.goto('/companies');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/companies$/);
  await page.getByRole('button', { name: 'Open company', exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.getByRole('link', { name: 'Resume portfolio setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How do tenants usually pay rent?', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saved progress restored.');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'How do tenants usually pay rent?', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /^Bank transfer/ }).check();
  await page.getByRole('checkbox', { name: /^Cash or manual records/ }).check();
  await page.getByRole('radio', { name: /^Calls, messages, and paper/ }).check();
  await continueSetup(page, 'What would you most like to simplify?');
  await page.getByRole('radio', { name: /^Repairs and maintenance/ }).check();
  await continueSetup(page, 'Let’s add your first property.');
  await page.getByRole('textbox', { name: 'Property name', exact: true }).fill(property);
  await page.getByRole('combobox', { name: 'Property type', exact: true }).selectOption('building');
  await page.getByRole('spinbutton', { name: 'Number of units', exact: true }).fill('3');
  await page.getByRole('textbox', { name: 'Street address', exact: true }).fill('18 Synthetic Onboarding Avenue');
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Lagos');
  await page.getByRole('textbox', { name: 'State / region', exact: true }).fill('Lagos State');
  await continueSetup(page, 'A starting point that fits your portfolio.');
  await page.getByRole('button', { name: 'Create property & open workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/complete$/);
  await expect(page.getByRole('heading', { name: 'Your first property is ready.', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('3 units ready for residents');
  await expect(page.getByRole('main')).toContainText('Bank transfer · Cash or manual records');
  await page.getByRole('link', { name: 'View properties', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: property });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('0/3');
  const units = page.getByRole('dialog', { name: property, exact: true });
  await openDialog(page.getByRole('button', { name: `View units at ${property}`, exact: true }), units);
  for (const number of [1, 2, 3]) await expect(units.getByText(`Unit ${number}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close property details', exact: true }).click();

  // Revisiting completion and reloading must not create another property.
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/onboarding\/complete$/);
  await page.reload();
  await page.goto('/properties');
  await expect(page.getByRole('row').filter({ hasText: property })).toHaveCount(1);

  // One owner can create a second company without copying the first setup.
  await page.goto('/companies');
  await page.getByText('Create another company', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Company name', exact: true }).fill(secondCompany);
  await page.getByRole('button', { name: 'Create company', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'What kind of portfolio are you managing?', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Individual landlord/ })).not.toBeChecked();
  await page.getByRole('link', { name: 'Set up later', exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.goto('/properties');
  await expect(page.getByRole('row').filter({ hasText: property })).toHaveCount(0);
  await page.goto('/companies');
  await page.getByRole('region', { name: company, exact: true }).getByRole('button', { name: 'Open company', exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.goto('/properties');
  await expect(page.getByRole('row').filter({ hasText: property })).toHaveCount(1);
});
