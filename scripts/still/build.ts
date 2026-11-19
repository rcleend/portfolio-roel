/**
 * The startup still's data from the room itself (docs/ROOM.md › Startup):
 *
 *   pnpm build:still                 outlines from the generators, colours from the live room, into
 *                                    src/app/startup/still/data.ts and scripts/still/colours.json
 *   pnpm build:still --no-sample     outlines again, the colours as they were sampled last
 *   pnpm build:still --shots <dir>   colours from shots already taken (live.ts writes them there)
 *   pnpm build:still --tier low              a still fitted to another quality tier's room, into data.ts and the images
 *                                    only, to measure it (the page cannot know its tier: docs/ROOM.md › Startup);
 *                                    build without it again afterwards
 *   pnpm build:still --shots <dir> --variant <name,…>   a lighter still into data.ts only, to price a part of it
 *                                    (layers.ts › variantOf); build without it again afterwards
 *
 * Sampling builds the app into .shots/still/sample/dist, serves it on --port (4720) and opens it in Chromium on
 * this machine's GPU. Run it after a change to the set, the cabinet, the lamps, the plant, the TV view's framing or
 * the room's light near the TV; `still.test.ts` fails when the outlines are stale.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp, { type Sharp } from 'sharp';
import { encode, type Paint, type PaintedShape } from './encode';
import { fingerprint } from './fingerprint';
import { fitPaints, setSmall } from './fit';
import { stillFraming } from './framing';
import { buildGeometry } from './geometry';
import { variantOf } from './layers';
import { readShots, shoot } from './live';
import { loadWorld } from './world';

const ROOT = resolve(import.meta.dirname, '../..');
const COLOURS = join(ROOT, 'scripts/still/colours.json');
const DATA = join(ROOT, 'src/app/startup/still/data.ts');
const SOURCE = join(ROOT, 'scripts/still/source.json');
const IMAGES = join(ROOT, 'public/startup');

const { values } = parseArgs({
  options: {
    'no-sample': { type: 'boolean' },
    shots: { type: 'string' },
    port: { type: 'string', default: '4720' },
    variant: { type: 'string' },
    texels: { type: 'string', default: '1' },
    quality: { type: 'string', default: '60' },
    small: { type: 'string' },
    tier: { type: 'string' },
  },
});

const world = loadWorld();
const framing = stillFraming();
const geometry = buildGeometry(world, framing, values.variant ? variantOf(values.variant.split(',')) : undefined);

let shapes: PaintedShape[];
/** The still's image's address without its ending; as it was, where the room is not sampled. */
const before = await readFile(DATA, 'utf8').catch(() => '');
let image = /STILL_IMAGE = '([^']*)'/.exec(before)?.[1] ?? '';
let smallImage = /STILL_IMAGE_SMALL = '([^']*)'/.exec(before)?.[1] ?? '';
if (values['no-sample']) {
  const colours = JSON.parse(await readFile(COLOURS, 'utf8')) as Record<string, Paint[] | { strengths: number[] }>;
  shapes = geometry.shapes.map((shape) => {
    const sampled = colours[shape.name];
    if (!sampled) throw new Error(`No colours for "${shape.name}": run pnpm build:still to sample them`);
    return Array.isArray(sampled) ? { ...shape, paints: sampled } : { ...shape, paints: [], ...sampled };
  });
} else {
  let shots = values.shots;
  if (!shots) {
    shots = join(ROOT, values.tier ? `.shots/still/sample-${values.tier}` : '.shots/still/sample');
    await mkdir(shots, { recursive: true });
    await shoot(join(shots, 'dist'), Number(values.port), shots, (values.tier as 'low' | undefined) ?? 'high');
  }
  if (values.small) setSmall(Number(values.small));
  const fit = await fitPaints(geometry, framing, await readShots(shots), Number(values.texels));
  shapes = fit.shapes;
  // The still's two images, each named by what is in it, so a new one is a new address: AVIF, and WebP for a browser
  // without. The full one, and the small one a phone takes.
  await mkdir(IMAGES, { recursive: true });
  for (const old of await readdir(IMAGES))
    if (/^(still|small)-\w+\.(avif|webp)$/.test(old)) await rm(join(IMAGES, old));
  const written: string[] = [];
  for (const [kind, { width, height, rgb }] of [
    ['still', fit.image],
    ['small', fit.small],
  ] as const) {
    const name = `${kind}-${createHash('sha1').update(rgb).digest('hex').slice(0, 8)}`;
    const raw = (): Sharp => sharp(rgb, { raw: { width, height, channels: 3 } });
    await raw()
      .avif({ quality: Number(values.quality), chromaSubsampling: '4:4:4', effort: 7 })
      .toFile(join(IMAGES, `${name}.avif`));
    await raw()
      .webp({ quality: Number(values.quality) + 20, smartSubsample: true, effort: 6 })
      .toFile(join(IMAGES, `${name}.webp`));
    // Unpacked beside the shots, for looking at and for trying other encodings.
    await raw()
      .png()
      .toFile(join(shots, `${kind}.png`));
    for (const ending of ['avif', 'webp'])
      console.log(
        `${name}.${ending} ${width} × ${height}, ${(await stat(join(IMAGES, `${name}.${ending}`))).size} bytes, ${((width * height * 4) / 2 ** 20).toFixed(1)} MB decoded`,
      );
    written.push(`/startup/${name}`);
  }
  [image, smallImage] = written as [string, string];
  for (const [name, error] of Object.entries(fit.errors)) console.log(`${name.padEnd(14)} ±${error.toFixed(1)}`);
  if (!values.variant && !values.tier)
    await writeFile(
      COLOURS,
      `${JSON.stringify(
        // A shape's paints; of the picture's light along an edge, its lines' strengths.
        Object.fromEntries(
          shapes.map((shape) => [shape.name, shape.strengths ? { strengths: shape.strengths } : shape.paints]),
        ),
        round,
        1,
      )}\n`,
    );
}

const group = shapes.map((shape) => (shape.tube ? 2 : shape.lit ? 1 : 0));
if (group.some((value, i) => value < (group[i - 1] ?? 0)))
  throw new Error(
    'What the set shows when it is on, and then what its picture lights, must be the last of the still’s layers',
  );
const { data, texts } = encode(framing, shapes);
await writeFile(
  DATA,
  `/** The startup still's outlines and colours: generated by \`pnpm build:still\` (scripts/still/build.ts), never edited. */
export const STILL =
  '${data}';
export const STILL_TEXTS = [${texts.map((text) => `'${text}'`).join(', ')}];
/** The still's image (public/startup): this and .avif, or .webp. */
export const STILL_IMAGE = '${image}';
/** The same for a phone: the pieces a phone's window shows, with fewer texels. */
export const STILL_IMAGE_SMALL = '${smallImage}';
`,
);
if (!values.variant && !values.tier) {
  // What the still was made from, and its image's files as they were written (still.test.ts holds both).
  const sums: Record<string, string> = {};
  for (const [kind, address] of [
    ['', image],
    ['small.', smallImage],
  ] as const)
    for (const ending of ['avif', 'webp'])
      sums[`${kind}${ending}`] = createHash('sha1')
        .update(await readFile(join(ROOT, 'public', `${address}.${ending}`)))
        .digest('hex');
  await writeFile(SOURCE, `${JSON.stringify({ fingerprint: fingerprint(world, framing), image: sums })}\n`);
}
// As the formatter has them, so `pnpm lint` passes on what was generated.
execFileSync('pnpm', ['exec', 'biome', 'format', '--write', COLOURS, DATA, SOURCE], { cwd: ROOT, stdio: 'inherit' });
console.log(
  `${shapes.length} shapes, ${shapes.reduce((sum, shape) => sum + shape.loops.reduce((n, loop) => n + loop.length, 0), 0)} points, ${data.length} characters`,
);

/** Colours to a tenth, places to a tenth of a millimetre: the file reads and diffs. */
function round(_: string, value: unknown): unknown {
  return typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value;
}
