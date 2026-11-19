import { type Page, test } from '@playwright/test';
import type {} from '../src/room/lab/main';
import { GPU_LAUNCH_ARGS } from './gpu';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

/** Records who asks the browser for animation frames, with a short stack, into `window.__asks`. */
function recordAsks(): void {
  const asks: { at: number; stack: string }[] = [];
  (window as unknown as { __asks: typeof asks }).__asks = asks;
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const stack = (new Error().stack ?? '')
      .split('\n')
      .slice(2, 9)
      .map((line) =>
        line
          .trim()
          .replace(/https?:\/\/[^/]+\//, '')
          .replace(/\?[^:)]*/, ''),
      )
      .join(' < ');
    asks.push({ at: performance.now(), stack });
    return request(callback);
  };
}

async function draws(page: Page, where: string, ms: number): Promise<void> {
  const before = await page.evaluate(() => ({
    at: performance.now(),
    frames: window.__roomLab?.room.stats.framesRendered ?? 0,
  }));
  await page.waitForTimeout(ms);
  const after = await page.evaluate((since) => {
    const asks = (window as unknown as { __asks: { at: number; stack: string }[] }).__asks;
    const stats = window.__roomLab?.room.stats;
    return {
      frames: stats?.framesRendered ?? 0,
      pace: stats?.pace,
      pending: stats?.backgroundPending,
      settled: window.__roomLab?.room.settled,
      asks: asks.filter((ask) => ask.at >= since).map((ask) => `${Math.round(ask.at - since)}ms ${ask.stack}`),
    };
  }, before.at);
  console.log(
    `PROBE ${where}: ${after.frames - before.frames} frames in ${ms} ms, pace ${JSON.stringify(after.pace)}, pending ${after.pending}, settled ${after.settled}`,
  );
  const counts = new Map<string, number>();
  for (const ask of after.asks) {
    const key = ask.replace(/^\d+ms /, '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [stack, count] of counts) console.log(`PROBE   ${count}× ${stack}`);
  console.log(`PROBE   at ${after.asks.map((ask) => ask.split(' ')[0]).join(' ')}`);
}

test('probe: lava under reduced motion', async ({ page }) => {
  await page.addInitScript(recordAsks);
  await page.goto('/room-lab.html?clean&mood=rose&view=room');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.generatedReady);
  await page.waitForFunction(() => window.__roomLab?.room.stats.lavaRunning === true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__roomLab?.room.stats.lavaRunning === false);
  for (let look = 0; look < 6; look++) await draws(page, `reduced, look ${look}`, 600);
});

test('probe: tv paused after a flight back', async ({ page }) => {
  await page.addInitScript(recordAsks);
  await page.goto('/room-lab.html?clean&mockradio=1');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.generatedReady);
  await page.waitForFunction(() => window.__roomLab?.surface.paused === false, null, { timeout: 20_000 });
  await page.evaluate(() => window.__roomLab?.surface.pause());
  await draws(page, 'tv paused at first', 600);
  await draws(page, 'tv paused, again', 600);
  for (const view of ['room', 'radio', 'tv'] as const) {
    await page.evaluate((next) => {
      const room = window.__roomLab?.room;
      if (next === 'tv') room?.focusTv();
      if (next === 'radio') room?.focusRadio();
      if (next === 'room') room?.showRoom();
    }, view);
    await page.waitForFunction((next) => window.__roomLab?.room.view === next && window.__roomLab.room.settled, view);
    if (view === 'radio') await page.waitForTimeout(9000);
  }
  for (let look = 0; look < 4; look++) await draws(page, `back at the tv, look ${look}`, 500);
});

test('probe: the room view from load, second by second', async ({ page }) => {
  await page.addInitScript(recordAsks);
  await page.goto('/room-lab.html?clean&mood=rose&view=room');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  for (let look = 0; look < 14; look++) await draws(page, `room view, second ${look}`, 1000);
});
