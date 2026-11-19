#!/usr/bin/env node
// Development-only: paints every poster design flat (no room light, no tape) onto one contact sheet, for review.
//   node scripts/poster-sheet.mjs [--out .shots/gen/posters/sheet.png] [--texels]
// `--texels` paints each at its atlas density (the 2K tier) and doubles it, to judge what the wall really carries.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const texels = args.includes('--texels');
const outAt = args.indexOf('--out');
const out = resolve(outAt >= 0 ? args[outAt + 1] : '.shots/gen/posters/sheet.png');

const cached = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cached) ? cached : undefined);
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 5173}`;
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage();
  page.on('console', (message) => console.log(`[page] ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[page error] ${error.message}`));
  await page.route('**/poster-sheet.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Poster sheet</title>' }),
  );
  await page.goto(`${base}/poster-sheet.html`);
  const dataUrl = await page.evaluate(async (atTexels) => {
    await Promise.all([
      import('/node_modules/@fontsource/silkscreen/400.css'),
      import('/node_modules/@fontsource/chewy/latin-400.css'),
      import('/node_modules/@fontsource/nunito/latin-600.css'),
      import('/node_modules/@fontsource/nunito/latin-800.css'),
    ]);
    const { DESIGNS } = await import('/src/room/posters/paint/designs.ts');
    const { FACES } = await import('/src/room/posters/paint/faces.ts');
    const { ITEMS } = await import('/src/room/posters/wall/layout.ts');
    await Promise.all(FACES.map(([family, weight]) => document.fonts.load(`${weight} 16px ${family}`)));
    // Pixels per millimetre of each sheet, and how much the result is enlarged.
    const density = (item) => (atTexels ? item.density / 10 : 1.4);
    const zoom = atTexels ? 2 : 1;
    const gap = 24;
    const width = 2600;
    const placed = [];
    let [x, y, row] = [gap, gap, 0];
    for (const item of [...ITEMS].sort((p, q) => q.h * density(q) - p.h * density(p))) {
      const w = Math.round(item.w * 1000 * density(item)) * zoom;
      const h = Math.round(item.h * 1000 * density(item)) * zoom;
      if (x + w + gap > width) [x, y, row] = [gap, y + row + gap + 18, 0];
      placed.push({ item, x, y, w, h });
      x += w + gap;
      row = Math.max(row, h);
    }
    const sheet = document.createElement('canvas');
    sheet.width = width;
    sheet.height = y + row + gap + 18;
    const c = sheet.getContext('2d');
    c.fillStyle = '#2b2d33';
    c.fillRect(0, 0, sheet.width, sheet.height);
    const times = [];
    for (const { item, x, y, w, h } of placed) {
      const one = document.createElement('canvas');
      one.width = w / zoom;
      one.height = h / zoom;
      const o = one.getContext('2d');
      o.scale(density(item), density(item));
      const start = performance.now();
      DESIGNS[item.key](o, item.w * 1000, item.h * 1000);
      o.getImageData(0, 0, 1, 1);
      times.push(`${item.key} ${(performance.now() - start).toFixed(1)}`);
      c.imageSmoothingEnabled = false;
      c.drawImage(one, x, y, w, h);
      c.fillStyle = '#c8cad0';
      c.font = '12px sans-serif';
      c.fillText(`${item.key} · ${Math.round(item.w * 100)} × ${Math.round(item.h * 100)} cm`, x, y + h + 14);
    }
    console.log(`paint ms: ${times.join(', ')}`);
    return sheet.toDataURL('image/png');
  }, texels);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
