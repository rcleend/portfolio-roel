/**
 * The live room's opening view, for the startup still's colours (docs/ROOM.md › Startup): a production build served
 * here and opened in Chromium on the real GPU at top quality, the still and the page's controls hidden, at the few
 * viewports that between them show every shape of the still. The set is on and its picture is black, as it is on the
 * frame the still hands over on (the game on its title, every frame of it painted over before the room takes it);
 * one more shot with the picture white gives what the tube lights.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { build, preview } from 'vite';
import { fillPicture, showRoom } from './page';

export interface Shot {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly touch: boolean;
  /** Screenshot pixels a CSS pixel. */
  readonly density: number;
  /** The picture white rather than black: what the tube lights. */
  readonly lit: boolean;
}

/** The first shot that shows a shape gives its colours: the nominal view, then what only wider or taller ones show. */
export const SHOTS: readonly Shot[] = [
  { name: 'nominal', width: 1440, height: 900, touch: false, density: 2, lit: false },
  // The widest common window: the opal lamp's pool, without the lamp and so without the finish's bloom of it.
  { name: 'desktop', width: 1920, height: 1080, touch: false, density: 1, lit: false },
  { name: 'wide', width: 2560, height: 1080, touch: false, density: 1, lit: false },
  { name: 'tall', width: 768, height: 1024, touch: true, density: 2, lit: false },
  { name: 'phone', width: 412, height: 915, touch: true, density: 2, lit: false },
  { name: 'narrow', width: 360, height: 800, touch: false, density: 2, lit: false },
  { name: 'tablet', width: 1024, height: 768, touch: true, density: 2, lit: false },
  // Nearer and further eyes than the rest: what is of the room stays on its surface between them, a lamp's bloom goes with the lamp.
  { name: 'short', width: 1200, height: 500, touch: false, density: 1, lit: false },
  { name: 'square', width: 1000, height: 950, touch: false, density: 1, lit: false },
  { name: 'lit', width: 1440, height: 900, touch: false, density: 2, lit: true },
];

export interface Picture {
  readonly shot: Shot;
  readonly width: number;
  readonly height: number;
  /** sRGB, three bytes a pixel. */
  readonly rgb: Uint8Array;
}

const cachedChromium = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);

/** Builds the app into `dist`, serves it on `port` and writes each shot as `<dir>/<name>.png`. */
export async function shoot(
  dist: string,
  port: number,
  dir: string,
  /** The quality tier the room is shot on (the still is made from the top one; another is for looking at). */
  tier: 'high' | 'medium' | 'low' = 'high',
): Promise<void> {
  await build({ logLevel: 'warn', build: { outDir: dist, emptyOutDir: true } });
  const server = await preview({
    logLevel: 'warn',
    build: { outDir: dist },
    preview: { port, strictPort: true, host: '127.0.0.1' },
  });
  // Headless Chromium on the machine's GPU, as scripts/perf/profile.mjs launches it: a software renderer starts
  // the room on a lower tier.
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cachedChromium) ? cachedChromium : undefined);
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: shot.density,
        hasTouch: shot.touch,
        isMobile: shot.touch,
      });
      const page = await context.newPage();
      await showRoom(page, `http://127.0.0.1:${port}/`, tier);
      await fillPicture(page, shot.lit ? '#fff' : '#000');
      await page.screenshot({ path: join(dir, `${shot.name}.png`) });
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

export async function readShots(dir: string): Promise<Picture[]> {
  const pictures: Picture[] = [];
  for (const shot of SHOTS) {
    const { data, info } = await sharp(join(dir, `${shot.name}.png`))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== shot.width * shot.density) throw new Error(`${shot.name}.png is not the shot it is named for`);
    pictures.push({ shot, width: info.width, height: info.height, rgb: new Uint8Array(data) });
  }
  return pictures;
}
