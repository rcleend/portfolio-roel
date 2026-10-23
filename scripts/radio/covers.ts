/**
 * The placeholder albums' art: seeded generative SVG rasterised with sharp into
 * src/content/radio/albums/<album>/cover.webp (512², opaque) and disc.webp (512² RGBA:
 * the print on the disc, transparent wherever the silver foil should show). No text,
 * logos or marks, so nothing on a placeholder can be mistaken for a real record.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/radio/covers.ts [--only night-shift]
 *
 * (`pnpm build:radio-placeholders` runs it too.) The same seed always paints the same art.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { Rng } from '@/engine/math/Rng';

const SIZE = 512;
const C = SIZE / 2;
const ROOT = resolve(import.meta.dirname, '../..');
const ALBUMS = join(ROOT, 'src/content/radio/albums');
const COVER_BUDGET = 40_000;
const DISC_BUDGET = 60_000;
/**
 * Where the print shows on the disc (docs/RADIO.md › Disc prints): the 120 mm disc fills
 * the square, and the label runs from 23 mm to 58.5 mm from the centre.
 */
const LABEL_INNER = (23 / 60) * C;
const LABEL_OUTER = (58.5 / 60) * C;

interface Art {
  /** The cover: opaque, the full square. */
  readonly cover: string;
  /** The print: `ink` drawn where `mask` is white; everything else is bare foil. */
  readonly ink: string;
  readonly mask: string;
}

type Painter = (rng: Rng) => Art;

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;
const n = (value: number): string => value.toFixed(1);
const ring = (r: number, width: number, attrs: string): string =>
  `<circle cx="${C}" cy="${C}" r="${n(r)}" fill="none" stroke-width="${n(width)}" ${attrs}/>`;
/** The label area of a print, which is all of it a visitor can see. */
const labelArea = (fill: string): string =>
  ring((LABEL_INNER + LABEL_OUTER) / 2, LABEL_OUTER - LABEL_INNER + 6, `stroke="${fill}"`);

// ── Night Shift: concentric grooves under a desk lamp ──────────────────────────

const nightShift: Painter = (rng) => {
  const cx = 300 + rng.range(-20, 20);
  const cy = 330 + rng.range(-20, 20);
  const grooves = Array.from({ length: 34 }, (_, i) => {
    const r = 30 + i * 13 + rng.range(-3, 3);
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="#c9b8ff" stroke-opacity="${n(rng.range(0.06, 0.26))}" stroke-width="${n(rng.range(0.8, 3.2))}"/>`;
  }).join('');
  const cover = svg(
    `<defs><radialGradient id="g" cx="0.58" cy="0.64" r="0.8"><stop offset="0" stop-color="#3a2a6e"/><stop offset="0.55" stop-color="#1b1640"/><stop offset="1" stop-color="#0b0a1f"/></radialGradient>` +
      `<radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd27a"/><stop offset="0.6" stop-color="#ff9c4a"/><stop offset="1" stop-color="#ff9c4a" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>${grooves}` +
      `<circle cx="132" cy="128" r="74" fill="url(#lamp)" opacity="0.9"/><circle cx="132" cy="128" r="26" fill="#ffe3a3"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="18" fill="#0b0a1f"/>`,
  );
  // On the disc the grooves are real: thin rings of bare foil between violet ink.
  const rings = Array.from({ length: 11 }, (_, i) =>
    ring(LABEL_INNER + 10 + i * 13 + rng.range(-2, 2), rng.range(1.2, 3.4), 'stroke="black"'),
  ).join('');
  const ink = svg(
    `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0.35" stop-color="#2a2160"/><stop offset="1" stop-color="#151236"/></radialGradient></defs>` +
      `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/><circle cx="${C + 118}" cy="${C - 118}" r="22" fill="#ffc86a"/>`,
  );
  const mask = svg(`${labelArea('white')}${rings}<circle cx="${C + 118}" cy="${C - 118}" r="28" fill="white"/>`);
  return { cover, ink, mask };
};

// ── Insert Coin: pixel sprites over scanlines ──────────────────────────────────

/**
 * A seeded, left-right symmetric 8 × 7 creature (antennae, a solid body with two eyes, legs):
 * never one from a real game.
 */
function sprite(rng: Rng): boolean[][] {
  const eye = rng.int(1, 2);
  return Array.from({ length: 7 }, (_, y) => {
    const half = Array.from({ length: 4 }, (_, x) => {
      if (y === 0) return x > 0 && rng.chance(0.3);
      if (y === 2 && x === eye) return false;
      if (y < 5) return x > 0 ? rng.chance(0.85) || x === 3 : rng.chance(0.45);
      return y === 6 && x === 3 ? false : rng.chance(0.5);
    });
    return [...half, ...[...half].reverse()];
  });
}

function spriteRects(cells: boolean[][], x: number, y: number, pixel: number, fill: string): string {
  return cells
    .flatMap((row, j) =>
      row.map((on, i) =>
        on
          ? `<rect x="${n(x + i * pixel)}" y="${n(y + j * pixel)}" width="${n(pixel)}" height="${n(pixel)}" fill="${fill}"/>`
          : '',
      ),
    )
    .join('');
}

const insertCoin: Painter = (rng) => {
  const colours = ['#ff4fa3', '#41e3ff', '#ffd23d', '#7dff6b', '#b98bff'];
  const scan = Array.from(
    { length: SIZE / 4 },
    (_, i) => `<rect y="${i * 4}" width="${SIZE}" height="2" fill="#000" fill-opacity="0.32"/>`,
  ).join('');
  // A formation of six, as on an attract screen, with the coin that starts the game.
  const crowd = Array.from({ length: 6 }, (_, i) => {
    const pixel = 14;
    const x = 36 + (i % 3) * 152 + (Math.floor(i / 3) % 2) * 20;
    const y = 52 + Math.floor(i / 3) * 132;
    return spriteRects(sprite(rng), x, y, pixel, colours[i % colours.length] ?? '#fff');
  }).join('');
  const ground = Array.from(
    { length: 32 },
    (_, i) => `<rect x="${i * 16}" y="${i % 2 ? 474 : 478}" width="16" height="6" fill="#41e3ff" fill-opacity="0.55"/>`,
  ).join('');
  const cover = svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140c3a"/><stop offset="1" stop-color="#05040f"/></linearGradient></defs>` +
      `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>` +
      `<circle cx="400" cy="392" r="50" fill="#ffd23d"/><circle cx="400" cy="392" r="38" fill="none" stroke="#c99400" stroke-width="7"/>` +
      `<rect x="395" y="368" width="10" height="48" fill="#c99400"/>${crowd}${ground}${scan}`,
  );
  // On the disc the creatures march round the label in foil, over coloured bands.
  const marchers = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + 0.2;
    const r = (LABEL_INNER + LABEL_OUTER) / 2 - 8;
    const pixel = 7;
    const x = C + Math.cos(angle) * r - 3.5 * pixel;
    const y = C + Math.sin(angle) * r - 3.5 * pixel;
    return spriteRects(sprite(rng), x, y, pixel, 'black');
  }).join('');
  const ink = svg(
    `<rect width="${SIZE}" height="${SIZE}" fill="#120a34"/>` +
      ring(LABEL_INNER + 6, 10, 'stroke="#ff4fa3"') +
      ring(LABEL_OUTER - 30, 8, 'stroke="#41e3ff"'),
  );
  const mask = svg(`${labelArea('white')}${marchers}`);
  return { cover, ink, mask };
};

// ── Low Tide: tide lines on a grey-green sea ───────────────────────────────────

function tideLine(rng: Rng, y: number, amplitude: number): string {
  const phase = rng.range(0, Math.PI * 2);
  const wave = rng.range(1.5, 3.2);
  const points = Array.from({ length: 33 }, (_, i) => {
    const x = (i / 32) * SIZE;
    const offset =
      Math.sin(phase + (x / SIZE) * wave * Math.PI * 2) * amplitude + Math.sin(phase * 3 + x / 41) * amplitude * 0.3;
    return `${n(x)},${n(y + offset)}`;
  });
  return `M${points.join(' L')}`;
}

const lowTide: Painter = (rng) => {
  const lines = Array.from({ length: 22 }, (_, i) => {
    const y = 232 + i * 13 + rng.range(-3, 3);
    return `<path d="${tideLine(rng, y, 4 + i * 0.45)}" fill="none" stroke="#e7f4ef" stroke-opacity="${n(0.12 + (i / 22) * 0.4)}" stroke-width="${n(1 + i * 0.09)}"/>`;
  }).join('');
  const cover = svg(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d2c4"/><stop offset="0.42" stop-color="#b8c4bf"/><stop offset="0.45" stop-color="#5f8583"/><stop offset="1" stop-color="#1f3d43"/></linearGradient></defs>` +
      `<rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/><circle cx="356" cy="168" r="34" fill="#f4efe4" opacity="0.85"/>${lines}`,
  );
  const bands = Array.from({ length: 6 }, (_, i) =>
    ring(LABEL_INNER + 14 + i * 22 + rng.range(-3, 3), rng.range(3, 7), 'stroke="black"'),
  ).join('');
  const ink = svg(
    `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0.38" stop-color="#2e5658"/><stop offset="1" stop-color="#173034"/></radialGradient></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`,
  );
  const mask = svg(`${labelArea('white')}${bands}`);
  return { cover, ink, mask };
};

// ── Solar Drive: a banded sun over a perspective grid ──────────────────────────

const solarDrive: Painter = (rng) => {
  const horizon = 300;
  const bands = Array.from({ length: 6 }, (_, i) => {
    const y = 206 + i * 16 + i * i * 1.2;
    return `<rect x="120" y="${n(y)}" width="272" height="${n(3 + i * 1.6)}" fill="black"/>`;
  }).join('');
  const verticals = Array.from({ length: 21 }, (_, i) => {
    const x = (i - 10) * 70;
    return `<line x1="${C}" y1="${horizon}" x2="${n(C + x * 2.4)}" y2="${SIZE}" stroke="#ff4fd8" stroke-width="2"/>`;
  }).join('');
  const horizontals = Array.from({ length: 9 }, (_, i) => {
    const y = horizon + (SIZE - horizon) * ((i + 1) / 9) ** 1.8;
    return `<line x1="0" y1="${n(y)}" x2="${SIZE}" y2="${n(y)}" stroke="#ff4fd8" stroke-width="${n(1 + i * 0.25)}"/>`;
  }).join('');
  const stars = Array.from(
    { length: 26 },
    () =>
      `<circle cx="${n(rng.range(0, SIZE))}" cy="${n(rng.range(0, 190))}" r="${n(rng.range(0.6, 1.8))}" fill="#fff" opacity="${n(rng.range(0.3, 0.9))}"/>`,
  ).join('');
  const cover = svg(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120626"/><stop offset="0.55" stop-color="#3b0d55"/><stop offset="0.585" stop-color="#ff5fa8"/><stop offset="0.6" stop-color="#1a0630"/><stop offset="1" stop-color="#0c0318"/></linearGradient>` +
      `<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45c"/><stop offset="0.6" stop-color="#ff7a59"/><stop offset="1" stop-color="#ff2f8e"/></linearGradient>` +
      `<mask id="cut"><rect width="${SIZE}" height="${SIZE}" fill="white"/>${bands}</mask><clipPath id="floor"><rect y="${horizon}" width="${SIZE}" height="${SIZE - horizon}"/></clipPath><clipPath id="above"><rect width="${SIZE}" height="${horizon}"/></clipPath></defs>` +
      `<rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>${stars}<circle cx="${C}" cy="${horizon - 64}" r="136" fill="url(#sun)" mask="url(#cut)" clip-path="url(#above)"/>` +
      `<rect y="${horizon - 1}" width="${SIZE}" height="${SIZE - horizon + 1}" fill="#14041f"/><g clip-path="url(#floor)" opacity="0.85">${verticals}${horizontals}</g>`,
  );
  // On the disc the sun's bands and the grid are foil, which catches the lamp as the disc turns.
  const sunBands = Array.from({ length: 5 }, (_, i) => ring(LABEL_INNER + 20 + i * 12, 3 + i, 'stroke="black"')).join(
    '',
  );
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const [x1, y1] = [C + Math.cos(angle) * (LABEL_OUTER - 50), C + Math.sin(angle) * (LABEL_OUTER - 50)];
    const [x2, y2] = [C + Math.cos(angle) * LABEL_OUTER, C + Math.sin(angle) * LABEL_OUTER];
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="black" stroke-width="2.2"/>`;
  }).join('');
  const ink = svg(
    `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0.36" stop-color="#ff7a59"/><stop offset="0.6" stop-color="#ff2f8e"/><stop offset="0.64" stop-color="#2a0a40"/><stop offset="1" stop-color="#14041f"/></radialGradient></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`,
  );
  const mask = svg(`${labelArea('white')}${sunBands}${spokes}`);
  return { cover, ink, mask };
};

// ── Sunday Roast: overlapping plates on a gingham cloth ────────────────────────

const sundayRoast: Painter = (rng) => {
  const checks = Array.from(
    { length: 16 },
    (_, i) =>
      `<rect x="${i * 32}" width="16" height="${SIZE}" fill="#c8402f" fill-opacity="0.32"/><rect y="${i * 32}" width="${SIZE}" height="16" fill="#c8402f" fill-opacity="0.32"/>`,
  ).join('');
  const colours = ['#e3a72f', '#c8402f', '#6f7d3a', '#f3e6cf', '#2f5a7a', '#d9784c'];
  const plates = Array.from({ length: 7 }, (_, i) => {
    const r = rng.range(70, 140);
    return `<circle cx="${n(rng.range(80, 432))}" cy="${n(rng.range(80, 432))}" r="${n(r)}" fill="${colours[i % colours.length]}" fill-opacity="0.78"/><circle cx="${n(rng.range(80, 432))}" cy="${n(rng.range(80, 432))}" r="${n(r * 0.22)}" fill="#f6efe1" fill-opacity="0.5"/>`;
  }).join('');
  const cover = svg(`<rect width="${SIZE}" height="${SIZE}" fill="#f1e4c8"/>${checks}${plates}`);
  const dots = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = (LABEL_INNER + LABEL_OUTER) / 2 + rng.range(-20, 20);
    return `<circle cx="${n(C + Math.cos(angle) * r)}" cy="${n(C + Math.sin(angle) * r)}" r="${n(rng.range(14, 26))}" fill="black"/>`;
  }).join('');
  const ink = svg(`<rect width="${SIZE}" height="${SIZE}" fill="#f1e4c8"/>${checks}${plates}`);
  const mask = svg(`${labelArea('white')}${dots}`);
  return { cover, ink, mask };
};

/** Every placeholder album's painter and seed. */
export const PLACEHOLDER_ART: Readonly<Record<string, { readonly seed: number; readonly paint: Painter }>> = {
  'night-shift': { seed: 1101, paint: nightShift },
  'insert-coin': { seed: 2202, paint: insertCoin },
  'low-tide': { seed: 3303, paint: lowTide },
  'solar-drive': { seed: 4404, paint: solarDrive },
  'sunday-roast': { seed: 5505, paint: sundayRoast },
};

/** Paints and writes every album's cover.webp and disc.webp; returns the problems found. */
export async function writeCovers(only?: readonly string[]): Promise<string[]> {
  const problems: string[] = [];
  for (const [album, { seed, paint }] of Object.entries(PLACEHOLDER_ART)) {
    if (only && !only.includes(album)) continue;
    const art = paint(new Rng(seed));
    const folder = join(ALBUMS, album);
    await mkdir(folder, { recursive: true });
    const cover = join(folder, 'cover.webp');
    await writeFile(
      cover,
      await sharp(Buffer.from(art.cover)).flatten({ background: '#000' }).webp({ quality: 80 }).toBuffer(),
    );
    const ink = await sharp(Buffer.from(art.ink)).removeAlpha().raw().toBuffer();
    const alpha = await sharp(Buffer.from(art.mask)).flatten({ background: '#000' }).extractChannel(0).raw().toBuffer();
    const disc = join(folder, 'disc.webp');
    const print = await sharp(ink, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .joinChannel(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
    await writeFile(disc, print);
    const [coverBytes, discBytes] = [(await stat(cover)).size, (await stat(disc)).size];
    console.log(`${album}: cover ${(coverBytes / 1000).toFixed(1)} kB, disc ${(discBytes / 1000).toFixed(1)} kB`);
    if (coverBytes > COVER_BUDGET) problems.push(`${album}/cover.webp is ${coverBytes} bytes`);
    if (discBytes > DISC_BUDGET) problems.push(`${album}/disc.webp is ${discBytes} bytes`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { only: { type: 'string' } }, strict: true });
  const problems = await writeCovers(values.only?.split(',').filter(Boolean));
  if (problems.length > 0) {
    console.error(`Problems:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
}
