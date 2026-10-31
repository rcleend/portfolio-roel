import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/radio/lab/main';
import { trackErrors } from './helpers';
import { audioRequests, sound, spyOnAudio, timePickToSound, waitAudible } from './radioAudio';

/**
 * The CD player on the radio lab's stand-in deck (radio-lab.html): the music, the keys,
 * the words and the controls, without the room. Real time, real media: Chromium streams
 * and plays the shelf's files. Everything runs under the strict autoplay policy, so
 * a play that is not inside a gesture fails here as it would on a phone.
 */
test.use({
  launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] },
  // A trace's DOM snapshots run scripts in the page, which counts as user activation and would let a play
  // that no gesture started through: keep the traces, without snapshots.
  trace: { mode: 'retain-on-failure', snapshots: false },
});

async function open(page: Page, query = 'view=radio'): Promise<void> {
  await page.goto(`/radio-lab.html?clean&${query}`);
  await expect.poll(() => page.evaluate(() => window.__radioLab?.loaded() ?? false)).toBe(true);
}

/** The radio's display, as the deck was last told. */
const lcd = (page: Page) => page.evaluate(() => window.__radioLab?.deck.state.lcd);
const announced = (page: Page) => page.locator('.radio__announcer');
const disc = (page: Page, id: string) => page.locator(`.fake-disc[data-disc="${id}"]`);
/** A key on the model (the room animates it and sends a press intent). */
const modelKey = (page: Page, key: string) => page.locator(`.fake-key[data-key="${key}"]`);

test('a pick starts silently in the gesture and is heard within a second, after the seat', async ({ page }) => {
  const errors = trackErrors(page);
  await spyOnAudio(page);
  const requests = audioRequests(page);
  await open(page);
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);

  await page.evaluate(() => {
    window.addEventListener(
      'pointerup',
      () => {
        // Just after the room's pick: the element exists, plays and is silent.
        setTimeout(() => {
          const element = window.__spy.audios[0];
          (window as unknown as { silentStart: unknown }).silentStart = element
            ? { paused: element.paused, volume: element.volume }
            : null;
        });
      },
      { capture: true, once: true },
    );
  });
  const elapsed = await timePickToSound(page, () => disc(page, 'gekke-synth-lange-frans').click());
  expect(await page.evaluate(() => (window as unknown as { silentStart: unknown }).silentStart)).toEqual({
    paused: false,
    volume: 0,
  });
  expect(elapsed).toBeGreaterThan(850);
  expect(elapsed).toBeLessThanOrEqual(1000);

  const seated = await page.evaluate(() => window.__radioLab?.events.find((event) => event.type === 'seated')?.at ?? 0);
  expect(seated).toBeGreaterThan(0);
  expect(new Set(requests)).toEqual(
    new Set(['/src/content/radio/albums/gekke-synth-lange-frans/gekke-synth-lange-frans-v2.m4a']),
  );
  await expect(announced(page)).toHaveText(
    'Playing gekkeSynthLangeFrans, track 1 of 1, from gekkeSynthLangeFrans by Roel Leenders.',
  );
  await expect.poll(() => lcd(page)).toMatchObject({ kind: 'track', track: 1, transport: 'playing' });
  expect(await page.evaluate(() => window.__spy.audios.length)).toBe(1);
  expect(await page.evaluate(() => window.__spy.decodes)).toBe(0);
  expect(errors).toEqual([]);
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the disc seats at once and the music starts within 0.35 s', async ({ page }) => {
    await spyOnAudio(page);
    await open(page);
    const elapsed = await timePickToSound(page, () => disc(page, 'its-all-in-your-head').click());
    expect(elapsed).toBeLessThanOrEqual(350);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test('the keys follow a CD player: pause, play, stop, next and previous', async ({ page }) => {
  const errors = trackErrors(page);
  await spyOnAudio(page);
  await open(page);
  await disc(page, 'gekke-synth-lange-frans').click();
  await waitAudible(page);
  await expect.poll(() => lcd(page)).toMatchObject({ kind: 'track', seconds: 1 });

  // ▷II on the model pauses (the model animates it; the player only answers).
  await modelKey(page, 'play-pause').click();
  await expect(announced(page)).toHaveText('Paused.');
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  const pausedAt = (await sound(page))?.time ?? 0;
  expect(await lcd(page)).toMatchObject({ kind: 'track', transport: 'paused' });

  // …and plays on from there.
  await modelKey(page, 'play-pause').click();
  await expect(announced(page)).toHaveText('Playing.');
  const resumed = await waitAudible(page);
  expect(resumed.time).toBeGreaterThanOrEqual(pausedAt - 0.05);
  expect(resumed.src).toMatch(/gekke-synth-lange-frans-v2\.m4a/);

  // A one-song disc: ⏭ has nowhere to go (the skip rules are unit-tested, playerState.test.ts); ⏮ after 3 s restarts it.
  await page.evaluate(() => {
    const element = window.__spy.audios[0];
    if (element) element.currentTime = 6;
  });
  await expect.poll(() => lcd(page)).toMatchObject({ track: 1, seconds: 6 });
  await modelKey(page, 'next').click();
  expect(await lcd(page)).toMatchObject({ track: 1 });
  await modelKey(page, 'previous').click();
  await expect.poll(async () => (await sound(page))?.time ?? 99).toBeLessThan(2);

  // The end of the song changes the disc, like a CD changer: the next on the shelf goes in and plays.
  await page.evaluate(() => {
    const element = window.__spy.audios[0];
    if (element) element.currentTime = element.duration - 0.4;
  });
  await expect.poll(async () => (await sound(page))?.src, { timeout: 5000 }).toMatch(/drop-the-bombs-v2\.m4a/);
  await waitAudible(page, 4000);
  await expect(announced(page)).toHaveText(/^Playing DROP THE BOMBS, track 1 of 1/);
  expect(await page.evaluate(() => window.__radioLab?.deck.state.loaded)).toBe('drop-the-bombs');

  // ■ stops, showing the disc's totals; ▷II plays the song from the top.
  await modelKey(page, 'stop').click();
  await expect(announced(page)).toHaveText('Stopped.');
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  expect(await lcd(page)).toEqual({ kind: 'total', tracks: 1, seconds: 280 });
  await modelKey(page, 'play-pause').click();
  const fromTop = await waitAudible(page);
  expect(fromTop.src).toMatch(/drop-the-bombs-v2\.m4a/);
  expect(fromTop.time).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('a swap fades the playing disc out before the source changes, and the latest pick wins', async ({ page }) => {
  await spyOnAudio(page);
  await open(page);
  await disc(page, 'its-all-in-your-head').click();
  await waitAudible(page);

  await disc(page, 'drop-the-bombs').click();
  // Still the old source, fading.
  await page.waitForTimeout(100);
  const fading = await sound(page);
  expect(fading?.src).toMatch(/its-all-in-your-head/);
  expect(fading?.volume).toBeLessThan(1);
  await expect.poll(async () => (await sound(page))?.src).toMatch(/drop-the-bombs/);
  // Picked mid-insert: the newest disc plays.
  await disc(page, 'midnight-mirage').click();
  const playing = await waitAudible(page);
  expect(playing.src).toMatch(/midnight-mirage\/midnight-mirage/);
  await expect(announced(page)).toHaveText(
    /^Playing Midnight Mirage, track 1 of 1, from Midnight Mirage by Roel Leenders\./,
  );
  expect(await page.evaluate(() => window.__spy.audios.length)).toBe(1);
});

test('the media session names the track and its controls drive the player', async ({ page }) => {
  await spyOnAudio(page);
  await open(page);
  await disc(page, 'async-002').click();
  await waitAudible(page);
  const metadata = await page.evaluate(() => {
    const data = navigator.mediaSession.metadata;
    return (
      data && {
        title: data.title,
        artist: data.artist,
        album: data.album,
        artwork: data.artwork.map((art) => ({ ...art })),
      }
    );
  });
  expect(metadata).toMatchObject({ title: 'Async_002', artist: 'Roel Leenders', album: 'Async_002' });
  expect(metadata?.artwork[0]).toMatchObject({ sizes: '512x512', type: 'image/webp' });
  expect(metadata?.artwork[0]?.src).toMatch(/^http:\/\/localhost:\d+\/.*async-002\/cover\.webp/);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');

  await page.evaluate(() => window.__spy.handlers.pause?.({ action: 'pause' }));
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  // The visitor is at the radio: its key moves for the media key too.
  expect(await page.evaluate(() => window.__radioLab?.events.some((event) => event.type === 'press'))).toBe(true);

  await page.evaluate(() => window.__spy.handlers.play?.({ action: 'play' }));
  expect((await waitAudible(page)).src).toMatch(/async-002-v2\.m4a/);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
});

test('keyboard only: choose a CD with the arrows, pause from the toolbar, Escape leaves', async ({ page }) => {
  const errors = trackErrors(page);
  await spyOnAudio(page);
  await open(page);
  const cds = page.getByRole('toolbar', { name: 'CDs' });
  await expect(
    cds.getByRole('button', { name: "It's all in your head by Roel Leenders ft. Bram Reker, 1 track" }),
  ).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const lowTide = cds.getByRole('button', { name: 'DROP THE BOMBS by Roel Leenders, 1 track' });
  await expect(lowTide).toBeFocused();
  // A keyboard focus brings the disc forward.
  await expect
    .poll(() => page.evaluate(() => window.__radioLab?.events.findLast((e) => e.type === 'attention')?.detail))
    .toBe('drop-the-bombs');
  await page.keyboard.press('Enter');
  await waitAudible(page);
  await expect(
    cds.getByRole('button', { name: 'DROP THE BOMBS by Roel Leenders, 1 track, in the player' }),
  ).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('Tab');
  const controls = page.getByRole('toolbar', { name: 'CD player controls' });
  await expect(controls.getByRole('button', { name: 'Pause' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(announced(page)).toHaveText('Paused.');
  await expect(controls.getByRole('button', { name: 'Play' })).toBeFocused();
  const presses = await page.evaluate(() =>
    window.__radioLab?.events.filter((e) => e.type === 'press').map((e) => e.detail),
  );
  expect(presses).toEqual(['play-pause']);
  await page.keyboard.press('ArrowRight');
  await expect(controls.getByRole('button', { name: 'Stop' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__radioLab?.deck.live)).toBe(false);
  const types = await page.evaluate(() => window.__radioLab?.events.map((event) => event.type) ?? []);
  expect(types).toContain('leave');
  expect(types).toContain('focusStage');
  await expect(page.locator('#backdrop')).toBeFocused();
  expect(errors).toEqual([]);
});

test('keys on an empty player ask for a CD', async ({ page }) => {
  await spyOnAudio(page);
  await open(page);
  await page.keyboard.press('Tab');
  const play = page.getByRole('toolbar', { name: 'CD player controls' }).getByRole('button', { name: 'Play' });
  await expect(play).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(announced(page)).toHaveText('Choose a CD first.');
  // Pressed again a moment later: the same words are still a change the live region speaks.
  await page.waitForTimeout(1100);
  await page.keyboard.press('Enter');
  await expect(announced(page)).toHaveText('Choose a CD first. ');
});

test('muted: the choice says the sound is off, and the music plays silently until unmuted', async ({ page }) => {
  await spyOnAudio(page);
  await open(page, 'view=radio&muted=1');
  await disc(page, 'its-all-in-your-head').click();
  await expect(announced(page)).toHaveText(
    "Playing It's all in your head, track 1 of 1, from It's all in your head by Roel Leenders ft. Bram Reker. Sound is off.",
  );
  await expect.poll(async () => (await sound(page))?.time ?? 0).toBeGreaterThan(0.3);
  expect((await sound(page))?.muted).toBe(true);
  await expect(page.locator('.radio__caption')).toContainText('Sound is off');
});

test('a song that cannot be played shows the error, says so and waits; another disc still plays', async ({ page }) => {
  await spyOnAudio(page);
  await page.route('**/its-all-in-your-head-v2.m4a*', (route) =>
    route.request().resourceType() === 'media' ? route.abort() : route.continue(),
  );
  await open(page);
  await disc(page, 'its-all-in-your-head').click();
  await expect(announced(page)).toHaveText('This track could not be played.');
  await expect.poll(() => lcd(page)).toEqual({ kind: 'error' });
  // A one-song disc has no next track to move on to: it stays on its error until the next action.
  await page.waitForTimeout(2500);
  expect(await lcd(page)).toEqual({ kind: 'error' });
  await disc(page, 'gekke-synth-lange-frans').click();
  expect((await waitAudible(page, 6000)).src).toMatch(/gekke-synth-lange-frans-v2\.m4a/);
});

test.describe('without a gesture', () => {
  test('a play the browser refuses asks for a press, and the press plays', async ({ page }) => {
    await spyOnAudio(page);
    // The lab picks as soon as the player has loaded, from a timer: no gesture, so the policy refuses. Nothing may
    // touch the page before that pick: Playwright's own calls into a page count as user activation.
    const refused = page.waitForEvent('console', (message) => message.text().includes('said "Press play to start'));
    await page.goto('/radio-lab.html?clean&view=radio&pick=its-all-in-your-head');
    await refused;
    await expect(announced(page)).toHaveText('Press play to start the music.');
    await expect.poll(() => lcd(page)).toMatchObject({ kind: 'track', transport: 'paused' });
    await page.getByRole('toolbar', { name: 'CD player controls' }).getByRole('button', { name: 'Play' }).focus();
    await page.keyboard.press('Enter');
    const playing = await waitAudible(page);
    expect(playing.src).toMatch(/its-all-in-your-head-v2\.m4a/);
    expect(playing.time).toBeLessThan(2);
  });
});

test('the TV takes the floor and gives it back, unless the visitor paused', async ({ page }) => {
  await spyOnAudio(page);
  await open(page);
  await disc(page, 'midnight-mirage').click();
  await waitAudible(page);
  await page.evaluate(() => window.__radioLab?.leave());
  await expect.poll(async () => (await sound(page))?.volume ?? 0).toBeCloseTo(0.79, 2);
  await page.evaluate(() => window.__radioLab?.setView('pc'));
  await expect.poll(async () => (await sound(page))?.volume ?? 0).toBeCloseTo(0.56, 2);
  await page.evaluate(() => window.__radioLab?.setView('tv'));
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  await page.evaluate(() => window.__radioLab?.setView('room'));
  await expect.poll(async () => (await sound(page))?.paused).toBe(false);
  await expect.poll(async () => (await sound(page))?.volume ?? 0).toBeCloseTo(0.79, 2);
  // Paused by the visitor, it stays paused through a visit to the TV.
  await page.evaluate(() => window.__spy.handlers.pause?.({ action: 'pause' }));
  await page.evaluate(() => window.__radioLab?.setView('tv'));
  await page.evaluate(() => window.__radioLab?.setView('room'));
  await page.waitForTimeout(600);
  expect((await sound(page))?.paused).toBe(true);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one large play key under its curved title, the way back in the top row; insets for both, and it leaves', async ({
    page,
  }) => {
    await spyOnAudio(page);
    await open(page);
    const bar = page.getByRole('toolbar', { name: 'CD player controls' });
    await expect(bar).toBeVisible();
    // No skip keys: the discs are picked from the shelf, and each song ends into the next disc.
    await expect(bar.getByRole('button')).toHaveCount(2);
    const play = bar.getByRole('button', { name: 'Play' });
    const back = bar.getByRole('button', { name: 'Back to the room' });
    const playBox = await play.boundingBox();
    expect(playBox).toMatchObject({ width: 80, height: 80 });
    expect((playBox?.x ?? 0) + (playBox?.width ?? 0) / 2).toBeCloseTo(195, 0);
    // The way back sits in the sound toggle's row, exactly its height (the lab has no toggle: the row's own values).
    const backBox = await back.boundingBox();
    expect(backBox?.height).toBeCloseTo(44, 0);
    expect(backBox?.x).toBeLessThan(40);
    expect(backBox?.y).toBeLessThan(40);

    // "Some songs I made" curves round the play key's top, concentric with it, while nothing plays.
    const title = bar.locator('.radio-bar__title');
    await expect(title).toHaveAttribute('data-shown', 'true');
    await expect(title.locator('textPath')).toHaveText('Some songs I made');
    const titleBox = await title.boundingBox();
    expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0) / 2).toBeCloseTo((playBox?.x ?? 0) + 40, 0);
    expect((titleBox?.y ?? 0) + (titleBox?.height ?? 0) / 2).toBeCloseTo((playBox?.y ?? 0) + 40, 0);
    await expect(page.getByRole('heading', { name: 'Some songs I made' })).toBeAttached();

    const insets = (await page.evaluate(
      () => window.__radioLab?.events.findLast((e) => e.type === 'insets')?.detail,
    )) as { top: number; bottom: number; left: number; right: number } | undefined;
    expect(insets?.bottom).toBeGreaterThan(100);
    expect(insets?.top).toBeGreaterThan(40);
    expect(insets).toMatchObject({ left: 0, right: 0 });

    // Play on an empty player puts the first disc in.
    await play.tap();
    expect((await waitAudible(page)).src).toMatch(/its-all-in-your-head-v2\.m4a/);
    // Playing: the title goes; the key stands alone, and its name says what it pauses (nothing written beside it).
    await expect(title).toHaveAttribute('data-shown', 'false');
    await expect(bar.locator('p')).toHaveCount(0);
    await expect(
      bar.getByRole('button', { name: "Pause It's all in your head, by Roel Leenders ft. Bram Reker", exact: true }),
    ).toBeVisible();
    await bar.getByRole('button', { name: 'Pause' }).tap();
    await expect.poll(async () => (await sound(page))?.paused).toBe(true);
    // Paused: the title again, and the key's name says what it plays.
    await expect(
      bar.getByRole('button', { name: "Play It's all in your head, by Roel Leenders ft. Bram Reker", exact: true }),
    ).toBeVisible();
    await expect(title).toHaveAttribute('data-shown', 'true');
    expect(
      await page.evaluate(() => window.__radioLab?.events.filter((e) => e.type === 'press').map((e) => e.detail)),
    ).toEqual(['play-pause']);
    await back.tap();
    await expect.poll(() => page.evaluate(() => window.__radioLab?.deck.live)).toBe(false);
  });

  test.describe('held sideways', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('the way back and the play key go down a right rail, which reports its width', async ({ page }) => {
      await open(page);
      const rail = page.getByRole('toolbar', { name: 'CD player controls' });
      const box = await rail.boundingBox();
      expect(box?.y).toBe(68);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeCloseTo(844, 0);
      for (const button of await rail.getByRole('button').all()) {
        const size = await button.boundingBox();
        expect(Math.min(size?.width ?? 0, size?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
      const insets = await page.evaluate(() => window.__radioLab?.events.findLast((e) => e.type === 'insets')?.detail);
      expect(insets).toEqual({ top: 0, left: 0, right: box?.width, bottom: 0 });
    });
  });
});

test('loads nothing before the visitor has looked around the room for a while, then prefetches at idle', async ({
  page,
}) => {
  const modules: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('RadioExperience') || request.resourceType() === 'media') modules.push(request.url());
  });
  await page.goto('/radio-lab.html?clean');
  // The lab opens settled in the room view: the room's half first, 0.4 s on; the player 3 s on.
  await page.waitForTimeout(2600);
  expect(modules).toEqual([]);
  const prefetch = await page.evaluate(() => window.__radioLab?.events.find((event) => event.type === 'prefetch'));
  expect(prefetch?.detail).toBe('idle');
  // The lab mounts once its scripts have run: never before the document was interactive, always before it loaded.
  const timing = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return { interactive: entry?.domInteractive ?? 0, loaded: entry?.loadEventEnd ?? 0 };
  });
  expect((prefetch?.at ?? 0) - timing.interactive).toBeGreaterThanOrEqual(400);
  expect((prefetch?.at ?? 0) - timing.loaded).toBeLessThan(1000);
  await expect.poll(() => page.evaluate(() => window.__radioLab?.loaded() ?? false), { timeout: 6000 }).toBe(true);
  expect(modules.some((url) => url.includes('RadioExperience'))).toBe(true);
  expect(modules.filter((url) => !url.includes('RadioExperience'))).toEqual([]);
});

test('with Save-Data, nothing is prefetched', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
  });
  await page.goto('/radio-lab.html?clean');
  await page.waitForTimeout(4500);
  expect(await page.evaluate(() => window.__radioLab?.loaded())).toBe(false);
  expect(await page.evaluate(() => window.__radioLab?.events.some((event) => event.type === 'prefetch'))).toBe(false);
});

test('the mechanical sounds render clean, at their level, and die away', async ({ page }) => {
  await open(page);
  const { cues, levels } = await page.evaluate(() => ({
    cues: [...(window.__radioLab?.foleyCues ?? [])],
    levels: { ...window.__radioLab?.foleyLevels },
  }));
  expect(cues.length).toBeGreaterThan(15);
  for (const cue of cues) {
    const orders = cue === 'disc-rise' || cue === 'disc-sink' ? [0, 4, 11] : [0];
    for (const order of orders) {
      const report = await page.evaluate(([name, at]) => window.__radioLab?.measureFoley(name, at), [
        cue,
        order,
      ] as const);
      if (!report) throw new Error(`no report for ${cue}`);
      expect(report.nonFinite, cue).toBe(0);
      expect(report.peakDb, cue).toBeLessThan(-1);
      expect(Math.abs(report.peakDb - (levels[cue] ?? 0)), `${cue} near its level`).toBeLessThanOrEqual(3);
      expect(report.lengthSeconds, cue).toBeLessThanOrEqual(cue.startsWith('spin') ? 1.5 : 1.2);
      expect(report.tailPeakDb, `${cue} has ended`).toBeLessThan(-60);
    }
  }
});

test('one element, and no more audio contexts than the game’s and the radio’s own', async ({ page }) => {
  await spyOnAudio(page);
  await open(page);
  await disc(page, 'its-all-in-your-head').click();
  await waitAudible(page);
  await disc(page, 'drop-the-bombs').click();
  await waitAudible(page);
  await page.evaluate(() => window.__radioLab?.leave());
  await page.evaluate(() => window.__radioLab?.fly(true));
  await modelKey(page, 'stop').click();
  expect(await page.evaluate(() => window.__spy.audios.length)).toBe(1);
  // The lab opens one on the first gesture, as the site does for the game; the radio adds one for its mechanics.
  expect(await page.evaluate(() => window.__spy.contexts)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.__spy.decodes)).toBe(0);
});
