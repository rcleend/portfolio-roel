import { expect, type Page, test } from '@playwright/test';
// Brings the `window.__playground` typings into scope for the in-page callbacks below.
import type {} from '../src/app/playground/main';
import { trackErrors } from './helpers';

async function openPlayground(page: Page, query = ''): Promise<Readonly<Record<string, readonly string[]>>> {
  await page.goto(`/playground${query}`);
  await page.waitForFunction(() => window.__playground !== undefined);
  return page.evaluate(() => window.__playground?.boards ?? {});
}

/** A canvas's pixels as a data URL, once the next two animation frames have drawn. */
async function pixels(page: Page, selector: string): Promise<string> {
  return page.evaluate(async (canvasSelector) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!canvas) throw new Error(`no canvas at ${canvasSelector}`);
    return canvas.toDataURL();
  }, selector);
}

test.describe('playground', () => {
  test('shows a live tile for every registered variant and opens and closes focus mode', async ({ page }) => {
    const errors = trackErrors(page);
    const boards = await openPlayground(page);
    expect(Object.keys(boards)).toEqual(expect.arrayContaining(['lockups', 'backdrops']));
    expect(Object.keys(boards)).toEqual(expect.arrayContaining(['characters', 'skills', 'customer']));
    for (const [board, tiles] of Object.entries(boards)) {
      expect(tiles.length).toBeGreaterThan(0);
      await expect(page.locator(`[data-board="${board}"] [data-tile]`)).toHaveCount(tiles.length);
      for (const tile of tiles) {
        await expect(page.locator(`[data-board="${board}"] [data-tile="${tile}"] canvas`)).toBeVisible();
      }
    }

    const focus = page.getByRole('dialog');
    await page.locator('[data-board="lockups"] [data-tile]').first().click();
    await expect(focus).toBeVisible();
    await expect(focus.locator('canvas')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('focus')).toBe('title');
    await page.keyboard.press('Escape');
    await expect(focus).toBeHidden();
    expect(new URL(page.url()).searchParams.has('focus')).toBe(false);

    await page.keyboard.press('1');
    await expect(focus).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(focus).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('keeps every tile on the same frame of the real title scene', async ({ page }) => {
    const errors = trackErrors(page);
    await openPlayground(page, '?zoom=1');
    await page.evaluate(() => window.__playground?.loop.seek(120));
    // Each board's current tile shows the title the game ships, so the two must match pixel for pixel.
    const shipped = '[data-board="lockups"] [data-current] canvas';
    const sameOnBackdrops = '[data-board="backdrops"] [data-current] canvas';
    const lockupTile = await pixels(page, shipped);
    // Tiles out of view are not drawn; this one catches up as soon as it scrolls in.
    await page.locator(sameOnBackdrops).scrollIntoViewIfNeeded();
    await expect.poll(() => pixels(page, sameOnBackdrops)).toBe(lockupTile);

    const lit = await page.evaluate((selector) => {
      const canvas = document.querySelector<HTMLCanvasElement>(selector);
      const { data } = canvas?.getContext('2d')?.getImageData(0, 0, 320, 240) ?? { data: [] };
      return Array.from(data).some((value, index) => index % 4 !== 3 && value > 0);
    }, shipped);
    expect(lit).toBe(true);
    expect(errors).toEqual([]);
  });

  test('stands the Terraria designs and their revision beside the classic cast on every backdrop', async ({ page }) => {
    const errors = trackErrors(page);
    const boards = await openPlayground(page, '?zoom=1');
    const lineups = [...new Set((boards.roels ?? []).map((key) => key.split('/')[1]))];
    expect(lineups.length).toBeGreaterThan(1);
    for (const lineup of lineups) {
      const tile = (cast: string) => `[data-board="roels"] [data-tile="roels/${lineup}/${cast}"] canvas`;
      const [classic, terraria, revised] = [tile('game'), tile('terraria'), tile('revised')];
      await page.locator(revised).scrollIntoViewIfNeeded();
      // Tiles out of view are not drawn, so wait for all three to have caught up before comparing.
      await expect
        .poll(
          async () =>
            new Set(await Promise.all([classic, terraria, revised].map((canvas) => pixels(page, canvas)))).size,
        )
        .toBe(3);
    }
    expect(errors).toEqual([]);
  });

  test('drives every preview from the keyboard transport', async ({ page }) => {
    const errors = trackErrors(page);
    await openPlayground(page);
    const clock = () => page.evaluate(() => window.__playground?.loop.clock.state);

    await page.evaluate(() => window.__playground?.loop.seek(300));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    expect(await clock()).toMatchObject({ frame: 301, playing: false });
    await page.keyboard.press(' ');
    expect(await clock()).toMatchObject({ playing: true });
    await page.keyboard.press(' ');
    expect(await clock()).toMatchObject({ playing: false });

    await page.keyboard.press('r');
    expect(await clock()).toMatchObject({ playing: true });
    expect((await clock())?.frame).toBeLessThan(300);
    expect(errors).toEqual([]);
  });

  test('opens a shared link on its combination and says what this checkout lacks', async ({ page }) => {
    const errors = trackErrors(page);
    await openPlayground(page, '?focus=title&focus.backdrop=volcano&crt=1');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.notice')).toContainText('focus.backdrop=volcano');
    await expect(page.getByRole('button', { name: 'CRT' })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
});
