/**
 * The game's pixel art as code (docs/ARCHITECTURE.md › Art in code): turns every PNG under src/game into a module
 * beside it holding the same pixels as a string, `sheet.png` → `sheet.art.ts`, and removes the PNG. The game imports
 * the modules; no image file of its art is downloaded.
 *
 *   pnpm build:art                      convert every PNG under src/game (after a generator or an artist wrote one)
 *   pnpm build:art --against <rev>      prove every module holds the pixels of the PNG it replaced, read from git
 *   pnpm build:art --export <dir>       write every module back as a PNG under <dir>, to look at or to edit
 *
 * Every PNG is decoded, encoded, decoded again with the game's own decoder and compared byte for byte (colour and
 * alpha of every pixel, shown or not) before its module is written, and the SHA-256 of its RGBA goes into
 * src/game/art/art-digests.json, which src/game/art/artModules.test.ts holds every module to from then on.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { decodePixelData } from '@/engine/gfx/PixelData';
import { encodePixelData } from './art/encodePixelData.ts';

const ROOT = resolve(import.meta.dirname, '..');
const ART_ROOT = join(ROOT, 'src/game');
const DIGESTS = join(ROOT, 'src/game/art/art-digests.json');
/** Biome's line width: a longer statement breaks after its `=`. */
const LINE_WIDTH = 120;

interface Rgba {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

async function filesUnder(dir: string, suffix: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function rgbaOfPng(png: Uint8Array, name: string): Promise<Rgba> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4 || data.length !== info.width * info.height * 4) {
    throw new Error(`${name}: expected 8-bit RGBA, got ${info.channels} channels`);
  }
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/** The digest the test checks: the picture's size and every byte of its RGBA. */
export function digestOf(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): string {
  return createHash('sha256').update(`${width}x${height}:`).update(rgba).digest('hex');
}

function sameBytes(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): boolean {
  return (
    a.length === b.length &&
    Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length))
  );
}

const key = (file: string): string => relative(ROOT, file).replace(/\.(png|art\.ts)$/, '');
const moduleOf = (png: string): string => png.replace(/\.png$/, '.art.ts');

function moduleSource(pngName: string, data: string): string {
  const head =
    `// Written by \`pnpm build:art\` from ${pngName}: the same pixels, in code (src/engine/gfx/PixelData.ts). ` +
    'Do not edit.\n';
  const oneLine = `export const art = '${data}';`;
  return `${head}${oneLine.length <= LINE_WIDTH ? oneLine : `export const art =\n  '${data}';`}\n`;
}

async function artOf(module: string): Promise<string> {
  const { art } = (await import(pathToFileURL(module).href)) as { art?: unknown };
  if (typeof art !== 'string') throw new Error(`${relative(ROOT, module)} must export \`art\`, a string`);
  return art;
}

async function readDigests(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(DIGESTS, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function convert(): Promise<void> {
  const pngs = await filesUnder(ART_ROOT, '.png');
  const digests = await readDigests();
  let before = 0;
  let after = 0;
  for (const png of pngs) {
    const name = relative(ROOT, png);
    const bytes = await readFile(png);
    const image = await rgbaOfPng(bytes, name);
    const data = encodePixelData(image.data, image.width, image.height);
    const back = decodePixelData(data);
    if (back.width !== image.width || back.height !== image.height || !sameBytes(back.rgba, image.data)) {
      throw new Error(`${name}: the encoded pixels do not decode to the PNG's`);
    }
    await writeFile(moduleOf(png), moduleSource(name.split('/').at(-1) as string, data));
    digests[key(png)] = digestOf(image.width, image.height, image.data);
    await rm(png);
    before += bytes.length;
    after += data.length;
  }
  // A module whose art is gone takes its digest with it.
  const modules = new Set((await filesUnder(ART_ROOT, '.art.ts')).map(key));
  const kept = Object.fromEntries(
    Object.entries(digests)
      .filter(([name]) => modules.has(name))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  await writeFile(DIGESTS, `${JSON.stringify(kept, null, 2)}\n`);
  console.log(
    pngs.length === 0
      ? `No PNG under src/game; ${modules.size} art modules stand.`
      : `${pngs.length} PNGs (${before} bytes) → art modules (${after} characters); ${modules.size} modules in all.`,
  );
}

/** Every module against the PNG of the same name at git revision `rev`: every byte of RGBA. */
async function against(rev: string): Promise<void> {
  const modules = await filesUnder(ART_ROOT, '.art.ts');
  const problems: string[] = [];
  let pixels = 0;
  for (const module of modules) {
    const path = `${key(module)}.png`;
    let png: Buffer;
    try {
      png = execFileSync('git', ['show', `${rev}:${path}`], {
        cwd: ROOT,
        maxBuffer: 64 << 20,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      problems.push(`${path}: not in ${rev}`);
      continue;
    }
    const image = await rgbaOfPng(png, path);
    const decoded = decodePixelData(await artOf(module));
    if (decoded.width !== image.width || decoded.height !== image.height) {
      problems.push(`${path}: ${decoded.width}×${decoded.height}, the PNG is ${image.width}×${image.height}`);
    } else if (!sameBytes(decoded.rgba, image.data)) {
      problems.push(`${path}: pixels differ`);
    }
    pixels += image.width * image.height;
  }
  const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, 'src/game'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const known = new Set(modules.map((module) => `${key(module)}.png`));
  for (const path of listed.split('\n').filter((name) => name.endsWith('.png'))) {
    if (!known.has(path)) problems.push(`${path}: in ${rev}, but has no art module`);
  }
  if (problems.length > 0) {
    console.error(`Art modules differ from the PNGs of ${rev}:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(
    `${modules.length} art modules hold the pixels of their PNGs at ${rev}: ${pixels} pixels, every RGBA byte.`,
  );
}

async function exportPngs(dir: string): Promise<void> {
  const modules = await filesUnder(ART_ROOT, '.art.ts');
  for (const module of modules) {
    const { width, height, rgba } = decodePixelData(await artOf(module));
    const out = join(resolve(dir), `${relative(ART_ROOT, module).replace(/\.art\.ts$/, '')}.png`);
    await mkdir(dirname(out), { recursive: true });
    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }
  console.log(`${modules.length} PNGs written under ${dir}.`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { against: { type: 'string' }, export: { type: 'string' } } });
  if (values.against) await against(values.against);
  else if (values.export) await exportPngs(values.export);
  else await convert();
}

if (import.meta.filename === process.argv[1]) await main();
