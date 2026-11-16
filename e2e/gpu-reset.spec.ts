import { type Browser, expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, paused, waitForRunning } from './helpers';

/**
 * A GPU process reset (a laptop waking from sleep, a display change, a driver reset) wipes every 2D canvas on the page,
 * CPU ones included, and hands each back blank; the restored WebGL context then uploads whatever a texture's canvas
 * holds. Everything painted once must paint again (docs/ROOM.md › Lost canvases). Each test crashes the GPU process
 * with CDP in a browser of its own: a crash counts against the browser's, which blocks WebGL after a few.
 */
test.use({ viewport: { width: 1440, height: 900 } });

/** Bare wall beside the window, outside every prop in the room. */
const WALL = { x: 40, y: 450 };

type Watch = { __restored: boolean };

async function launch(playwright: { chromium: { launch(options: object): Promise<Browser> } }) {
  const browser = await playwright.chromium.launch({ args: [...GPU_LAUNCH_ARGS] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    (window as unknown as Watch).__restored = false;
    addEventListener('webglcontextrestored', () => ((window as unknown as Watch).__restored = true), true);
  });
  await page.goto('/?seed=1');
  await waitForRunning(page);
  return { browser, page };
}

/** Crashes the GPU process and waits for the room's WebGL context to come back. */
async function crashGpu(browser: Browser, page: Page): Promise<void> {
  await (await browser.newBrowserCDPSession()).send('Browser.crashGpuProcess');
  await expect.poll(() => page.evaluate(() => (window as unknown as Watch).__restored)).toBe(true);
}

const settled = (page: Page) => expect.poll(() => page.evaluate(() => window.__room?.settled === true)).toBe(true);

async function lookAround(page: Page): Promise<void> {
  await page.mouse.click(WALL.x, WALL.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await settled(page);
}

async function anchor(page: Page, target: 'tv' | 'pc' | 'radio') {
  const found = await page.evaluate((name) => window.__room?.anchors.find((entry) => entry.target === name), target);
  if (!found) throw new Error(`The room has no ${target} anchor`);
  return found;
}

interface Clip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Mean brightness and colourfulness (0–255) of a clip of the page, and its share of OSD-green pixels. */
async function look(page: Page, clip: Clip): Promise<{ brightness: number; colour: number; green: number }> {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { brightness: 0, colour: 0, green: 0 };
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let brightness = 0;
    let colour = 0;
    let green = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      brightness += (r + g + b) / 3;
      colour += Math.max(r, g, b) - Math.min(r, g, b);
      if (g > 110 && g > r * 1.6 && g > b * 1.4) green++;
    }
    const pixels = data.length / 4;
    return { brightness: brightness / pixels, colour: colour / pixels, green: green / pixels };
  }, shot.toString('base64'));
}

/** Lit pixels of the game's own 320 × 240 frame, read straight from its canvas. */
const litGamePixels = (page: Page) =>
  page.evaluate(() => {
    const game = document.querySelector<HTMLCanvasElement>('canvas[width="320"][height="240"]');
    if (!game) return 0;
    const probe = document.createElement('canvas');
    probe.width = game.width;
    probe.height = game.height;
    const context = probe.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.drawImage(game, 0, 0);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 60) lit++;
    return lit;
  });

/** The picture's clip of the page around a prop's anchor. */
const around = (point: { x: number; y: number }, width: number, height: number): Clip => ({
  x: Math.round(point.x - width / 2),
  y: Math.round(point.y - height / 2),
  width,
  height,
});

/** Leaves the TV for the room view once the game has reached the character select (text, cards, art). */
async function pauseOnCharacterSelect(page: Page): Promise<void> {
  await page.evaluate(() => window.__arcade?.goTo('characterSelect'));
  await expect.poll(() => page.evaluate(() => window.__arcade?.state().scene)).toBe('characterSelect');
  await page.waitForTimeout(1500);
}

test('the paused game on the TV, and its PAUSE, show again after the GPU process restarts', async ({ playwright }) => {
  const { browser, page } = await launch(playwright);
  try {
    await pauseOnCharacterSelect(page);
    await lookAround(page);
    expect(await paused(page)).toBe(true);
    const tv = around(await anchor(page, 'tv'), 100, 70);
    const before = await look(page, tv);
    expect(before.green).toBeGreaterThan(0.005);
    await crashGpu(browser, page);
    // A paused game drew nothing more, and the OSD was painted once: a blank picture without its PAUSE.
    await expect.poll(async () => (await look(page, tv)).brightness).toBeGreaterThan(before.brightness * 0.85);
    await expect.poll(async () => (await look(page, tv)).green).toBeGreaterThan(before.green * 0.7);
  } finally {
    await browser.close();
  }
});

test("the computer's glass shows its desktop again after the GPU process restarts", async ({ playwright }) => {
  const { browser, page } = await launch(playwright);
  try {
    await lookAround(page);
    await expect.poll(() => page.evaluate(() => window.__room?.stats.pcTexturePixels ?? 0)).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const glass = around(await anchor(page, 'pc'), 60, 50);
    const before = await look(page, glass);
    await crashGpu(browser, page);
    // The still was composed once on a canvas: the glass read black until it next went stale.
    await expect.poll(async () => (await look(page, glass)).colour).toBeGreaterThan(before.colour * 0.85);
    await expect.poll(async () => (await look(page, glass)).brightness).toBeGreaterThan(before.brightness * 0.85);
  } finally {
    await browser.close();
  }
});

test("the game's text and art draw again after the GPU process restarts", async ({ playwright }) => {
  const { browser, page } = await launch(playwright);
  try {
    await pauseOnCharacterSelect(page);
    const before = await litGamePixels(page);
    await crashGpu(browser, page);
    // Its atlases, glyph strips and backdrops were painted once: the frame lost its text, its card and its paper.
    await expect.poll(() => litGamePixels(page)).toBeGreaterThan(before * 0.85);
  } finally {
    await browser.close();
  }
});

test('the discs keep their prints after the GPU process restarts', async ({ playwright }) => {
  const { browser, page } = await launch(playwright);
  try {
    await lookAround(page);
    const radio = await anchor(page, 'radio');
    await page.mouse.click(radio.x, radio.y);
    await expect(hostElement(page)).toHaveAttribute('data-view', 'radio');
    await expect.poll(() => page.evaluate(() => window.__room?.radio.deck?.live)).toBe(true);
    const discs = await page.evaluate(() => window.__room?.radio.deck?.layout.discs.filter((d) => !d.inPlayer) ?? []);
    expect(discs.length).toBeGreaterThan(0);
    const clips = discs.map((d) => around(d, Math.round(d.radius), Math.round(d.radius)));
    const colour = async () => {
      let sum = 0;
      for (const clip of clips) sum += (await look(page, clip)).colour;
      return sum / clips.length;
    };
    // The prints fade in once painted; bare discs read about 24 here, printed ones about 32.
    await expect.poll(colour, { timeout: 10_000 }).toBeGreaterThan(29);
    await page.waitForTimeout(1500);
    const before = await colour();
    await crashGpu(browser, page);
    // The prints were painted once on canvases, their art closed: bare discs from then on.
    await expect.poll(colour, { timeout: 10_000 }).toBeGreaterThan(before * 0.9);
  } finally {
    await browser.close();
  }
});

test('the room is lit again after the GPU process restarts, the startup still over it meanwhile', async ({
  playwright,
}) => {
  const { browser, page } = await launch(playwright);
  try {
    // The whole room is baked, the visitor has pressed (the still has gone) and the game rests on one frame.
    await expect.poll(() => page.evaluate(() => window.__room?.stats.generated), { timeout: 30_000 }).toBe('ready');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tv-still')).toHaveAttribute('data-shown', 'false');
    await pauseOnCharacterSelect(page);
    await page.evaluate(() => window.__arcade?.pause());
    await page.waitForTimeout(600);
    // The wall beside the set and the cabinet's top by the bulb lamp: baked surfaces, lit by the bake alone.
    const wall: Clip = { x: 60, y: 120, width: 120, height: 120 };
    const cabinet: Clip = { x: 200, y: 800, width: 100, height: 40 };
    const before = { wall: await look(page, wall), cabinet: await look(page, cabinet) };
    expect(before.wall.brightness).toBeGreaterThan(8);
    await page.evaluate(() => {
      const still = document.getElementById('tv-still');
      const log: string[] = [];
      (window as unknown as { __stillLog: string[] }).__stillLog = log;
      if (still) new MutationObserver(() => log.push(still.dataset.shown ?? '')).observe(still, { attributes: true });
      window.__room?.onShownChange((shown) => log.push(shown ? 'lit' : 'lost'));
    });
    await crashGpu(browser, page);
    await expect.poll(() => page.evaluate(() => window.__room?.stats.generated), { timeout: 30_000 }).toBe('ready');
    await expect(page.locator('#tv-still')).toHaveAttribute('data-shown', 'false');
    // The room lost its light, the still covered it, the room was lit again and the still went: in that order.
    const log = await page.evaluate(() => (window as unknown as { __stillLog: string[] }).__stillLog);
    expect(log.filter((entry, index) => entry !== log[index - 1])).toEqual(['lost', 'true', 'lit', 'false']);
    // The same light as before: neither darker nor missing.
    await page.waitForTimeout(800);
    for (const [name, clip] of [
      ['wall', wall],
      ['cabinet', cabinet],
    ] as const) {
      const after = await look(page, clip);
      expect(after.brightness, name).toBeGreaterThan(before[name].brightness * 0.95);
      expect(after.brightness, name).toBeLessThan(before[name].brightness * 1.05);
    }
  } finally {
    await browser.close();
  }
});
