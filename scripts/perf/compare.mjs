// Side-by-side sheets of the poses `profile.mjs --shots` takes (before, after, forced low tier), for a pull request:
//   node scripts/perf/compare.mjs docs/perf   (reads .perf/shots/{before,after,low})

import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const label = (text, width) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44"><rect width="100%" height="100%" fill="#111"/><text x="16" y="30" font-family="Helvetica" font-size="24" fill="#fff">${text}</text></svg>`,
  );
async function side(name, columns, width) {
  const tiles = [];
  for (const [title, file] of columns) {
    const image = await sharp(file).resize({ width }).png().toBuffer();
    const meta = await sharp(image).metadata();
    tiles.push({ title, image, height: meta.height });
  }
  const height = Math.max(...tiles.map((t) => t.height)) + 44;
  const composite = [];
  tiles.forEach((tile, i) => {
    composite.push({ input: label(tile.title, width), left: i * width, top: 0 });
    composite.push({ input: tile.image, left: i * width, top: 44 });
  });
  await sharp({ create: { width: width * tiles.length, height, channels: 3, background: '#111' } })
    .composite(composite)
    .jpeg({ quality: 80 })
    .toFile(`${out}/${name}.jpg`);
}
const S = '.perf/shots';
for (const view of ['tv', 'room', 'pc', 'radio']) {
  await side(
    `desktop-${view}`,
    [
      ['before', `${S}/before/desktop-${view}.png`],
      ['after (high tier)', `${S}/after/desktop-${view}.png`],
    ],
    1100,
  );
  await side(
    `phone-${view}`,
    [
      ['before', `${S}/before/phone-${view}.png`],
      ['after (medium tier, as a phone starts)', `${S}/after/phone-${view}.png`],
      ['after, forced low tier', `${S}/low/phone-${view}.png`],
    ],
    500,
  );
}
await side(
  'desktop-low-room',
  [
    ['high tier', `${S}/after/desktop-room.png`],
    ['forced low tier', `${S}/low/desktop-room.png`],
  ],
  1100,
);
await side(
  'desktop-low-tv',
  [
    ['high tier', `${S}/after/desktop-tv.png`],
    ['forced low tier', `${S}/low/desktop-tv.png`],
  ],
  1100,
);
