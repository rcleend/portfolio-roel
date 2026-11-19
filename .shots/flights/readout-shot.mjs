// The ?debug=perf readout on the phone stand-in, as the owner would screenshot it: at the TV with the game paused,
// in the room view at rest, and at the radio while the discs float. node .shots/flights/readout-shot.mjs <dist> <outdir>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, serve, sleep } from '../../scripts/perf/nogpuLib.mjs';
const [dist, out] = [resolve(process.argv[2]), resolve(process.argv[3])];
mkdirSync(out, { recursive: true });
const server = await serve(dist);
const port = server.address?.().port ?? server.port;
const { context, close } = await launch({ browser: 'cft', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], device: 'phone' });
const page = context.pages()[0] ?? (await context.newPage());
await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
await page.goto(`http://localhost:${port}/?debug=perf`);
await page.waitForFunction(() => window.__room?.stats.generated === 'ready', null, { timeout: 60_000 });
const shot = async (name) => {
  console.log(name, await page.evaluate(() => JSON.stringify(window.__room.stats.pace)));
  await page.screenshot({ path: join(out, `${name}.png`) });
};
const press = (text) =>
  page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === label || x.textContent?.trim() === label);
    b?.click();
    return Boolean(b);
  }, text);
await sleep(12_000);
await shot('tv-title');
await page.evaluate(() => document.querySelector('.tv-way-out, .way-out')?.click());
await sleep(14_000);
await shot('room');
await press('Music by me');
await sleep(4_000);
await shot('radio-afloat');
await sleep(12_000);
await shot('radio-still');
await close();
server.close?.();
