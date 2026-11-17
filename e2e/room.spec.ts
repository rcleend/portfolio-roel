import { expect, test } from '@playwright/test';
import hotspots from '../src/app/cursors/hotspots.json' with { type: 'json' };
import { GPU_LAUNCH_ARGS } from './gpu';
import { differingPixels, hostElement, paused, scene, trackErrors, waitForRunning } from './helpers';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

/** Centre of the TV picture in the 1440 × 900 room view (see scripts/room-shots.mjs). */
const TV_IN_ROOM_VIEW = { x: 1202, y: 529 };
/** Centre of the computer's picture in the 1440 × 900 room view: the lab's `room.anchors`. */
const PC_IN_ROOM_VIEW = { x: 375, y: 455 };
/** Bare wall beside the window, outside every prop in the room and at the computer. */
const WALL = { x: 40, y: 450 };
/** The radio and the cabinet it stands on in the 1440 × 900 room view (`room.anchors` puts the radio at 814, 447). */
const RADIO_IN_ROOM_VIEW = { x: 805, y: 446 };
const CABINET_IN_ROOM_VIEW = { x: 780, y: 545 };

test('opens on the startup still, starts the game on it and hands over to the live room on a press', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // Each startup phase as #game enters it, with whether the game was exposed by then: read in the page, because the
  // tube warms up for a third of a second, which a loaded machine's polling from here can miss whole.
  await page.addInitScript(() => {
    const phases: { phase: string; game: boolean }[] = [];
    (window as unknown as { __phases: typeof phases }).__phases = phases;
    new MutationObserver(() => {
      const now = document.getElementById('game')?.dataset.phase;
      if (now && now !== phases.at(-1)?.phase) phases.push({ phase: now, game: window.__arcade !== undefined });
    }).observe(document, { subtree: true, childList: true, attributeFilter: ['data-phase'] });
  });
  await page.goto('/?seed=1');
  const still = page.locator('#tv-still');
  await expect(still).toHaveAttribute('data-shown', 'true');
  await expect(hostElement(page)).toHaveAttribute('data-host', 'room');

  await waitForRunning(page);
  // While the tube warmed up the game had not been started (or exposed) yet.
  const phases = await page.evaluate(
    () => (window as unknown as { __phases: { phase: string; game: boolean }[] }).__phases,
  );
  expect(phases.map((entry) => entry.phase).slice(-2)).toEqual(['powering', 'running']);
  expect(phases.find((entry) => entry.phase === 'powering')?.game).toBe(false);
  expect(['boot', 'title']).toContain(await scene(page));
  expect(await paused(page)).toBe(false);
  // The room is in, its tube lit at once behind the still, which waits for the visitor.
  expect(await page.evaluate(() => window.__room?.powerState)).toBe('on');
  await expect(still).toHaveAttribute('data-shown', 'true');
  // The game's picture is on the still's glass, not under its casing: without it that part of the page looks
  // different nearly everywhere.
  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('title');
  const picture = page.locator('.still-picture');
  const box = await picture.boundingBox();
  const clip = { x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 0, height: box?.height ?? 0 };
  // The title comes up out of the dark, so the picture is looked at until it is there.
  const lit = async (): Promise<number> => {
    const shown = await page.screenshot({ clip });
    await picture.evaluate((element) => (element as HTMLElement).style.setProperty('visibility', 'hidden'));
    const hidden = await page.screenshot({ clip });
    await picture.evaluate((element) => (element as HTMLElement).style.removeProperty('visibility'));
    return differingPixels(shown, hidden, 24);
  };
  await expect.poll(lit, { timeout: 10_000 }).toBeGreaterThan(clip.width * clip.height * 0.5);
  await page.keyboard.press('Enter');
  await expect(still).toHaveAttribute('data-shown', 'false');
  expect(errors).toEqual([]);
});

test('looking around the room pauses the game and the TV resumes it', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);

  await page.mouse.click(WALL.x, WALL.y);
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect.poll(() => paused(page)).toBe(true);
  const frame = await page.evaluate(() => window.__arcade?.state().frame);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__arcade?.state().frame)).toBe(frame);

  await page.waitForTimeout(1300); // let the camera land before aiming at the TV
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('Enter on the stage returns from the room view', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.mouse.click(WALL.x, WALL.y);
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
});

test('clicking the computer sits down at it and clicking the wall gets up again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const screen = page.locator('[data-pc-screen]');
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);

  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect.poll(() => paused(page)).toBe(true);
  const frame = await page.evaluate(() => window.__arcade?.state().frame);
  await expect(screen).toHaveAttribute('data-live', 'true', { timeout: 3_000 });
  expect(await page.evaluate(() => window.__arcade?.state().frame)).toBe(frame);

  await page.mouse.click(WALL.x, WALL.y);
  // Hidden in the same task as the click, before any flight frame.
  expect(await screen.getAttribute('data-live')).toBe('false');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('Escape during the flight to the computer returns to the room without showing the screen', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.evaluate(() => {
    const seen: string[] = [];
    const screen = document.querySelector('[data-pc-screen]');
    new MutationObserver(() => seen.push(screen?.getAttribute('data-live') ?? '')).observe(screen as Element, {
      attributeFilter: ['data-live'],
    });
    (window as unknown as { __liveSeen: string[] }).__liveSeen = seen;
  });
  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'pc');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as unknown as { __liveSeen: string[] }).__liveSeen)).not.toContain('true');
  await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'false');
});

test('the TV view keeps its way out when the room guide never loads', async ({ page }) => {
  await page.route('**/guide/RoomGuide.tsx*', (route) => route.abort());
  const failed = page.waitForEvent('console', (message) => message.text().includes("The room's guide failed to load"));
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const lookAround = page.getByRole('button', { name: 'Explore the room' });
  // One button, before the guide is due and once its import has failed for good.
  await expect(lookAround).toHaveCount(1);
  await failed;
  await expect(lookAround).toHaveCount(1);

  await page.keyboard.press('Tab');
  await expect(lookAround).toBeFocused();
  // Out of sight until then: a focus shows it as a pill.
  const pill = await lookAround.boundingBox();
  expect(pill?.width ?? 0).toBeGreaterThan(100);
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect(host).toBeFocused();
});

test('the guide takes the keyboard over from the way out it replaces', async ({ page }) => {
  // Held back until the keyboard is standing on the entry's way out, so the guide's own hint takes its place under
  // it (for as long as that takes: on a loaded machine a fixed two seconds let the guide in first).
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/guide/RoomGuide.tsx*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const wayOut = page.locator('.way-out');
  await expect(wayOut).toBeAttached();
  await page.keyboard.press('Tab');
  await expect(wayOut).toBeFocused();
  release();

  const hint = page.locator('.tv-way-out');
  await expect(hint).toBeAttached({ timeout: 10_000 });
  await expect(wayOut).toHaveCount(0);
  await expect(hint).toBeFocused();
  // Still the way out: it leads to the room from there.
  await page.keyboard.press('Enter');
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
});

test('the keyboard reaches the computer and the TV without the mouse', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const lookAround = page.getByRole('button', { name: 'Explore the room' });
  // The room's guide loads at idle once the picture is up, and its own hint takes the entry's way out's place.
  await expect(page.locator('.tv-way-out')).toBeAttached();
  await page.keyboard.press('Tab');
  await expect(lookAround).toBeFocused();
  await expect(lookAround).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect(host).toBeFocused();
  await page.waitForTimeout(1300);

  await page.keyboard.press('Tab');
  const computer = page.getByRole('button', { name: 'About me (CV)', exact: true });
  await expect(computer).toHaveAccessibleDescription('Read it at the computer.');
  await expect(computer).toBeFocused();
  await expect(computer).toBeVisible();
  // Focusing an item lights its prop, as pointing at it does.
  await expect.poll(() => page.evaluate(() => window.__room?.spotlight.lit?.target)).toBe('pc');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'true', { timeout: 3_000 });
  await expect(page.getByRole('navigation', { name: "Roel's room" })).toHaveCount(0);
  expect(await page.evaluate(() => window.__room?.spotlight.lit ?? null)).toBeNull();

  // Escape on the stage gets up again.
  await host.focus();
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  for (let press = 0; press < 3; press++) await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Play game', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
});

test('pointing at a prop lights it, labels it and lights its menu item; the menu lights the prop back', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.mouse.move(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(() => page.evaluate(() => window.__room?.spotlight.lit?.target)).toBe('tv');
  await expect(page.locator('.prop-label')).toHaveAttribute('data-shown', 'true');
  await expect(page.locator('.prop-label')).toHaveText('Game');
  await expect(page.locator('.overview__item[data-target="tv"]')).toHaveAttribute('data-lit', 'true');
  // The label stands over the TV.
  const label = await page.locator('.prop-label__word').boundingBox();
  expect(Math.abs((label?.x ?? 0) + (label?.width ?? 0) / 2 - TV_IN_ROOM_VIEW.x)).toBeLessThan(80);
  expect(label?.y ?? 0).toBeLessThan(TV_IN_ROOM_VIEW.y);

  await page.getByRole('button', { name: 'About me (CV)' }).hover();
  await expect.poll(() => page.evaluate(() => window.__room?.spotlight.lit?.target)).toBe('pc');
  await expect(page.locator('.prop-label')).toHaveText('About');
  await page.mouse.move(WALL.x, WALL.y);
  await expect.poll(() => page.evaluate(() => window.__room?.spotlight.lit ?? null)).toBeNull();
  await expect(page.locator('.prop-label')).toHaveAttribute('data-shown', 'false');
  expect(errors).toEqual([]);
});

test('a prop under the pointer comes before the menu item the keyboard has', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  await expect(page.locator('.tv-way-out')).toBeAttached();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Tab');
  const resume = page.getByRole('button', { name: 'About me (CV)', exact: true });
  await expect(resume).toBeFocused();
  const lit = () => page.evaluate(() => window.__room?.spotlight.lit?.target ?? null);
  await expect.poll(lit).toBe('pc');

  // Reaching for the TV with the mouse shows the TV, though the menu item keeps the keyboard.
  await page.mouse.move(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(lit).toBe('tv');
  await expect(resume).toBeFocused();
  // Off every prop again: the focused item's own prop lights back up.
  await page.mouse.move(WALL.x, WALL.y);
  await expect.poll(lit).toBe('pc');
});

test('the game takes keys only while the TV has focus', async ({ page }) => {
  await page.goto('/?seed=1&scene=title&frames=60');
  await waitForRunning(page);
  await page.evaluate(() => window.__arcade?.resume());
  const stage = page.getByRole('application');
  await expect(stage).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Skip to résumé' })).toBeFocused();
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  expect(await scene(page)).toBe('title');

  await page.keyboard.press('Tab');
  await expect(stage).toBeFocused();
  await page.keyboard.press('z');
  await expect.poll(() => scene(page), { timeout: 5_000 }).toBe('characterSelect');
});

test('the sound starts off on a first visit; the toggle is reachable by keyboard and remembers the choice', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const toggle = page.locator('.sound-toggle');
  // Past the TV view's "Explore the room", once the room's guide has loaded.
  await expect(page.locator('.tv-way-out')).toBeAttached();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  // Named for what it does next, the words beside the speaker for a mouse.
  await expect(toggle).toHaveAccessibleName('Unmute me');
  await expect(toggle).toHaveText('Unmute me');
  await expect(toggle.locator('.sound-toggle__label')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAccessibleName('Mute me');
  await expect(toggle).toHaveText('Mute me');
  const session = await page.evaluate(() => window.__arcade?.state().session);
  expect(session).toMatchObject({ muted: false });

  await page.reload();
  await waitForRunning(page);
  await expect(page.locator('.sound-toggle')).toHaveAccessibleName('Mute me');
});

test('the TV view\'s way out: "Explore the room" from the first press, "Back to the room" once back from the room', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const wayOut = page.locator('.tv-way-out');
  await expect(wayOut).toBeAttached();
  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('title');
  await expect(wayOut).toHaveAttribute('data-shown', 'false');
  // The first press begins: it is there at once, the way back's pill without its key.
  await page.keyboard.press('Shift');
  await expect(wayOut).toHaveAttribute('data-shown', 'true');
  await expect(wayOut).toHaveText('Explore the room');
  await expect(wayOut).not.toHaveAttribute('aria-keyshortcuts');
  await expect(wayOut.locator('.back-button__key')).toHaveCount(0);
  const pill = await wayOut.boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect((pill?.y ?? 0) + (pill?.height ?? 0)).toBeGreaterThan(height - 80);
  await wayOut.click();
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await expect(wayOut).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: "Roel's room" })).toBeVisible();

  // Back at the TV it rises a beat after the camera lands, as the other ways back do, and says so.
  await page.waitForTimeout(1300);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect(wayOut).toHaveAttribute('data-shown', 'true', { timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'Back to the room' })).toHaveCount(1);
  await expect(wayOut).toHaveText('Back to the room');
});

test('the computer and the radio have a way back to the room, by pointer and by keyboard', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const back = page.getByRole('button', { name: 'Back to the room' });
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect(back).toBeVisible({ timeout: 5_000 });
  await expect(back).toHaveAttribute('aria-keyshortcuts', 'Escape');
  // The key on its own keycap, pressed while the button holds the focus.
  await back.focus();
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect(back).toBeHidden();

  await page.waitForTimeout(1300);
  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect(back).toBeVisible({ timeout: 5_000 });
  await back.click();
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect(back).toBeHidden();

  await page.waitForTimeout(1300);
  await page.mouse.click(RADIO_IN_ROOM_VIEW.x, RADIO_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'radio');
  await expect(back).toBeVisible({ timeout: 5_000 });
  // The keyboard lands on the CDs; past them and the player's keys comes the way back.
  await expect(page.getByRole('toolbar', { name: 'CDs' }).getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  expect(errors).toEqual([]);
});

test('the radio and the cabinet it stands on fly to the CD player; Escape and the wall get up again', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.mouse.move(RADIO_IN_ROOM_VIEW.x, RADIO_IN_ROOM_VIEW.y);
  expect(await page.evaluate(() => document.querySelector('[data-host] canvas')?.getAttribute('style'))).toContain(
    'zoom-in',
  );
  await page.mouse.click(RADIO_IN_ROOM_VIEW.x, RADIO_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'radio');
  await expect(host).toHaveAttribute('aria-label', /At the CD player/);
  expect(await paused(page)).toBe(true);
  await page.waitForTimeout(1400);
  await host.focus();
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.mouse.click(CABINET_IN_ROOM_VIEW.x, CABINET_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'radio');
  await page.waitForTimeout(1400);
  await page.mouse.click(WALL.x, 120);
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('the keyboard reaches the radio from the room view', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await expect(page.locator('.tv-way-out')).toBeAttached();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  for (let press = 0; press < 2; press++) await page.keyboard.press('Tab');
  const radio = page.getByRole('button', { name: 'Music by me', exact: true });
  await expect(radio).toBeFocused();
  await expect(radio).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'radio');
  await expect(host).toBeFocused();
  await expect(page.getByRole('navigation', { name: "Roel's room" })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
});

/**
 * The image and the hotspot the engine resolved out of a computed `cursor` value: its fallback list split on the
 * commas outside image-set()/url(), then the two numbers after the entry that draws `name`'s PNG. `undefined` when
 * nothing in the list draws it. src/app/cursors/hotspots.json is scripts/build-cursors.ts's output contract.
 */
function resolvedHotspot(cursor: string, name: string): string | undefined {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < cursor.length; at++) {
    const char = cursor[at];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      entries.push(cursor.slice(start, at));
      start = at + 1;
    }
  }
  entries.push(cursor.slice(start));
  // The leading slash keeps "hand" off "game-hand"; the suffixes allow the 2x image and a hashed build name.
  const draws = new RegExp(`/${name}(@[23]x)?(-[\\w]+)?\\.png`);
  const entry = entries.find((candidate) => draws.test(candidate));
  return entry?.slice(entry.lastIndexOf(')') + 1).trim();
}

test("the pointer hides until the mouse moves, then wears the room's own cursors", async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const root = page.locator('html');
  const canvas = page.locator('[data-host] canvas');
  const drawn = () => canvas.evaluate((element) => getComputedStyle(element).cursor);
  /** The hotspot the engine resolved under the pointer, as "x y"; undefined when that image is not the cursor. */
  const pointsAt = async (name: keyof typeof hotspots) => resolvedHotspot(await drawn(), name);
  const generated = (name: keyof typeof hotspots) => `${hotspots[name].x} ${hotspots[name].y}`;
  await expect(root).toHaveAttribute('data-pointer', 'hidden');
  expect(await drawn()).toBe('none');
  // Over the TV's picture (the middle of the 1440 × 900 TV view, the title, where nothing is a button): the game's
  // own pixel arrow, at its point.
  await page.mouse.move(716, 376);
  await page.mouse.move(720, 380);
  await expect(root).not.toHaveAttribute('data-pointer');
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('play-arrow');
  expect(await pointsAt('game-arrow')).toBe(generated('game-arrow'));
  // Beside the TV a click leaves it: the leave cursor.
  await page.mouse.move(WALL.x, WALL.y);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('leave');
  expect(await pointsAt('leave')).toBe(generated('leave'));
  // In the room view a prop is a hand, the rest the room's arrow.
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.mouse.move(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('enter');
  expect(await pointsAt('hand')).toBe(generated('hand'));
  await page.mouse.move(WALL.x, 120);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('idle');
  expect(await pointsAt('arrow')).toBe(generated('arrow'));
});

/** The overview's grid, from the boxes the page lays out (round seven): one margin, a top and a bottom row, two columns. */
async function overviewGrid(page: import('@playwright/test').Page) {
  await page.addInitScript(() =>
    localStorage.setItem('reo-leo:view-hints', JSON.stringify({ lookedAround: true, toured: true })),
  );
  await page.goto('/?seed=1');
  await waitForRunning(page);
  await page.locator('.tv-way-out, .way-out').first().dispatchEvent('click');
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await expect.poll(() => page.evaluate(() => window.__room?.settled === true)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  return page.evaluate(() => {
    const box = (element: Element | null) => {
      const r = element?.getBoundingClientRect() ?? new DOMRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
      };
    };
    // The speaker's own round: on a mouse its words ride beside it in the toggle's pill.
    const toggle = box(document.querySelector('.sound-toggle'));
    const speaker = box(document.querySelector('.sound-toggle svg'));
    const mute = { ...toggle, cx: speaker.cx };
    const glyphs = [...document.querySelectorAll('.socials__glyph')].map(box);
    const items = [...document.querySelectorAll('.overview__item')].map(box);
    return { mute, glyphs, items, width: innerWidth, height: innerHeight };
  });
}

test('the overview keeps a strict grid: one margin, the top and bottom rows, the right column', async ({ page }) => {
  const { mute, glyphs, items, width, height } = await overviewGrid(page);
  const edge = mute.top;
  expect(width - mute.right).toBeCloseTo(edge, 0);
  // Top row: the menu on the toggle's centre line (its words' ink is nudged onto it: within a pixel).
  for (const item of items) expect(Math.abs(item.cy - mute.cy)).toBeLessThanOrEqual(1);
  // Bottom row: the marks on one centre line, as far from the bottom as the top row's is from the top.
  for (const glyph of glyphs) expect(glyph.cy).toBeCloseTo(height - mute.cy, 0);
  // Right column: the envelope's centre under the toggle's.
  expect(glyphs.at(-1)?.cx).toBeCloseTo(mute.cx, 0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the overview keeps the same grid: one margin, the marks on the bottom row', async ({ page }) => {
    const { mute, glyphs, width, height } = await overviewGrid(page);
    expect(width - mute.right).toBeCloseTo(mute.top, 0);
    for (const glyph of glyphs) expect(glyph.cy).toBeCloseTo(height - mute.cy, 0);
    // The marks centred along the bottom.
    expect(((glyphs[0]?.cx ?? 0) + (glyphs.at(-1)?.cx ?? 0)) / 2).toBeCloseTo(width / 2, 0);
  });
});

// Here, not in mouse-play.spec.ts: that suite plays on the flat host with the default software renderer, on which the
// room's bake is the CPU's, and a few such pages at once starved each other past the test's time.
test("in the room, the stage wears the game's cursors over the TV's picture in a level", async ({ page }) => {
  const query = new URLSearchParams({
    seed: '1',
    scene: 'level',
    params: JSON.stringify({ levelId: 'luna', characterId: 'hackerman', skipIntro: true }),
  });
  await page.goto(`/?${query}`);
  await waitForRunning(page);
  const canvas = page.locator('[data-host] canvas');
  const picture = await page.evaluate(() => (globalThis as { __tvPicture?: () => number[] }).__tvPicture?.());
  if (!picture) throw new Error('no TV picture');
  const [left = 0, top = 0, right = 0, bottom = 0] = picture;
  const at = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no stage');
    const px = box.x + left + ((x + 0.5) / 320) * (right - left);
    const py = box.y + top + ((y + 0.5) / 240) * (bottom - top);
    await page.mouse.move(px - 2, py - 2);
    await page.mouse.move(px, py);
  };
  // The hero stands at x 56 of San Francisco's first street: the sky (y 60) is an attack, the street (y 208) a walk.
  await expect
    .poll(async () => {
      await at(200, 60);
      return canvas.getAttribute('data-cursor');
    })
    .toBe('attack');
  await at(150, 208);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('walk');
  await at(20, 60);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('attack');
  await at(160, 232);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('play');
});
