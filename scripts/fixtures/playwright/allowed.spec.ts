// Everything here is legal: packs-playwright-test.mjs expects no finding from this file.
import { expect, test } from '@playwright/test';
import { setInterval } from 'node:timers/promises';
import { checkoutPage } from './checkout-page';

// page.waitForTimeout(1000), test.only('x') and test.skip() in a comment are not code.
const note = "page.waitForTimeout(1000); test.only('x'); test.skip(); if (a) {}";

// A timer that rejects is a guard against hanging, not a sleep.
const guard = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 5000));
const later = new Promise((resolve) => server.listen(0, resolve));
const cleanup = setTimeout(() => server.close(), 5000);

test('waits for conditions', async ({ page }) => {
  await page.waitForURL('**/done');
  await expect(page.getByRole('status')).toHaveText('ready');
  await expect.poll(async () => 1).toBe(1);
  items.only(1);
  stream.skip(2);
  await checkoutPage.verify();
});

test.skip(({ browserName }) => browserName === 'webkit', 'not supported on webkit');

test.describe('group', () => {
  test.skip(process.platform === 'win32', `needs a POSIX shell`);
  test('conditional skip form', async ({ browserName, isMobile }) => {
    test.skip(browserName !== 'chromium', 'chromium only');
    test.fixme(isMobile, 'layout differs on mobile');
    test.slow();
  });
});

test.skip('quarantined skip', { tag: '@quarantine-2099-12-31' }, async () => {});
test.fixme('quarantined in the title @quarantine-2099-12-31', async () => {});
test.fixme('quarantined in a list', { tag: ['@smoke', '@quarantine-2099-12-31'] }, async () => {});
test('quarantined, skipped inside', { tag: '@quarantine-2099-12-31' }, async () => {
  test.skip();
});
test.describe('quarantined group', { tag: '@quarantine-2099-12-31' }, () => {
  test.skip('child', async () => {});
  test('child skipped inside', async () => {
    test.fixme();
  });
});
test.describe.skip(/* why: flaky */ 'quarantined skip group @quarantine-2099-12-31', () => {});

test('conditionals outside the test body', async ({ page }) => {
  await page.route('**/api', async (route) => {
    if (route.request().method() === 'POST') await route.abort();
    else await route.continue();
  });
  const width = await page.evaluate(() => {
    if (document.body) return document.body.clientWidth;
    return 0;
  });
  const label = width > 500 ? 'wide' : 'narrow';
  const box = await page.getByRole('main').boundingBox();
  if (!box) throw new Error('no box');
  if (!label) {
    // narrows the type
    throw new Error('no label');
  }
  expect(box.width).toBeGreaterThan(0);
});

function helper(value) {
  if (value) return value;
  return null;
}

test.beforeEach(async ({ page }) => {
  if (process.env.SEED) await page.goto('/seed');
});

// Naming another tool's rule keeps its suppression working.
// ast-grep-ignore: no-banned-identifier
const data = 1;
