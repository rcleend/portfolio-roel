import { expect, type Page } from '@playwright/test';
import type {} from '../src/app/harness/harness';

/** Collects console errors and uncaught exceptions so any of them fails the test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

export async function scene(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__arcade?.state().scene ?? null);
}

export async function paused(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => window.__arcade?.state().paused);
}

/** The startup phase App publishes on #game: loading, revealing, powering, running or failed. */
export async function phase(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.getElementById('game')?.dataset.phase);
}

export async function waitForRunning(page: Page): Promise<void> {
  await expect.poll(() => phase(page), { timeout: 30_000 }).toBe('running');
  await page.waitForFunction(() => window.__arcadeReady === true);
}

/** The element of whichever host is presenting (`data-host` is room or flat, `data-view` tv or room). */
export function hostElement(page: Page) {
  return page.locator('[data-host]');
}
