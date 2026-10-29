#!/usr/bin/env node
// Development-only: renders the startup stills (src/app/startup/tvStills.ts, docs/ROOM.md › Startup) from the room
// itself: the TV view at each still's reference viewport, the tube lit on a black picture, no UI.
//   node scripts/capture-tv-stills.mjs
// Writes public/startup/tv-*.webp and prints each picture's rect for tvStills.ts. Uses the GPU (ANGLE/Metal) like
// room-shots.mjs; CHROMIUM_PATH picks a browser binary. Re-run whenever the room, the TV or its framing changes.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';

/** Each still's reference viewport: the framing it stands for, at the device scale it is drawn for. */
const STILLS = [
  { name: 'desktop', width: 1440, height: 608, scale: 2, touch: false },
  { name: 'portrait', width: 390, height: 900, scale: 3, touch: true },
  { name: 'landscape', width: 900, height: 390, scale: 2, touch: true },
];

const cachedChromium = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cachedChromium) ? cachedChromium : undefined);
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 5173}`;
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const outDir = resolve('public/startup');
await mkdir(outDir, { recursive: true });

try {
  for (const still of STILLS) {
    const page = await browser.newPage({
      viewport: { width: still.width, height: still.height },
      deviceScaleFactor: still.scale,
      hasTouch: still.touch,
      isMobile: still.touch,
    });
    await page.goto(`${base}/?host=room&capture`);
    await page.waitForFunction(() => document.querySelector('.room-host')?.dataset.ready === 'true', null, {
      timeout: 60_000,
    });
    // The page's own layers go; the touch pad stays laid out (unseen), since its strips shape the framing.
    await page.addStyleTag({ content: '.sound-toggle,.way-out,.tv-still,.still-picture{display:none!important}' });
    const picture = await page.evaluate(async () => {
      await window.__room?.powerOn({ instant: true });
      return globalThis.__tvPicture?.();
    });
    await page.waitForTimeout(1500);
    const png = await page.screenshot();
    const file = join(outDir, `tv-${still.name}.webp`);
    const { size } = await sharp(png).webp({ quality: 82, effort: 6 }).toFile(file);
    console.log(`${still.name}: ${size} bytes, picture ${picture?.map((value) => value.toFixed(2)).join(', ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
