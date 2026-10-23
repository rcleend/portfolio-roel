import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/app/pc/lab/main';
import { experience, profile } from '../src/content';
import { trackErrors } from './helpers';

/**
 * The computer's screen on the PC lab's stand-in monitor (pc-lab.html): the
 * startup storyboard on Playwright's clock, the reader, leaving, the pop-out
 * and the hand-off from the still. `?w=&h=` sets the picture the room would
 * give at a viewport: 874 × 687 is the 1440 × 900 room, 700 × 550 the
 * 1280 × 720 one and 321 × 252 a 390 × 844 phone.
 */

const DESKTOP_1440 = 'w=874&h=687';

async function openLab(page: Page, query: string): Promise<void> {
  await page.goto(`/pc-lab.html?clean&${query}`);
  // The screen's chunk loads at idle once the visitor is in the room; the still painter too.
  await page.waitForFunction(() => window.__pcLab?.loaded() && window.__pcLab.display.painted);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
}

/** Advances the page's clock in small steps, so React renders between timers as it would in real time. */
async function advance(page: Page, ms: number, step = 20): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += step) await page.clock.runFor(Math.min(step, ms - elapsed));
}

const pcState = (page: Page) => page.evaluate(() => window.__pcLab?.state());
const land = (page: Page) => page.evaluate(() => window.__pcLab?.land());
const events = (page: Page) => page.evaluate(() => window.__pcLab?.events.map((event) => ({ ...event })) ?? []);
const reader = (page: Page) => page.getByRole('dialog', { name: /Roel Leenders CV/ });
const pane = (page: Page) => page.getByRole('document', { name: "Roel Leenders' résumé" });

async function stateWithin(page: Page, ms: number): Promise<string | undefined> {
  await advance(page, ms);
  return pcState(page);
}

test('the first visit opens the résumé in the reader within 1.9 s of landing', async ({ page }) => {
  const errors = trackErrors(page);
  await openLab(page, DESKTOP_1440);
  await land(page);
  expect(await pcState(page)).toBe('desktop');
  expect(await stateWithin(page, 1100)).toBe('splash');
  expect(await stateWithin(page, 800)).toBe('reader');

  await expect(reader(page)).toBeVisible();
  const document = pane(page);
  await expect(document).toBeFocused();
  await expect(document).toContainText(profile.name);
  for (const job of experience) await expect(document).toContainText(job.role);
  expect((await events(page)).filter((event) => event.type === 'setLight')).toEqual([
    expect.objectContaining({ color: { r: 0.8, g: 0.8, b: 0.8 } }),
  ]);
  expect(errors).toEqual([]);
});

test('a warm visit reopens within 0.65 s at the same place', async ({ page }) => {
  const errors = trackErrors(page);
  await openLab(page, DESKTOP_1440);
  await land(page);
  await advance(page, 1900);
  await pane(page).evaluate((element) => {
    element.scrollTop = 600;
  });
  await page.evaluate(() => window.__pcLab?.leave());
  expect(await pcState(page)).toBe('away');

  await land(page);
  expect(await stateWithin(page, 650)).toBe('reader');
  await expect(reader(page)).toBeVisible();
  expect(await pane(page).evaluate((element) => element.scrollTop)).toBeCloseTo(600, -1);
  expect(errors).toEqual([]);
});

test('a click during the startup skips straight to the reader', async ({ page }) => {
  await openLab(page, DESKTOP_1440);
  await land(page);
  expect(await stateWithin(page, 1100)).toBe('splash');
  const placement = await page.evaluate(() => window.__pcLab?.display.placement);
  if (!placement) throw new Error('The lab has no placement');
  await page.mouse.click(placement.left + placement.width / 2, placement.top + placement.height / 2);
  expect(await stateWithin(page, 100)).toBe('reader');
  await expect(reader(page)).toBeVisible();
});

for (const how of ['Escape', 'the close button'] as const) {
  test(`${how} closes the reader, holds the desktop 200 ms, then leaves`, async ({ page }) => {
    const errors = trackErrors(page);
    await openLab(page, DESKTOP_1440);
    await land(page);
    await advance(page, 1900);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Close the résumé' }).click();

    expect(await pcState(page)).toBe('closing');
    await expect(reader(page)).toHaveCount(0);
    await advance(page, 180);
    expect((await events(page)).some((event) => event.type === 'leave')).toBe(false);
    await advance(page, 40);
    const log = await events(page);
    const lightOff = log.findIndex((event) => event.type === 'setLight' && event.color === null);
    const leave = log.findIndex((event) => event.type === 'leave');
    expect(lightOff).toBeGreaterThan(-1);
    expect(leave).toBeGreaterThan(lightOff);
    expect((log[leave]?.at ?? 0) - (log[lightOff]?.at ?? 0)).toBeGreaterThanOrEqual(200);
    expect(await pcState(page)).toBe('away');
    // Focus went back to the stage: the screen was hidden with focus inside it.
    expect(log.some((event) => event.type === 'focusStage')).toBe(true);

    // A second Escape on the hidden screen does nothing.
    await page.keyboard.press('Escape');
    expect((await events(page)).filter((event) => event.type === 'leave')).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test('leaving mid-sequence cancels it and leaves no dialog behind', async ({ page }) => {
  const errors = trackErrors(page);
  await openLab(page, DESKTOP_1440);
  await land(page);
  expect(await stateWithin(page, 1200)).toBe('splash');
  await page.evaluate(() => window.__pcLab?.leave());
  expect(await pcState(page)).toBe('away');
  await advance(page, 1500);
  expect(await pcState(page)).toBe('away');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await events(page)).some((event) => event.type === 'setLight')).toBe(false);
  expect(errors).toEqual([]);
});

test('under reduced motion nothing animates and the reader is up within 0.5 s', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLab(page, DESKTOP_1440);
  await land(page);
  const animations = () => page.evaluate(() => document.getAnimations().length);
  expect(await animations()).toBe(0);
  // The splash stands still from the first tick after landing.
  expect(await stateWithin(page, 20)).toBe('splash');
  expect(await animations()).toBe(0);
  await advance(page, 180);
  expect(await animations()).toBe(0);
  expect(await stateWithin(page, 300)).toBe('reader');
  await expect(reader(page)).toBeVisible();
  expect(await animations()).toBe(0);
  await page.keyboard.press('Escape');
  expect(await animations()).toBe(0);
});

test('at the 1440 × 900 picture the page opens at Fit Width with body text of 12 px or more', async ({ page }) => {
  await openLab(page, DESKTOP_1440);
  await land(page);
  await advance(page, 1900);
  await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('fit-width');
  const bodyPx = await page
    .locator('.pc-doc--a4 .pc-page')
    .first()
    .evaluate((sheet) => {
      return (sheet.getBoundingClientRect().width / 794) * 14;
    });
  expect(bodyPx).toBeGreaterThanOrEqual(12);
});

test('at the 1280 × 720 picture the page opens in Reflow at 16 px', async ({ page }) => {
  await openLab(page, 'w=700&h=550');
  await land(page);
  await advance(page, 1900);
  await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('reflow');
  const summary = page.locator('.pc-doc--reflow .pc-doc__summary');
  expect(await summary.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
  const box = await summary.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
});

test('the document scrolls with the keyboard, links work and the page counter follows', async ({ page }) => {
  await openLab(page, DESKTOP_1440);
  await land(page);
  await advance(page, 1900);
  const document = pane(page);
  await expect(document).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect.poll(() => document.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);

  const email = document.getByRole('link', { name: profile.links[0]?.label });
  await expect(email).toHaveAttribute('href', 'mailto:rcleende@gmail.com');
  await expect(email).not.toHaveAttribute('target', /./);
  for (const link of profile.links.filter((entry) => entry.href.startsWith('https:'))) {
    const anchor = document.getByRole('link', { name: link.label });
    await expect(anchor).toHaveAttribute('href', link.href);
    await expect(anchor).toHaveAttribute('target', '_blank');
    await expect(anchor).toHaveAttribute('rel', 'noopener');
  }

  const counter = page.locator('.pc-status__field');
  await expect(counter).toHaveText('1 of 2');
  await document.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect(counter).toHaveText('2 of 2');
  await page.getByRole('button', { name: 'First page' }).click();
  await expect(counter).toHaveText('1 of 2');
});

test('zooming scales the pages without laying them out again', async ({ page }) => {
  await openLab(page, DESKTOP_1440);
  await land(page);
  await advance(page, 1900);
  const sheets = page.locator('.pc-doc--a4');
  const before = await sheets.evaluate((element) => element.style.transform);
  const firstPage = await page.locator('.pc-doc--a4 .pc-page').first().elementHandle();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('125');
  expect(await sheets.evaluate((element) => element.style.transform)).toBe('scale(1.25)');
  expect(before).not.toBe('scale(1.25)');
  expect(await firstPage?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator('.pc-doc--a4 .pc-page')).toHaveCount(2);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the reader grows out of the glass to fill the viewport in Reflow', async ({ page }) => {
    const errors = trackErrors(page);
    await openLab(page, 'w=321&h=252');
    await land(page);
    expect(await stateWithin(page, 2200)).toBe('reader');
    await expect(page.locator('.pc-screen')).toHaveAttribute('data-pc-mode', 'pop-out');
    const dialog = reader(page);
    await expect(dialog).toBeVisible();
    // The breakout's FLIP runs on the real animation clock.
    await expect.poll(() => dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    const body = await page.locator('.pc-doc--reflow .pc-doc__summary').evaluate((element) => {
      return Number.parseFloat(getComputedStyle(element).fontSize);
    });
    expect(body).toBeGreaterThanOrEqual(15);
    const close = await dialog.getByRole('button', { name: 'Close the résumé' }).boundingBox();
    expect(close?.width).toBeGreaterThanOrEqual(44);
    expect(close?.height).toBeGreaterThanOrEqual(44);

    await dialog.getByRole('button', { name: 'Close the résumé' }).tap();
    await advance(page, 420);
    expect((await events(page)).some((event) => event.type === 'leave')).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('the live desktop lands over the still without a visible change', async ({ page }) => {
  await openLab(page, `${DESKTOP_1440}&glass=0&tier=1024`);
  await land(page);
  // The room's cross-fade runs on the real clock; wait it out.
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  const clip = await page.evaluate(() => {
    const placement = window.__pcLab?.display.placement;
    return placement && { x: placement.left, y: placement.top, width: placement.width, height: placement.height };
  });
  if (!clip) throw new Error('The lab has no placement');
  const live = await page.screenshot({ clip });
  await page.evaluate(() => document.body.classList.add('hide-screen'));
  const still = await page.screenshot({ clip });
  const a = await sharp(live).removeAlpha().raw().toBuffer();
  const b = await sharp(still).removeAlpha().raw().toBuffer();
  let total = 0;
  for (let index = 0; index < a.length; index++) total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  expect(total / a.length).toBeLessThanOrEqual(4);
});
