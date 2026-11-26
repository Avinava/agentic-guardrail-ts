// Every banned pattern of the playwright pack. A trailing `// want: <rules>` names the findings that
// packs-playwright-test.mjs expects on that line.
import { expect, test } from '@playwright/test';
import { setTimeout as pause } from 'node:timers/promises'; // want: fixed-wait
import { promisify } from 'node:util';

const nap = promisify(setTimeout); // want: fixed-wait
const globalNap = promisify(global.setTimeout); // want: fixed-wait

import * as timers from 'node:timers/promises';
import clock from 'timers/promises';
const cjsTimers = require('node:timers/promises');

test('module sleeps', async () => {
  await timers.setTimeout(5); // want: fixed-wait
  await clock.setTimeout(5); // want: fixed-wait
  await cjsTimers.setTimeout(5); // want: fixed-wait
  await require('timers/promises').setTimeout(5); // want: fixed-wait
  await new Promise((resolve) => global.setTimeout(resolve, 1000)); // want: fixed-wait
  await new Promise((resolve) => globalThis.setTimeout(resolve, 1000)); // want: fixed-wait
  test.skip((browserName) => true, 'always'); // want: skip
  test.skip(browserName => true, 'always'); // want: skip
  test.fixme(function (page) { return true; }, 'always'); // want: skip
});

test('fixed waits', async ({ page }) => {
  await page.waitForTimeout(1000); // want: fixed-wait
  const frame = page.mainFrame();
  await frame.waitForTimeout(1); // want: fixed-wait
  await new Promise((resolve) => setTimeout(resolve, 500)); // want: fixed-wait
  await new Promise((r) => setTimeout(r, 500)); // want: fixed-wait
  await new Promise<void>(function (done) { window.setTimeout(done, 5); }); // want: fixed-wait
  await new Promise((resolve) => setTimeout(() => resolve('x'), 5)); // want: fixed-wait
  await new Promise((resolve) => { // want: fixed-wait
    globalThis.setTimeout(() => {
      resolve(true);
    }, 5);
  });
  await pause(5);
  await nap(5);
  await expect(page).toHaveTitle('x');
});

test.only('focused', async () => {}); // want: focused-test
test.describe.only('focused group', () => {}); // want: focused-test
test.describe.serial.only('focused serial group', () => {}); // want: focused-test
authTest.only('focused through an alias', async () => {}); // want: focused-test
setup.only(title, async () => {}); // want: focused-test

test.skip('bare skip', async () => {}); // want: skip
test.fixme('bare fixme', async () => {}); // want: skip
test.describe.skip('skipped group', () => {}); // want: skip
test.describe.fixme('fixme group', () => {}); // want: skip
test.skip(title, async () => {}); // want: skip
test.skip(`skipped ${title}`, async () => {}); // want: skip
test('skipped inside', async ({ browserName }) => {
  test.skip(); // want: skip
  test.fixme(); // want: skip
  test.skip(true); // want: skip
  test.skip(true, 'always'); // want: skip
  test.fixme(!false, 'always'); // want: skip
  test.skip(browserName === 'webkit'); // want: skip
  test.skip(({ browserName }) => true, 'always'); // want: skip
  test.skip(browserName === 'webkit', reason); // want: skip
  test.info().skip(); // want: skip
  testInfo.fixme(); // want: skip
});

test.skip('expired', { tag: '@quarantine-2020-01-01' }, async () => {}); // want: skip stale-quarantine
test('expired, not skipped', { tag: ['@smoke', '@quarantine-2020-01-01'] }, async () => {}); // want: stale-quarantine
test.fixme('undated @quarantine', async () => {}); // want: skip stale-quarantine
test.fixme('impossible date', { tag: '@quarantine-2099-02-30' }, async () => {}); // want: skip stale-quarantine
test.fixme('wrong shape', { tag: '@quarantine-2099-1-1' }, async () => {}); // want: skip stale-quarantine
// A live tag in a place Playwright does not read as a tag does not count.
test.skip('not a tag', { annotation: { type: '@quarantine-2099-01-01' } }, async () => {}); // want: skip
test('a neighbour is quarantined', { tag: '@quarantine-2099-01-01' }, async () => {});
test.skip('and this one is not', async () => {}); // want: skip

// A live quarantine tag does not accept a static skip: the test would never run.
test.skip('quarantined skip', { tag: '@quarantine-2099-12-31' }, async () => {}); // want: skip
test.fixme('quarantined in the title @quarantine-2099-12-31', async () => {}); // want: skip
test.skip(title, { tag: '@quarantine-2099-12-31' }, async () => {}); // want: skip
test.describe.skip('quarantined skip group @quarantine-2099-12-31', () => {}); // want: skip
test('quarantined, skipped inside', { tag: '@quarantine-2099-12-31' }, async () => {
  test.skip(); // want: skip
  test.fixme(true, 'flaky'); // want: skip
});
test.describe('quarantined group', { tag: '@quarantine-2099-12-31' }, () => {
  test.skip('child', async () => {}); // want: skip
});

test('computed waits', async ({ page }) => {
  await page['waitForTimeout'](1); // want: fixed-wait
  await page["waitForTimeout"](1); // want: fixed-wait
  await page.route('**/api', (route) => route.continue());
  await new Promise((resolve) => setTimeout(resolve, 5)); // want: fixed-wait
});

test('branches', async ({ page }) => {
  if (await page.getByRole('dialog').isVisible()) { // want: conditional-in-test
    await page.keyboard.press('Escape');
  }
  for (const name of names) {
    switch (name) { // want: conditional-in-test
      default:
        break;
    }
  }
  await test.step('step', async () => {
    if (name) await page.reload(); // want: conditional-in-test
  });
  if (!name) { // want: conditional-in-test
    throw new Error('x');
  } else {
    await page.reload();
  }
  await expect(page).toHaveTitle('x');
});

authTest('alias body', async () => {
  authTest.skip(); // want: skip
  if (name) await login(); // want: conditional-in-test
});

test.beforeEach(async () => {});
