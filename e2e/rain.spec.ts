import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { GPU_LAUNCH_ARGS } from './gpu';
import { expectSixtyFrames, pixelsChanged, trackErrors } from './helpers';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

test('rain loops seamlessly outside the game, shares mute, and keeps one source across views', async ({ page }) => {
  const errors = trackErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const sources: AudioBufferSourceNode[] = [];
    (window as unknown as { rainSources: AudioBufferSourceNode[] }).rainSources = sources;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      override createBufferSource(): AudioBufferSourceNode {
        const source = super.createBufferSource();
        sources.push(source);
        return source;
      }
    };
  });
  await page.goto('/?scene=title&paused&frame=180');
  await page.waitForFunction(() => window.__room?.stats.rainReady);
  expect(await page.evaluate(() => window.__room?.stats.rainPlaying)).toBe(false);
  await page.evaluate(() => window.__room?.showRoom());
  // A real gesture unlocks browser audio. Reduced motion must not silence sound.
  await page.keyboard.press('Shift');
  const toggle = page.locator('.sound-toggle');
  if ((await toggle.getAttribute('data-muted')) === 'true') await toggle.click();
  await expect.poll(() => page.evaluate(() => window.__room?.stats.rainPlaying)).toBe(true);
  const loop = await page.evaluate(() => {
    const source = (window as unknown as { rainSources: AudioBufferSourceNode[] }).rainSources.find(
      (source) => source.loop && (source.buffer?.duration ?? 0) > 100,
    );
    if (!source?.buffer) throw new Error('No long rain buffer');
    const buffer = source.buffer;
    const samples = buffer.getChannelData(0);
    const boundary = Math.round(source.loopStart * buffer.sampleRate);
    // The last samples now continue exactly into t=8, rather than jumping from the MP3 tail to its head.
    let seamError = 0;
    let energy = 0;
    for (let i = 1; i <= 128; i++) {
      seamError = Math.max(seamError, Math.abs((samples[buffer.length - i] ?? 0) - (samples[boundary - i] ?? 0)));
      energy += (samples[boundary + i] ?? 0) ** 2;
    }
    return {
      seamError,
      rms: Math.sqrt(energy / 128),
      start: source.loopStart,
      end: source.loopEnd,
      duration: buffer.duration,
      channels: buffer.numberOfChannels,
      rate: buffer.sampleRate,
    };
  });
  expect(loop.start).toBe(8);
  expect(loop.end).toBe(loop.duration);
  expect(loop.channels).toBe(2);
  expect(loop.rate).toBe(24000);
  expect(loop.seamError).toBeLessThan(0.00002);
  expect(loop.rms).toBeGreaterThan(0.0001);
  for (const view of ['pc', 'radio', 'room'] as const) {
    await page.evaluate((view) => {
      if (view === 'pc') window.__room?.focusPc();
      else if (view === 'radio') window.__room?.focusRadio();
      else window.__room?.showRoom();
    }, view);
    await page.waitForFunction((view) => window.__room?.view === view && window.__room.settled, view);
    expect(await page.evaluate(() => window.__room?.stats.rainPlaying)).toBe(true);
  }
  await page.locator('.sound-toggle').click();
  await expect.poll(() => page.evaluate(() => window.__room?.stats.rainPlaying)).toBe(false);
  await toggle.click();
  await expect.poll(() => page.evaluate(() => window.__room?.stats.rainPlaying)).toBe(true);
  await page.evaluate(() => window.__room?.focusTv());
  await expect.poll(() => page.evaluate(() => window.__room?.stats.rainPlaying)).toBe(false);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => {
      const sources = (window as unknown as { rainSources: AudioBufferSourceNode[] }).rainSources.filter(
        (source) => source.loop && (source.buffer?.duration ?? 0) > 100,
      );
      return { count: sources.length, state: sources[0]?.context.state };
    }),
  ).toEqual({ count: 1, state: 'suspended' });
  await page.evaluate(() => window.__room?.dispose());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { rainSources: AudioBufferSourceNode[] }).rainSources.find(
            (source) => source.loop && (source.buffer?.duration ?? 0) > 100,
          )?.context.state,
      ),
    )
    .toBe('closed');
  expect(errors).toEqual([]);
});

test('storm flashes illuminate the room and clear immediately under reduced motion', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = trackErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/room-lab.html?clean&view=room&mood=rose');
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 0.7, dust: 0.3 }));
  await page.waitForFunction(() => !window.__roomLab?.room.stats.backgroundPending);
  const calm = await page.locator('#stage canvas').screenshot();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => (window.__roomLab?.room.stats.lightning ?? 0) > 0.65, null, { timeout: 25_000 });
  const flash = await page.locator('#stage canvas').screenshot();
  // Away from the glass: the rug and floor must catch the light, not just the exterior plate.
  const brightness = async (image: Buffer) => {
    const stats = await sharp(image).extract({ left: 550, top: 710, width: 460, height: 180 }).stats();
    return stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  };
  expect(await brightness(flash)).toBeGreaterThan((await brightness(calm)) + 5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.__roomLab?.room.stats.lightning)).toBe(0);
  await page.waitForTimeout(200);
  // The room goes on drawing its sixty frames, and under reduced motion each is the same picture: the flash is
  // gone, and the rain, the dust and the lava lamp stand still.
  expect(await pixelsChanged(page, page.locator('#stage canvas'), 400), 'pixels moving under reduced motion').toBe(0);
  expect(await page.evaluate(() => window.__roomLab?.room.stats.lightning)).toBe(0);
  expect(await page.evaluate(() => window.__roomLab?.room.stats.lavaRunning)).toBe(false);
  await expectSixtyFrames(page, 'under reduced motion');
  expect(errors).toEqual([]);
});
