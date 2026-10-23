// Bundle budgets (docs/PC.md › Budgets): gzips every chunk of the production
// build listed in dist/.vite/manifest.json and compares with bundle-budgets.json.
//
//   pnpm build && pnpm report:bundle
//
// Measured, in kB (1000 bytes) of gzip at the default level, like Vite's own report:
// - entry JS / entry CSS: the closure of index.html's static imports (what first load downloads);
// - room: the three.js chunk the room host lazy-loads;
// - pcStill / PcExperience: the closure of each dynamic entry minus what the entry already loaded
//   (their own chunks plus the chunks only they share), JS and CSS together.
// PcExperience must not contain any three.js module.
//
// Until the room host imports PcSlot, the app's build never reaches the PC's chunks; the report
// then measures them in a probe build that adds PcSlot as an extra entry (labelled in the output),
// and weighs PcSlot itself as the growth it will add to the entry.
// Exits non-zero on any overrun, or when something it must measure is missing.
import { readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const PROBE = join(ROOT, 'node_modules/.tmp/bundle-report');
const ENTRY = 'index.html';
const ROOM = 'src/room/index.ts';
const PC_SLOT = 'src/app/pc/PcSlot.tsx';
const PC_CHUNKS = { pcStill: 'src/app/pc/still/pcStill.ts', PcExperience: 'src/app/pc/PcExperience.tsx' };

const { budgets, baseline } = JSON.parse(readFileSync(join(ROOT, 'bundle-budgets.json'), 'utf8'));

const app = await loadManifest(DIST);
const rows = [];
const problems = [];

const entry = closure(app.manifest, ENTRY);
rows.push(row('entry JS', await gzipped(DIST, entry.js), budgets.entryJs, baseline.entryJs));
rows.push(row('entry CSS', await gzipped(DIST, entry.css), budgets.entryCss, baseline.entryCss));
const room = app.manifest[ROOM];
if (room) rows.push(row('room', await gzipped(DIST, [room.file]), budgets.room, baseline.room));
else problems.push(`${ROOM} is not in the manifest`);

let pc = { dir: DIST, manifest: app.manifest, modules: null, label: '' };
if (!Object.values(PC_CHUNKS).every((source) => source in app.manifest)) {
  pc = { ...(await probeBuild()), label: ' (probe build)' };
}
const loaded = closure(pc.manifest, ENTRY, PC_SLOT in pc.manifest ? [PC_SLOT] : []);
for (const [name, source] of Object.entries(PC_CHUNKS)) {
  if (!(source in pc.manifest)) {
    problems.push(`${source} is not a chunk of the build`);
    continue;
  }
  const own = closure(pc.manifest, source);
  const files = [...own.js, ...own.css].filter((file) => !loaded.js.includes(file) && !loaded.css.includes(file));
  rows.push(row(`${name}${pc.label}`, await gzipped(pc.dir, files), budgets[name]));
  if (name === 'PcExperience') {
    const three = await threeIn(pc, files);
    if (three) problems.push(`PcExperience contains three.js (${three})`);
  }
}
// Before the merge PcSlot is not in the app's entry yet: weigh what its chunk and CSS will add to the
// entry once bundled into it (the growth of the entry's gzip, which already holds React's names and helpers).
const slot = pc.dir === PROBE ? pc.manifest[PC_SLOT] : undefined;
if (slot) {
  const index = pc.manifest[ENTRY];
  const growth =
    (await growthOf(pc.dir, [index.file], [slot.file])) + (await growthOf(pc.dir, index.css ?? [], slot.css ?? []));
  rows.push(row('PcSlot glue (probe build)', Math.round(growth / 10) / 100, budgets.pcSlot));
}

console.table(Object.fromEntries(rows.map(({ name, ...rest }) => [name, rest])));
for (const { name, size, budget } of rows)
  if (budget !== undefined && size > budget) problems.push(`${name}: ${size} kB > ${budget} kB`);
if (pc.dir === PROBE && !process.env.KEEP_PROBE) await rm(PROBE, { recursive: true, force: true });
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

async function loadManifest(dir) {
  try {
    return { manifest: JSON.parse(await readFile(join(dir, '.vite/manifest.json'), 'utf8')) };
  } catch {
    console.error(`No ${join(dir, '.vite/manifest.json')}: run pnpm build first.`);
    process.exit(1);
  }
}

/** The JS and CSS files a manifest key loads with it: itself and its static imports, transitively. */
function closure(manifest, key, extraKeys = []) {
  const js = new Set();
  const css = new Set();
  const visit = (name) => {
    const chunk = manifest[name];
    if (!chunk || js.has(chunk.file)) return;
    js.add(chunk.file);
    for (const file of chunk.css ?? []) css.add(file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  for (const name of [key, ...extraKeys]) visit(name);
  return { js: [...js], css: [...css] };
}

async function gzipped(dir, files) {
  let bytes = 0;
  for (const file of files) bytes += gzipSync(await readFile(join(dir, file))).length;
  return Math.round(bytes / 10) / 100;
}

/** Bytes of gzip that appending `extra` to `base` adds. */
async function growthOf(dir, base, extra) {
  const read = (files) => Promise.all(files.map((file) => readFile(join(dir, file))));
  const before = Buffer.concat(await read(base));
  return gzipSync(Buffer.concat([before, ...(await read(extra))])).length - gzipSync(before).length;
}

/** A production build with PcSlot as an extra entry, recording every chunk's modules. */
async function probeBuild() {
  const { build } = await import('vite');
  const modules = new Map();
  await build({
    root: ROOT,
    logLevel: 'silent',
    build: {
      outDir: PROBE,
      emptyOutDir: true,
      manifest: true,
      rolldownOptions: {
        input: { index: join(ROOT, ENTRY), pcSlot: join(ROOT, PC_SLOT) },
        // An app build drops entry exports; PcSlot's export is what reaches the PC's chunks.
        preserveEntrySignatures: 'exports-only',
      },
    },
    plugins: [
      {
        name: 'bundle-report-modules',
        generateBundle(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type === 'chunk') modules.set(output.fileName, output.moduleIds);
          }
        },
      },
    ],
  });
  return { dir: PROBE, ...(await loadManifest(PROBE)), modules };
}

/** The first three.js module (or room chunk) among `files`, or null. */
async function threeIn(build, files) {
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const ids = build.modules?.get(file);
    const three = ids?.find((id) => /[\\/]node_modules[\\/]three[\\/]|[\\/]src[\\/]room[\\/]/.test(id));
    if (three) return three;
    if (file === build.manifest[ROOM]?.file) return file;
    if ((await readFile(join(build.dir, file), 'utf8')).includes('THREE.')) return `${file} mentions THREE.`;
  }
  return null;
}
