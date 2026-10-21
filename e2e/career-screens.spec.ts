import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/harness/harness';

/** Collects console errors and uncaught exceptions so any of them fails the test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const lunaClear = {
  levelId: 'luna',
  characterId: 'artsy',
  result: { score: 4200, customersWon: 9, timeSeconds: 74, highlights: ['luna-agent', 'luna-exit'] },
};

test('stage clear records the run, then mission select deploys the next open mission', async ({ page }) => {
  const errors = trackErrors(page);
  const params = encodeURIComponent(JSON.stringify(lunaClear));
  await page.goto(`/?host=flat&seed=1&scene=stageClear&params=${params}&frames=0`);
  await page.waitForFunction(() => window.__arcadeReady === true);

  const session = await page.evaluate(() => window.__arcade?.state().session);
  expect(session).toMatchObject({
    completed: ['luna'],
    highlights: { luna: ['luna-agent', 'luna-exit'] },
    bestScore: { luna: 4200 },
  });

  // Let the tally settle, then back out to the mission select.
  await page.evaluate(() => {
    window.__arcade?.step(600);
    window.__arcade?.press('back');
    window.__arcade?.step(60);
  });
  expect(await page.evaluate(() => window.__arcade?.state().scene)).toBe('levelSelect');

  // The cursor starts on the first mission still open (Berlin); confirming deploys into it.
  await page.evaluate(() => {
    window.__arcade?.press('confirm');
    window.__arcade?.step(120);
  });
  expect(await page.evaluate(() => window.__arcade?.state().scene)).toBe('level');
  expect(errors).toEqual([]);
});

test('a press during the tally skips to the settled screen, where back leaves at once', async ({ page }) => {
  const errors = trackErrors(page);
  const params = encodeURIComponent(JSON.stringify(lunaClear));
  await page.goto(`/?host=flat&seed=1&scene=stageClear&params=${params}&frames=60`);
  await page.waitForFunction(() => window.__arcadeReady === true);
  await page.evaluate(() => {
    window.__arcade?.press('confirm');
    window.__arcade?.step(2);
  });
  expect(await page.evaluate(() => window.__arcade?.state().scene)).toBe('stageClear');
  // Mid-sequence, back would only skip; leaving now proves the tally already settled.
  await page.evaluate(() => {
    window.__arcade?.press('back');
    window.__arcade?.step(60);
  });
  expect(await page.evaluate(() => window.__arcade?.state().scene)).toBe('levelSelect');
  expect(errors).toEqual([]);
});
