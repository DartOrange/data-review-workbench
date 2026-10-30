import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('import, inspect, correct in the grid and form, reload, and export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Your next clean dataset starts here.' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/00-empty.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Import CSV file').setInputFiles('demo/customer-ledger.csv');
  await expect(page.getByText('Imported 12 records. 2 need review.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export corrected CSV' })).toBeDisabled();
  await page.screenshot({
    path: 'docs/screenshots/01-imported.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Needs review (2)', exact: true }).click();
  await expect(page.getByText('2 of 12 records shown')).toBeVisible();
  const emailCell = page.locator('.ag-row[row-id="2"] [col-id="email"]');
  await emailCell.dblclick();
  await expect(page.getByLabel('Email', { exact: true }).last()).toBeVisible();
  const editor = page.locator('.ag-cell-inline-editing input');
  await editor.fill('jamie.reed@example.com');
  await editor.press('Enter');
  await expect(page.getByText('Record 2 saved.', { exact: false })).toBeVisible();
  await expect(page.getByText('1 of 12 records shown')).toBeVisible();
  await page.locator('.ag-row[row-id="4"] [col-id="name"]').click();
  await expect(page.getByRole('heading', { name: 'Record 4', exact: true })).toBeVisible();
  await expect(
    page.getByText('Use 0–9999999.99 with up to two decimal places; no currency symbol.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/01b-inspector.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Amount (USD)', { exact: true }).fill('25.00');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('All records are ready to export.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export corrected CSV' })).toBeEnabled();
  await expect(page.locator('.ag-row[row-id="2"] [col-id="email"]')).toHaveText(
    'jamie.reed@example.com',
  );
  await page.screenshot({
    path: 'docs/screenshots/02-corrected.png',
    fullPage: true,
    animations: 'disabled',
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export corrected CSV' }).click();
  const downloaded = await download;
  const output = await readFile((await downloaded.path())!, 'utf8');
  expect(output).toContain('jamie.reed@example.com');
  expect(output).toContain('"25.00"');
  expect(output).toContain('"\'=SUM(1+1)"');
  expect(errors).toEqual([]);
});

test('malformed upload and failed save leave saved data intact and allow retry', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await expect(page.getByText('Imported 12 records. 2 need review.')).toBeVisible();
  await page.getByLabel('Import CSV file').setInputFiles('demo/malformed.csv');
  await expect(page.getByRole('alert')).toContainText('Malformed CSV');
  await expect(page.getByText('12 of 12 records shown')).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/03-malformed.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('.ag-row[row-id="2"] [col-id="name"]').click();
  await page.getByLabel('Email', { exact: true }).fill('jamie.reed@example.com');
  await page.route('**/api/datasets/*/rows/2', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'The local server is temporarily unavailable. Retry saving.',
      }),
    }),
  );
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('jamie.reed@example.com');
  await expect(page.locator('.ag-row[row-id="2"] [col-id="email"]')).toHaveText(
    'jamie.reed.example.com',
  );
  await page.unroute('**/api/datasets/*/rows/2');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('Record 2 saved.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ag-row[row-id="2"] [col-id="email"]')).toHaveText(
    'jamie.reed@example.com',
  );
});

test('failed initial request has a recovery action; narrow screen has no page overflow', async ({
  page,
}) => {
  await page.route('**/api/datasets', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Could not load saved datasets.' }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Could not load saved datasets.');
  await page.unroute('**/api/datasets');
  await page.getByRole('button', { name: 'Reload saved data' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Data Review Workbench' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/04-narrow.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('a stale browser save reports a conflict and reload recovers the latest saved revision', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await expect(page.getByText('Imported 12 records. 2 need review.')).toBeVisible();
  await page.locator('.ag-row[row-id="2"] [col-id="name"]').click();
  await page.getByLabel('Email', { exact: true }).fill('jamie.reed@example.com');
  const datasets = await (await page.request.get('/api/datasets')).json();
  const updated = await page.request.patch(`/api/datasets/${datasets[0].id}/rows/2`, {
    data: { revision: 1, changes: { name: 'Updated in another tab' } },
  });
  expect(updated.ok()).toBe(true);
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed in another tab');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('jamie.reed@example.com');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reload saved data' }).click();
  await expect(page.locator('.ag-row[row-id="2"] [col-id="name"]')).toHaveText(
    'Updated in another tab',
  );
  await page.locator('.ag-row[row-id="2"] [col-id="name"]').click();
  await page.getByLabel('Email', { exact: true }).fill('jamie.reed@example.com');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('Record 2 saved.', { exact: false })).toBeVisible();
});

test('oversized files fail before upload; keyboard editing can be cancelled without saving', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await expect(page.getByText('Imported 12 records. 2 need review.')).toBeVisible();
  await page.getByLabel('Import CSV file').setInputFiles({
    name: 'large.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(1024 * 1024 + 1, 'a'),
  });
  await expect(page.getByRole('alert')).toContainText('1 MiB or smaller');
  const cell = page.locator('.ag-row[row-id="2"] [col-id="email"]');
  await cell.focus();
  await cell.press('Enter');
  await page.locator('.ag-cell-inline-editing input').fill('discarded@example.com');
  await page.locator('.ag-cell-inline-editing input').press('Escape');
  await expect(cell).toHaveText('jamie.reed.example.com');
  await expect(page.getByText('Saved locally · revision 1')).toBeVisible();
});
