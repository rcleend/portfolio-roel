import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type Browser, type BrowserContextOptions, expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/harness/harness';
import { GPU_LAUNCH_ARGS } from './gpu';

/**
 * Visual review sheet, not a regression test: `APP_SHOTS=1 pnpm e2e app-shots`
 * writes loading, power-on, TV and room screenshots for each target viewport
 * to .shots/app/. Skipped in normal runs.
 */
test.skip(!process.env.APP_SHOTS, 'set APP_SHOTS=1 to capture the review screenshots');
test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });
test.setTimeout(120_000);

const OUT = resolve('.shots/app');

interface Target {
  readonly name: string;
  readonly context: BrowserContextOptions;
  /** A point outside the TV (and the touch pad) that sends the camera to the room. */
  readonly outside: { readonly x: number; readonly y: number };
}

const touch = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } as const;
const TARGETS: readonly Target[] = [
  { name: 'desktop', context: { viewport: { width: 1440, height: 900 } }, outside: { x: 40, y: 450 } },
  { name: 'phone', context: { viewport: { width: 390, height: 844 }, ...touch }, outside: { x: 195, y: 90 } },
  // The picture fills a phone on its side top to bottom: the room shows beside the set, above the pad's start button.
  { name: 'landscape', context: { viewport: { width: 844, height: 390 }, ...touch }, outside: { x: 40, y: 120 } },
];

async function shot(page: Page, target: Target, moment: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${target.name}-${moment}.png`) });
}

async function phase(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.getElementById('game')?.dataset.phase);
}

async function capture(browser: Browser, target: Target): Promise<void> {
  const context = await browser.newContext(target.context);
  const page = await context.newPage();
  // Hold the big room model back so the loading screen can be photographed mid-way.
  let release: () => void = () => {};
  const held = new Promise<void>((resolveHeld) => {
    release = resolveHeld;
  });
  await page.route('**/room/room.glb', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/?seed=1');
  await page.waitForTimeout(1200);
  await shot(page, target, '1-loading');
  release();

  await expect.poll(() => phase(page), { timeout: 30_000, intervals: [20] }).toBe('powering');
  await page.waitForTimeout(330);
  await shot(page, target, '2-power-on');

  await page.waitForFunction(() => window.__arcadeReady === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__arcade?.goTo('characterSelect'));
  await page.waitForTimeout(1500);
  await shot(page, target, '3-tv');

  await page.mouse.click(target.outside.x, target.outside.y);
  await page.waitForTimeout(1800);
  await shot(page, target, '4-room');
  await context.close();
}

for (const target of TARGETS) {
  test(`review shots: ${target.name}`, async ({ browser }) => {
    await mkdir(OUT, { recursive: true });
    await capture(browser, target);
  });
}

/**
 * The 1200 × 630 link-preview image: the attic at night, game paused on the title. Publish with
 * `sips -s format jpeg -s formatOptions 86 .shots/app/og-image.png --out public/og-image.jpg`.
 */
test('review shots: og image', async ({ browser }) => {
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/?seed=1&scene=title');
  await page.waitForFunction(() => window.__arcadeReady === true, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(30, 315);
  await page.waitForTimeout(1500);
  // A link preview is a poster, not a UI: no page chrome over the room.
  await page.addStyleTag({
    content: '.sound-toggle, .guide-pill, .overview, .prop-label { display: none !important; }',
  });
  await page.screenshot({ path: join(OUT, 'og-image.png') });
  await context.close();
});
