// Bundle budgets (docs/PC.md › Budgets): gzips every chunk of the production
// build listed in dist/.vite/manifest.json and compares with bundle-budgets.json.
//
//   pnpm report:bundle    (builds with the manifest first: `vite build --manifest`)
//
// The manifest is only made for this report, so the site's own build never publishes it.
// Measured, in kB (1000 bytes) of gzip at the default level, like Vite's own report:
// - entry JS / entry CSS: the closure of index.html's static imports (what first load downloads);
// - room: the three.js chunk the room host lazy-loads;
// - pcStill / PcExperience: the closure of each dynamic entry minus what the entry already loaded
//   (their own chunks plus the chunks only they share), JS and CSS together.
// PcSlot, the glue that loads them, is part of the entry. PcExperience must not contain three.js:
// none of its files may be the room chunk or one the room chunk loads, nor carry three's names.
// Exits non-zero on any overrun, or when something it must measure is missing.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const ENTRY = 'index.html';
const ROOM = 'src/room/index.ts';
const PC_CHUNKS = { pcStill: 'src/app/pc/still/pcStill.ts', PcExperience: 'src/app/pc/PcExperience.tsx' };

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

for (const [name, source] of Object.entries(PC_CHUNKS)) {
  if (!(source in manifest)) {
    problems.push(`${source} is not a chunk of the build`);
    continue;
  }
  const own = closure(manifest, source);
  const files = [...own.js, ...own.css].filter((file) => !entry.js.includes(file) && !entry.css.includes(file));
  rows.push(row(name, await gzipped(files), budgets[name]));
  if (name === 'PcExperience') {
    const three = await threeIn(files);
    if (three) problems.push(`PcExperience contains three.js (${three})`);
  }
}

console.table(Object.fromEntries(rows.map(({ name, ...rest }) => [name, rest])));
for (const { name, size, budget } of rows)
  if (budget !== undefined && size > budget) problems.push(`${name}: ${size} kB > ${budget} kB`);
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

/** The first of `files` that is the room's code or three.js, or null. */
async function threeIn(files) {
  const roomFiles = room ? closure(manifest, ROOM).js : [];
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    if (roomFiles.includes(file)) return `${file} is the room's`;
    if ((await readFile(join(DIST, file), 'utf8')).includes('THREE.')) return `${file} mentions THREE.`;
  }
  return null;
}
