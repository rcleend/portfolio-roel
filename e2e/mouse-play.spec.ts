import { expect, type Page, test } from '@playwright/test';
import hotspots from '../src/app/cursors/hotspots.json' with { type: 'json' };
import type { LevelProbe } from '../src/game/scenes/level/probe';
import { scene, trackErrors, waitForRunning } from './helpers';

/**
 * Playing a level with the mouse alone (docs/ARCHITECTURE.md › Mouse play): a click attacks the way it points, a
 * double click on a floor walks there and jumps where the way needs it, the strip's keys are buttons and the cursor
 * says which of those a click would do. Everything here goes through the page's mouse on the flat host's screen;
 * the level's probe (development builds) only says where things are, as the screen would.
 */

const GROUND = 208;
const SKY = 60;

async function openLevel(page: Page, params: Record<string, unknown>): Promise<void> {
  const query = new URLSearchParams({
    host: 'flat',
    seed: '1',
    scene: 'level',
    frames: '0',
    params: JSON.stringify({ characterId: 'hackerman', skipIntro: true, ...params }),
  });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__arcadeReady === true);
}

async function step(page: Page, frames = 1): Promise<void> {
  await page.evaluate((count) => window.__arcade?.step(count), frames);
}

async function probe(page: Page): Promise<LevelProbe> {
  const level = await page.evaluate(() => window.__arcade?.level() ?? null);
  if (!level) throw new Error('not in a level');
  return level;
}

/** The page point over native pixel (x, y) of the flat host's screen. */
async function pagePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('.tv__canvas').boundingBox();
  if (!box) throw new Error('no screen');
  const scale = box.width / 320;
  return { x: box.x + (x + 0.5) * scale, y: box.y + (y + 0.5) * scale };
}

async function hover(page: Page, x: number, y: number): Promise<void> {
  const point = await pagePoint(page, x, y);
  await page.mouse.move(point.x, point.y);
  await step(page);
}

async function click(page: Page, x: number, y: number): Promise<void> {
  const point = await pagePoint(page, x, y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await step(page, 3);
  await page.mouse.up();
  await step(page);
}

/** Two clicks on one spot a few frames apart, as a hand double-clicks. */
async function doubleClick(page: Page, x: number, y: number): Promise<void> {
  await click(page, x, y);
  await step(page, 3);
  await click(page, x, y);
}

/** Mouse play arrives as its own chunk: wait until the play under the pointer wears its cursors. */
async function waitForMousePlay(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      await hover(page, 300, SKY);
      return (await probe(page)).cursor;
    })
    .toMatch(/^attack-/);
}

/** Steps until `done` holds of the level (at most `frames`). */
async function stepUntil(page: Page, done: (level: LevelProbe) => boolean, frames = 900): Promise<LevelProbe> {
  for (let stepped = 0; stepped < frames; stepped += 5) {
    const level = await probe(page);
    if (done(level)) return level;
    await step(page, 5);
  }
  return probe(page);
}

const heroOnScreen = (level: LevelProbe): number => level.player.x - level.view.x;

/** Rides San Francisco's cable car across the big spam folder from the first checkpoint, double-clicking as a visitor would. */
async function rideTheCableCar(page: Page): Promise<LevelProbe> {
  let level = await probe(page);
  // Its roof at home (columns 72–77, the walkable top at y 157).
  await doubleClick(page, 1200 - level.view.x, 160);
  level = await stepUntil(page, (now) => now.player.feet === 157 && now.player.grounded);
  // Riding across, the far street comes into view: a double click there steps off once the car docks.
  level = await stepUntil(page, (now) => 1460 - now.view.x < 300, 900);
  await doubleClick(page, 290, GROUND);
  return stepUntil(page, (now) => !now.walking, 900);
}

/** Double-clicks the floor near the right of the screen until world x `x` is in view. */
async function walkUntilInView(page: Page, x: number): Promise<LevelProbe> {
  let level = await probe(page);
  for (let tries = 0; tries < 6 && x - level.view.x > 290; tries++) {
    await doubleClick(page, 290, GROUND);
    level = await stepUntil(page, (now) => !now.walking, 600);
  }
  return level;
}

/** The hotspot a computed `cursor` value draws `name`'s PNG at (see e2e/room.spec.ts's `resolvedHotspot`). */
function hotspotOf(cursor: string, name: string): string | undefined {
  const match = new RegExp(`/${name}(@2x)?(-[\\w-]+)?\\.png[^)]*\\)[^)]*\\)\\s*(\\d+ \\d+)`).exec(cursor);
  return match?.[3];
}

test('a click turns the hero to it and attacks that way, and a double click in the air fires once', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // From the first checkpoint, the hero a little left of the middle of the screen.
  await openLevel(page, { levelId: 'luna', startAt: 0 });
  await waitForMousePlay(page);
  let level = await probe(page);
  const hero = heroOnScreen(level);
  const fired = level.fired;
  await click(page, hero - 60, SKY);
  level = await probe(page);
  expect(level.player.facing).toBe(-1);
  expect(level.fired).toBe(fired + 1);
  expect(level.shots.at(-1)?.vx).toBeLessThan(0);
  await step(page, 30);
  await click(page, hero + 60, SKY);
  level = await probe(page);
  expect(level.player.facing).toBe(1);
  expect(level.shots.at(-1)?.vx).toBeGreaterThan(0);
  await step(page, 30);
  const before = (await probe(page)).fired;
  await doubleClick(page, hero + 60, SKY);
  await step(page, 30);
  expect((await probe(page)).fired).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('a double click walks there, jumping by itself onto the cable car, off it across the pit and up a girder', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // From San Francisco's first checkpoint: the cable car waits over the big spam folder.
  await openLevel(page, { levelId: 'luna', startAt: 0 });
  await waitForMousePlay(page);
  let level = await probe(page);
  const fired = level.fired;
  // The cable car's roof (columns 72–77 at home, its walkable top at y 157): a jump to board it.
  await hover(page, 1200 - level.view.x, 160);
  expect((await probe(page)).cursor).toBe('jump-right');
  await doubleClick(page, 1200 - level.view.x, 160);
  let airborne = false;
  level = await stepUntil(page, (now) => {
    airborne ||= !now.player.grounded;
    return now.player.grounded && now.player.feet === 157;
  });
  expect(airborne).toBe(true);
  expect(level.player.feet).toBe(157);
  // Riding across, the far street comes into view: a double click there steps off once the car docks.
  level = await stepUntil(page, (now) => 1460 - now.view.x < 300, 900);
  await doubleClick(page, 290, GROUND);
  const clicked = (await probe(page)).view.x + 290;
  level = await stepUntil(page, (now) => !now.walking, 900);
  expect(level.player.feet).toBe(200);
  // Where the second click pointed, give or take the pixels the camera rode on between the clicks.
  expect(Math.abs(level.player.x - clicked)).toBeLessThan(8);
  // The girder over the next street (columns 100–104, its top at y 152): a jump from under it.
  level = await walkUntilInView(page, 1680);
  await hover(page, 1640 - level.view.x, 155);
  expect((await probe(page)).cursor).toBe('jump-right');
  await doubleClick(page, 1640 - level.view.x, 155);
  level = await stepUntil(page, (now) => !now.walking, 600);
  expect(level.player.feet).toBe(152);
  // Walking never fired a shot.
  expect(level.fired).toBe(fired);
  expect(errors).toEqual([]);
});

test('a double click on a "?" block goes and head-butts it', async ({ page }) => {
  const errors = trackErrors(page);
  await openLevel(page, { levelId: 'luna', startAt: 0 });
  await waitForMousePlay(page);
  // Ride across first: the block over the street past the spam folder (column 103, row 5), over a girder.
  await rideTheCableCar(page);
  let level = await walkUntilInView(page, 1680);
  const block = level.blocks.find((candidate) => candidate.x === 1656);
  if (!block) throw new Error('no block at column 103');
  const highlights = level.highlights;
  await hover(page, block.x - level.view.x, block.y);
  expect((await probe(page)).cursor).toBe('jump-right');
  await doubleClick(page, block.x - level.view.x, block.y);
  level = await stepUntil(page, (now) => now.highlights > highlights, 600);
  expect(level.highlights).toBe(highlights + 1);
  // The career highlight's card opens over the level: any click closes it.
  expect(level.phase).toBe('card');
  expect(errors).toEqual([]);
});

test("the strip's keys are buttons: pointing lights one, pressing it presses its action", async ({ page }) => {
  const errors = trackErrors(page);
  await openLevel(page, { levelId: 'luna' });
  await step(page, 10);
  const key = async (action: string) => {
    const found = (await probe(page)).strip.find((candidate) => candidate.action === action);
    if (!found) throw new Error(`no ${action} key on the strip`);
    return { x: Math.round((found.from + found.to) / 2), y: 230, state: found.state };
  };
  const jump = await key('jump');
  await hover(page, jump.x, jump.y);
  expect((await key('jump')).state).toBe('hover');
  // Over the strip the cursor is the game's hand, never an attack.
  await expect(page.locator('.tv__screen')).toHaveAttribute('data-cursor', 'play');
  const point = await pagePoint(page, jump.x, jump.y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await step(page, 2);
  expect((await key('jump')).state).toBe('pressed');
  await step(page, 6);
  expect((await probe(page)).player.grounded).toBe(false);
  await page.mouse.up();
  await step(page, 60);
  // A click on JUMP is a full jump, not the hop a tap of a key is.
  const attack = await key('attack');
  const fired = (await probe(page)).fired;
  await click(page, attack.x, attack.y);
  expect((await probe(page)).fired).toBe(fired + 1);
  // MOVE's right key walks while held.
  const right = await key('right');
  const x = (await probe(page)).player.x;
  const there = await pagePoint(page, right.x, right.y);
  await page.mouse.move(there.x, there.y);
  await page.mouse.down();
  await step(page, 30);
  await page.mouse.up();
  await step(page, 10);
  expect((await probe(page)).player.x).toBeGreaterThan(x + 30);
  const pause = await key('pause');
  await click(page, pause.x, pause.y);
  expect((await probe(page)).phase).toBe('paused');
  expect(errors).toEqual([]);
});

test('the cursor says what a click would do there: walk, jump or attack, and which way', async ({ page }) => {
  await openLevel(page, { levelId: 'luna', startAt: 0 });
  await waitForMousePlay(page);
  const screen = page.locator('.tv__screen');
  const drawn = () => screen.evaluate((element) => getComputedStyle(element).cursor);
  const generated = (name: keyof typeof hotspots) => `${hotspots[name].x} ${hotspots[name].y}`;
  const level = await probe(page);
  const hero = heroOnScreen(level);
  const expectations: [number, number, keyof typeof hotspots][] = [
    [hero + 40, GROUND, 'walk-right'],
    [hero - 40, GROUND, 'walk-left'],
    [1200 - level.view.x, 160, 'jump-right'],
    [hero + 80, SKY, 'attack-right'],
    [hero - 50, SKY, 'attack-left'],
  ];
  for (const [x, y, name] of expectations) {
    await hover(page, x, y);
    await expect(screen).toHaveAttribute('data-cursor', name);
    // Drawn from the generated PNG at its exact hotspot.
    expect(hotspotOf(await drawn(), name)).toBe(generated(name));
  }
  await hover(page, 160, 230);
  await expect(screen).toHaveAttribute('data-cursor', 'play');
});

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
  // The hero stands at x 56 of San Francisco's first street: the sky right of it is an attack that way.
  await expect
    .poll(async () => {
      await at(200, SKY);
      return canvas.getAttribute('data-cursor');
    })
    .toBe('attack-right');
  await at(150, GROUND);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('walk-right');
  await at(20, SKY);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('attack-left');
  await at(160, 232);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('play');
});

/**
 * A visitor with only a mouse, playing a whole mission: holds the button on whoever is unhappy in reach,
 * double-clicks the "?" blocks and otherwise the farthest floor ahead the cursor says it can walk to, and clicks the
 * highlight cards away.
 */
async function playWithTheMouse(page: Page): Promise<void> {
  let holding = 0;
  const ignored = new Map<number, number>();
  for (let turn = 0; turn < 3000 && (await scene(page)) === 'level'; turn++) {
    const level = await page.evaluate(() => window.__arcade?.level() ?? null);
    if (!level || (level.phase !== 'play' && level.phase !== 'card')) {
      await step(page, 10);
      continue;
    }
    if (level.phase === 'card') {
      await step(page, 40);
      await click(page, 160, 120);
      await step(page, 20);
      continue;
    }
    const { player, view } = level;
    const onScreen = (x: number) => x - view.x > 6 && x - view.x < 314;
    const unhappy = level.customers.filter((customer) => customer.unhappy && onScreen(customer.x));
    const target =
      unhappy.find((customer) => customer.escalated) ??
      unhappy
        .filter(
          (customer) =>
            Math.abs(customer.x - player.x) < 170 &&
            Math.abs(customer.feet - player.feet) < 20 &&
            (ignored.get(Math.round(customer.feet * 1000 + customer.y)) ?? -1) < turn,
        )
        .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    if (target && holding < 40) {
      const point = await pagePoint(page, target.x - view.x, target.y - view.y);
      await page.mouse.move(point.x, point.y);
      if (holding === 0) await page.mouse.down();
      holding++;
      await step(page, 6);
      continue;
    }
    if (holding > 0) {
      await page.mouse.up();
      if (target) ignored.set(Math.round(target.feet * 1000 + target.y), turn + 60);
      holding = 0;
    }
    if (level.walking) {
      await step(page, 6);
      continue;
    }
    const goal = await nextGoal(page, level);
    if (goal) await doubleClick(page, goal.x, goal.y);
    else await step(page, 6);
  }
  if (holding > 0) await page.mouse.up();
}

/** Where to double-click next: an unopened block the cursor shows a way to, else the farthest floor it shows ahead. */
async function nextGoal(page: Page, level: LevelProbe): Promise<{ x: number; y: number } | null> {
  const { view } = level;
  for (const block of level.blocks) {
    const x = block.x - view.x;
    if (block.used || x < 8 || x > 312) continue;
    await hover(page, x, block.y - view.y);
    if ((await probe(page)).cursor.startsWith('jump')) return { x, y: block.y - view.y };
  }
  for (let x = 312; x > 8; x -= 10) {
    for (const y of [GROUND, 156, 180]) {
      await hover(page, x, y);
      const now = await probe(page);
      if (/^(walk|jump)-right$/.test(now.cursor)) return { x, y };
    }
  }
  return null;
}

for (const levelId of ['luna', 'scripe'] as const) {
  test(`${levelId} can be played start to finish with the mouse alone`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await openLevel(page, { levelId });
    await waitForMousePlay(page);
    await playWithTheMouse(page);
    await step(page, 400);
    expect(await scene(page)).toBe('stageClear');
    const session = (await page.evaluate(() => window.__arcade?.state().session)) as { completed: string[] };
    expect(session.completed).toContain(levelId);
    expect(errors).toEqual([]);
  });
}
