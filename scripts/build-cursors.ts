/**
 * The room's cursors (docs/ART-DIRECTION.md › The room's UI): rasterises the drawn ones
 * (src/app/cursors/source/*.svg) and the game's pixel hand (src/game/ui/cursor.ts) to the
 * PNGs the `cursor` property points at, 1x and 2x, and writes every hotspot, in 1x CSS px,
 * to src/app/cursors/hotspots.json.
 *
 *   pnpm build:cursors
 *
 * The 2x is drawn from the SVG at twice the density, never upscaled; the game's hand is
 * scaled nearest-neighbour by whole numbers, so it stays as crisp as it is on the TV. The
 * results are committed; run this again after changing a drawing or the game's hand.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { parseHex } from '@/engine/gfx/color';
import { TRANSPARENT_KEY } from '@/engine/gfx/PixelArt';
import { HAND_PALETTE, POINTER_HAND, POINTER_TIP } from '@/game/ui/cursor';

const ROOT = resolve(import.meta.dirname, '..');
const CURSORS = join(ROOT, 'src/app/cursors');
/** Each PNG, 1x or 2x: a cursor is fetched the first time the pointer needs it. */
const BUDGET_BYTES = 1500;
/** The drawn cursors, each a 32-unit square that is 32 CSS px. */
const DRAWN = ['arrow', 'hand', 'leave'] as const;
/** CSS px per sprite px for the game's hand at 1x: 32 × 30, a full-size cursor; 2x doubles it. */
const GAME_HAND_SCALE = 2;

interface Hotspot {
  readonly x: number;
  readonly y: number;
}

interface Cursor {
  readonly name: string;
  readonly png: { readonly '1x': Buffer; readonly '2x': Buffer };
  readonly hotspot: Hotspot;
}

/**
 * Palette PNGs, about half the size of RGBA ones and off by at most 10/255 on any channel. (At quality 100
 * libimagequant gives up and sharp quietly writes RGBA.)
 */
const encode = (image: ReturnType<typeof sharp>): Promise<Buffer> =>
  image.png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 }).toBuffer();

/** A drawn cursor: its SVG at 72 and 144 dpi, and the hotspot its root carries as `data-hotspot="x y"`. */
async function drawn(name: string): Promise<Cursor> {
  const svg = await readFile(join(CURSORS, 'source', `${name}.svg`));
  const match = /data-hotspot="(\d+) (\d+)"/.exec(svg.toString());
  if (!match) throw new Error(`source/${name}.svg needs data-hotspot="x y" on its <svg>`);
  const [one, two] = await Promise.all([1, 2].map((scale) => encode(sharp(svg, { density: 72 * scale }))));
  if (!one || !two) throw new Error(`source/${name}.svg did not render`);
  return { name, png: { '1x': one, '2x': two }, hotspot: { x: Number(match[1]), y: Number(match[2]) } };
}

/**
 * The pointer over the game: the classic pixel hand (src/game/ui/cursor.ts, `POINTER_HAND`), pointing up and to the
 * left as a pointer does, scaled nearest-neighbour by whole numbers so it stays crisp; the hotspot is the fingertip
 * pixel's top-left corner, the point of the finger.
 */
async function gameHand(): Promise<Cursor> {
  const rows = POINTER_HAND;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => [...row].length));
  const hotspot = { x: POINTER_TIP.x * GAME_HAND_SCALE, y: POINTER_TIP.y * GAME_HAND_SCALE };
  const raster = (scale: number): Promise<Buffer> => {
    const data = Buffer.alloc(width * scale * height * scale * 4);
    for (let y = 0; y < height * scale; y++) {
      for (let x = 0; x < width * scale; x++) {
        const key = [...(rows[Math.floor(y / scale)] ?? '')][Math.floor(x / scale)] ?? TRANSPARENT_KEY;
        const colour = (HAND_PALETTE as Readonly<Record<string, string>>)[key];
        if (key === TRANSPARENT_KEY || !colour) continue;
        const { r, g, b, a } = parseHex(colour);
        data.set([r, g, b, a], (y * width * scale + x) * 4);
      }
    }
    return encode(sharp(data, { raw: { width: width * scale, height: height * scale, channels: 4 } }));
  };
  const [one, two] = await Promise.all([raster(GAME_HAND_SCALE), raster(GAME_HAND_SCALE * 2)]);
  if (!one || !two) throw new Error('the game hand did not render');
  return { name: 'game-hand', png: { '1x': one, '2x': two }, hotspot };
}

async function main(): Promise<void> {
  const cursors = [...(await Promise.all(DRAWN.map(drawn))), await gameHand()];
  const problems: string[] = [];
  const hotspots: Record<string, Hotspot> = {};
  for (const { name, png, hotspot } of cursors) {
    for (const [density, buffer] of Object.entries(png)) {
      const file = `${name}${density === '2x' ? '@2x' : ''}.png`;
      await writeFile(join(CURSORS, file), buffer);
      const { width, height } = await sharp(buffer).metadata();
      console.log(`${file.padEnd(18)} ${`${width}×${height}`.padEnd(7)} ${String(buffer.length).padStart(5)} B`);
      if (buffer.length > BUDGET_BYTES) problems.push(`${file} is ${buffer.length} B, over ${BUDGET_BYTES} B`);
    }
    hotspots[name] = hotspot;
    console.log(`${''.padEnd(18)} hotspot ${hotspot.x} ${hotspot.y}`);
  }
  await writeFile(join(CURSORS, 'hotspots.json'), `${JSON.stringify(hotspots, null, 2)}\n`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  }
}

await main();
