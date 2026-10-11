import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;
let profileDir: string;
const apiFailures: string[] = [];

const apiUrl = process.env.BCIS_E2E_API_URL;
const username = process.env.BCIS_E2E_USERNAME;
const password = process.env.BCIS_E2E_PASSWORD;
const databaseName = process.env.BCIS_E2E_DATABASE_NAME;

test.beforeAll(async () => {
  if (!apiUrl || !username || !password || !databaseName) {
    throw new Error('Set BCIS_E2E_API_URL, BCIS_E2E_USERNAME, BCIS_E2E_PASSWORD, and BCIS_E2E_DATABASE_NAME.');
  }
  if (!/(test|acceptance|disposable)/i.test(databaseName)) {
    throw new Error('Desktop E2E is restricted to a disposable test/acceptance database.');
  }

  const healthUrl = apiUrl.replace(/\/api\/v1\/?$/, '/health');
  const health = await fetch(healthUrl);
  if (!health.ok) throw new Error(`Test API health check failed: ${health.status} ${health.statusText}`);

  const childEnv = { ...process.env, VITE_API_URL: apiUrl };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  profileDir = await mkdtemp(join(tmpdir(), 'bcis-e2e-'));
  app = await electron.launch({
    args: [process.cwd(), `--user-data-dir=${profileDir}`],
    env: childEnv,
    timeout: 60_000,
  });
  page = await app.firstWindow();
  page.on('dialog', async (dialog) => {
    console.error(`Desktop dialog (${dialog.type()}): ${dialog.message()}`);
    await dialog.accept();
  });
  page.on('pageerror', (error) => console.error(`Desktop page error: ${error.message}`));
  page.on('requestfailed', (request) => console.error(`Desktop request failed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(apiUrl!)) {
      apiFailures.push(`${response.status()} ${response.url()}`);
    }
  });
});

test.afterAll(async () => {
  await app?.close();
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
});

test('signs in, loads seeded records, visits operational screens, and signs out', async () => {
  await expect(page.getByRole('heading', { name: 'BCIS Login' })).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill(username!);
  await page.locator('input[autocomplete="current-password"]').fill(password!);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Subscribers' }).click();
  await expect(page.getByRole('heading', { name: 'Subscribers', level: 2 })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();

  const screens = [
    ['Billing', 'Billing'],
    ['Payments', 'Payments'],
    ['Collections', 'Collections'],
    ['Receivables', 'Receivables'],
    ['Reports', 'Reports'],
    ['Administration', 'Administration'],
  ] as const;

  for (const [navigationLabel, heading] of screens) {
    await page.getByRole('button', { name: navigationLabel }).click();
    await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    await page.waitForLoadState('networkidle');
  }

  await page.getByRole('button', { name: 'Backup & Restore' }).click();
  await expect(page.getByRole('heading', { name: 'Backup & Restore' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Logout' }).last().click();
  await expect(page.getByRole('heading', { name: 'BCIS Login' })).toBeVisible();
  expect(apiFailures, `Unexpected API errors:\n${apiFailures.join('\n')}`).toEqual([]);
});
