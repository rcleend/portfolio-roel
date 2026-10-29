// Bundle budgets (docs/PC.md › Budgets): gzips every chunk of the production
// build listed in dist/.vite/manifest.json and compares with bundle-budgets.json.
//
//   pnpm report:bundle    (builds with the manifest first: `vite build --manifest`)
//
// The manifest is only made for this report, so the site's own build never publishes it.
// Measured, in kB (1000 bytes) of gzip at the default level, like Vite's own report:
// - entry JS / entry CSS: the closure of index.html's static imports (what first load downloads);
// - room: the three.js chunk the room host lazy-loads;
// - pcStill / PcExperience / RadioSlot / RadioExperience: the closure of each dynamic entry minus what the entry already
//   loaded (their own chunks plus the chunks only they share), JS and CSS together;
// - radioDevice: the radio's lazy chunk (its deck and device, what the room's RadioDoor imports), minus the entry
//   and the room chunk it imports three from; likewise propSpotlight (the props' glow and bounce) and posterWall;
// - RoomGuide: the room's hints, overview and labels (docs/ART-DIRECTION.md › The room's UI), JS and CSS.
// PcSlot, the glue that loads the computer's screen, is part of the entry; RadioSlot, the radio's, loads the first time
// the camera leaves the TV. PcExperience, RadioSlot and RadioExperience must not
// contain three.js (none of their files may be the room chunk or one it loads, nor carry three's names), and
// radioDevice must bring no three.js of its own.
// A lazy row whose source file does not exist (yet: another branch adds it) is reported as absent, not failed.
// Exits non-zero on any overrun, or when something it must measure is missing.
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const ENTRY = 'index.html';
const ROOM = 'src/room/index.ts';
/** Lazy entries measured beyond the entry: their source, and whether they may share the room chunk's three.js. */
const LAZY_CHUNKS = {
  pcStill: { source: 'src/app/pc/still/pcStill.ts', three: 'any' },
  PcExperience: { source: 'src/app/pc/PcExperience.tsx', three: 'none' },
  radioDevice: { source: 'src/room/radio/deckChunk.ts', three: 'room' },
  RadioSlot: { source: 'src/app/radio/RadioSlot.tsx', three: 'none' },
  RadioExperience: { source: 'src/app/radio/RadioExperience.tsx', three: 'none' },
  posterWall: { source: 'src/room/posters/PosterWall.ts', three: 'room' },
  RoomGuide: { source: 'src/app/guide/RoomGuide.tsx', three: 'none' },
  propSpotlight: { source: 'src/room/spotlight/Spotlight.ts', three: 'room' },
};

const { budgets, baseline } = JSON.parse(readFileSync(join(ROOT, 'bundle-budgets.json'), 'utf8'));

const manifest = await loadManifest();
const rows = [];
const problems = [];

const entry = closure(manifest, ENTRY);
rows.push(row('entry JS', await gzipped(entry.js), budgets.entryJs, baseline.entryJs));
rows.push(row('entry CSS', await gzipped(entry.css), budgets.entryCss, baseline.entryCss));
const room = manifest[ROOM];
if (room) rows.push(row('room', await gzipped([room.file]), budgets.room, baseline.room));
else problems.push(`${ROOM} is not in the manifest`);

for (const [name, { source, three }] of Object.entries(LAZY_CHUNKS)) {
  if (!existsSync(join(ROOT, source))) {
    rows.push({ name, size: undefined, budget: budgets[name], status: 'absent' });
    continue;
  }
  if (!(source in manifest)) {
    problems.push(`${source} is not a chunk of the build`);
    continue;
  }
  const own = closure(manifest, source);
  const roomFiles = three === 'room' && room ? closure(manifest, ROOM) : { js: [], css: [] };
  const loaded = new Set([...entry.js, ...entry.css, ...roomFiles.js, ...roomFiles.css]);
  const files = [...own.js, ...own.css].filter((file) => !loaded.has(file));
  rows.push(row(name, await gzipped(files), budgets[name]));
  if (three === 'none') {
    const found = await threeIn(files);
    if (found) problems.push(`${name} contains three.js (${found})`);
  }
  if (three === 'room') {
    const found = await threeIn(files, { allowRoom: true });
    if (found) problems.push(`${name} brings its own three.js (${found})`);
  }
}

console.table(Object.fromEntries(rows.map(({ name, ...rest }) => [name, rest])));
for (const { name, size, budget } of rows)
  if (budget !== undefined && size !== undefined && size > budget) problems.push(`${name}: ${size} kB > ${budget} kB`);
if (problems.length > 0) {
  console.error(`Bundle budgets failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Bundle budgets met.');

function row(name, size, budget, base) {
  return {
    name,
    size,
    budget,
    ...(base === undefined ? {} : { delta: Math.round((size - base) * 100) / 100 }),
    status: budget === undefined ? '' : size <= budget ? 'ok' : 'OVER',
  };
}

async function loadManifest() {
  const path = join(DIST, '.vite/manifest.json');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    console.error(`No ${path}: run pnpm report:bundle, which builds with the manifest.`);
    process.exit(1);
  }
}

/** The JS and CSS files a manifest key loads with it: itself and its static imports, transitively. */
function closure(manifest, key) {
  const js = new Set();
  const css = new Set();
  const visit = (name) => {
    const chunk = manifest[name];
    if (!chunk || js.has(chunk.file)) return;
    js.add(chunk.file);
    for (const file of chunk.css ?? []) css.add(file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(key);
  return { js: [...js], css: [...css] };
}

async function gzipped(files) {
  let bytes = 0;
  for (const file of files) bytes += gzipSync(await readFile(join(DIST, file))).length;
  return Math.round(bytes / 10) / 100;
}

/**
 * The first of `files` that is the room's code or three.js, or null. With `allowRoom` the room chunk's own files
 * were already excluded and only three's names count.
 */
async function threeIn(files, { allowRoom = false } = {}) {
  const roomFiles = room && !allowRoom ? closure(manifest, ROOM).js : [];
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    if (roomFiles.includes(file)) return `${file} is the room's`;
    if ((await readFile(join(DIST, file), 'utf8')).includes('THREE.')) return `${file} mentions THREE.`;
  }
  return null;
}
