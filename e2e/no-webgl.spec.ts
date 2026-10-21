import { expect, test } from '@playwright/test';
import { hostElement, scene, waitForRunning } from './helpers';

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } });

test('without WebGL the requested room falls back to the flat television', async ({ page }) => {
  await page.goto('/?host=room&seed=1');
  await waitForRunning(page);
  await expect(hostElement(page)).toHaveAttribute('data-host', 'flat');
  expect(await scene(page)).toBe('boot');
});
