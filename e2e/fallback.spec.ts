import { expect, test } from '@playwright/test';
import { hostElement, scene, trackErrors, waitForRunning } from './helpers';

test('?host=flat powers on the CSS television and boots', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?host=flat&seed=1');
  await expect(hostElement(page)).toHaveAttribute('data-host', 'flat');
  await waitForRunning(page);
  expect(await scene(page)).toBe('boot');
  await expect(page.locator('.tv__tube')).toHaveCount(0);
  expect(errors).toEqual([]);
});
