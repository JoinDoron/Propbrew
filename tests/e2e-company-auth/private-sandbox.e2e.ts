import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { openDialog } from './dialog';

async function enterEstate(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore Estate demo', exact: true }).click();
  await expect(page).toHaveURL(/\/estate$/);
  await expect(page.getByRole('complementary', { name: 'Demo account notice' })).toContainText('Private demo sandbox');
}
async function addProperty(page: Page, name: string) {
  await page.goto('/estate');
  const dialog = page.getByRole('dialog', { name: 'Add property', exact: true });
  await openDialog(page.getByRole('button', { name: 'Add property', exact: true }), dialog);
  await dialog.getByLabel('Property name', { exact: true }).fill(name);
  await dialog.getByLabel('Property address', { exact: true }).fill('Synthetic test address, Lagos');
  await dialog.getByRole('button', { name: 'Add property', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Property added', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
}
async function companyId(page: Page) {
  const response = await page.request.get('/api/companies'); expect(response.status()).toBe(200);
  const data = await response.json(); expect(data.companies).toHaveLength(1);
  return data.companies[0].id as string;
}

test('two visitors using the same demo login keep independent edits and reset cannot affect another demo or a real company', async ({ page, browser }) => {
  const secondContext = await browser.newContext({ baseURL: process.env.PW_COMPANY_BASE_URL });
  const customerContext = await browser.newContext({ baseURL: process.env.PW_COMPANY_BASE_URL });
  const second = await secondContext.newPage(), customer = await customerContext.newPage();
  const id = randomUUID().slice(0, 8), firstName = `Visitor A ${id}`, secondName = `Visitor B ${id}`, customerName = `Customer ${id}`;
  try {
    await enterEstate(page); await addProperty(page, firstName);
    await enterEstate(second); await addProperty(second, secondName);
    await customer.goto('/sign-up');
    await customer.getByLabel('Your full name', { exact: true }).fill('Disposable customer owner');
    await customer.getByLabel('Email address', { exact: true }).fill(`sandbox-customer-${id}@example.test`);
    await customer.getByLabel('Company name', { exact: true }).fill(`Real account isolation ${id}`);
    await customer.getByLabel('Password', { exact: true }).fill('Disposable sandbox browser test passphrase!');
    await customer.getByRole('button', { name: 'Create account & company', exact: true }).click();
    await expect(customer).toHaveURL(/\/onboarding$/);
    await customer.getByRole('link', { name: 'Set up later', exact: true }).click();
    await expect(customer).toHaveURL(/\/workspaces$/); await addProperty(customer, customerName);
    const a = await companyId(page), b = await companyId(second), c = await companyId(customer);
    expect(new Set([a, b, c]).size).toBe(3);
    for (const foreign of [b, c]) expect((await page.request.post('/api/companies/select', { data: { companyId: foreign }, headers: { Origin: process.env.PW_COMPANY_BASE_URL! } })).status()).toBe(404);
    expect((await customer.request.post('/api/companies/select', { data: { companyId: a }, headers: { Origin: process.env.PW_COMPANY_BASE_URL! } })).status()).toBe(404);
    await page.goto('/construction'); await page.goto('/properties');
    const firstTable = page.getByRole('table', { name: 'Property list', exact: true });
    await expect(firstTable).toContainText(firstName); await expect(firstTable).not.toContainText(secondName); await expect(firstTable).not.toContainText(customerName);
    await page.reload(); await expect(firstTable).toContainText(firstName);
    const notice = page.getByRole('complementary', { name: 'Demo account notice' });
    await notice.getByRole('button', { name: 'Reset sample data', exact: true }).click();
    await expect(notice).toContainText('Real company records and other visitors’ demos stay unchanged.');
    await notice.getByRole('button', { name: 'Reset my sandbox', exact: true }).click();
    await expect(notice.getByRole('status')).toContainText('fresh sample data');
    await expect(firstTable).not.toContainText(firstName); await expect(firstTable).toContainText('Lekki Gardens Estate');
    await second.goto('/properties'); await second.reload();
    await expect(second.getByRole('table', { name: 'Property list', exact: true })).toContainText(secondName);
    await expect(second.getByRole('table', { name: 'Property list', exact: true })).not.toContainText(firstName);
    await customer.goto('/properties'); await customer.reload();
    await expect(customer.getByRole('table', { name: 'Property list', exact: true })).toContainText(customerName);
    await expect(customer.getByRole('table', { name: 'Property list', exact: true })).not.toContainText('Lekki Gardens Estate');
  } finally { await secondContext.close(); await customerContext.close(); }
});

test('private construction sandbox creates a project and persists safe project edits', async ({ page }) => {
  const id = randomUUID().slice(0, 8), name = `Sandbox build ${id}`, updated = `${name} edited`;
  await page.goto('/login'); await page.getByRole('button', { name: 'Explore Construction demo', exact: true }).click();
  await expect(page).toHaveURL(/\/construction$/); await page.goto('/construction/projects');
  const create = page.getByRole('dialog', { name: 'New project', exact: true });
  await openDialog(page.getByRole('button', { name: 'New project', exact: true }), create);
  await create.getByLabel('Name', { exact: true }).fill(name); await create.getByLabel('Location', { exact: true }).fill('Lagos');
  await create.getByLabel('Client', { exact: true }).fill('Sample project owner');
  await create.getByLabel('Contract (₦)', { exact: true }).fill('1000000'); await create.getByLabel('Budget (₦)', { exact: true }).fill('800000');
  await create.getByLabel('Planned finish', { exact: true }).fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  await create.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const edit = page.getByRole('dialog', { name: 'Edit project', exact: true });
  await openDialog(page.getByRole('button', { name: `Edit project ${name}`, exact: true }), edit);
  await edit.getByLabel('Project name', { exact: true }).fill(updated); await edit.getByLabel('Location', { exact: true }).fill('Abuja');
  await edit.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(edit).not.toBeVisible(); await page.reload();
  await expect(page.getByRole('heading', { name: updated, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Edit project ${updated}`, exact: true })).toBeVisible();
});
