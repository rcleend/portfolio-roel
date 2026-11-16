#!/usr/bin/env node
// Switches each effect or pass of the room off, one at a time, and prints what a frame then costs the GPU.
//   node scripts/perf/counterfactuals.mjs [--dist dist] [--device phone] [--repeat 10] [--only name,name]
// The effects are switched off from outside, by patching the shaders as the page hands them to WebGL (and the
// context's attributes), so this measures any build, the one before the quality tiers included.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const off = (pattern, replace = '') => ({ find: pattern, replace, flags: 'g' });
const stub = (signature, value) => ({
  find: `${signature}\\s*\\{`,
  replace: (match) => `${match} return ${value};`,
  flags: '',
});
const SURFACE = {
  tvLight: off('outgoingLight \\+= screenLight\\([^;]*;'),
  lamp: off('outgoingLight \\+= tvLampLight\\([^;]*;'),
  varnish: off('outgoingLight \\+= uVarnish[^;]*;'),
};
const COMPOSITE = {
  bloom: { find: 'vec3 blur\\(float level\\)\\s*\\{', replace: 'vec3 blur(float level) { return vec3(0.0);' },
  haze: { find: 'float density\\(([^)]*)\\)\\s*\\{', replace: 'float density($1) { return 0.0;' },
  rain: { find: 'vec3 wetWindow\\(([^)]*)\\)\\s*\\{', replace: 'vec3 wetWindow($1) { return original;' },
  tvAir: { find: 'vec3 screenAir\\(([^)]*)\\)\\s*\\{', replace: 'vec3 screenAir($1) { return vec3(0.0);' },
};
const CASES = {
  baseline: {},
  'no MSAA on the scene target': { noMsaa: true },
  'no MSAA on the canvas': { noCanvasAA: true },
  '8-bit targets': { noFloat: true },
  'no TV area light on surfaces': { shaderPatches: { tvLight: SURFACE.tvLight } },
  'no opal lamp light': { shaderPatches: { lamp: SURFACE.lamp } },
  'no varnish reflections': { shaderPatches: { varnish: SURFACE.varnish } },
  'no surface finish at all': { shaderPatches: SURFACE },
  'no bloom taps in the composite': { shaderPatches: { bloom: COMPOSITE.bloom } },
  'no haze volumes': { shaderPatches: { haze: COMPOSITE.haze } },
  'no rain refraction': { shaderPatches: { rain: COMPOSITE.rain } },
  'no TV light in the air': { shaderPatches: { tvAir: COMPOSITE.tvAir } },
  'composite reduced to grade only': { shaderPatches: COMPOSITE },
  'no dust': {
    shaderPatches: {
      dust: { find: 'gl_PointSize = clamp', replace: 'gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = clamp' },
    },
  },
  'CRT shader reduced to a texture read': {
    shaderPatches: {
      crt: {
        find: 'gl_FragColor = vec4\\(TUBE \\+ light \\+ glass,\\s*1\\.0\\);',
        replace: 'gl_FragColor = vec4(textureLod(uPicture,vUv,0.0).rgb,1.0);',
      },
    },
  },
  'everything above off': { noMsaa: true, noCanvasAA: true, shaderPatches: { ...SURFACE, ...COMPOSITE } },
  'pixel ratio 1.5': { dpr: 1.5 },
  'pixel ratio 1': { dpr: 1 },
  'ratio 1 no MSAA': { dpr: 1, noMsaa: true },
  'ratio 1 no scene geometry': { dpr: 1, skipDraws: 'scene' },
  'ratio 1 no post passes': { dpr: 1, skipDraws: 'post' },
  'ratio 1 no picture upload': { dpr: 1, skipUploads: true },
  'ratio 1 no mip chains': { dpr: 1, skipMips: true },
  'ratio 1 8-bit no MSAA': { dpr: 1, noMsaa: true, noFloat: true, noCanvasAA: true },
};
void stub;

const only = option('only', '').split(',').filter(Boolean);
const profile = fileURLToPath(new URL('./profile.mjs', import.meta.url));
const rows = [];
for (const [name, { dpr, ...config }] of Object.entries(CASES)) {
  if (only.length > 0 && !only.includes(name)) continue;
  const out = execFileSync(
    'node',
    [
      profile,
      '--dist',
      option('dist', 'dist'),
      '--device',
      option('device', 'phone'),
      '--cpu',
      '1',
      '--views',
      'tv,room',
      '--json',
      '--config',
      JSON.stringify({ ...config, repeat: Number(option('repeat', 10)) }),
      ...(dpr ? ['--dpr', String(dpr)] : []),
    ],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  const result = JSON.parse(out);
  const tv = result.views['tv-level'];
  const room = result.views.room;
  rows.push({
    name,
    tv: tv.gpuMedianMs,
    room: room.gpuMedianMs,
    buffer: tv.drawingBuffer?.join('x'),
    patched: JSON.stringify(result.patched),
    errors: result.errors.length,
  });
  const base = rows[0];
  const delta = (value, reference) =>
    `${value.toFixed(2)} (${(((value - reference) / reference) * 100).toFixed(0).padStart(4)}%)`;
  console.log(
    `${name.padEnd(38)} tv ${delta(tv.gpuMedianMs, base.tv)}  room ${delta(room.gpuMedianMs, base.room)}  ${rows.at(-1).buffer}  ${rows.at(-1).patched} errors ${result.errors.length}`,
  );
}
