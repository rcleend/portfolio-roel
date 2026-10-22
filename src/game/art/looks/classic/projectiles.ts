import { type PixelArtSheet, pixels } from '@/engine/gfx/PixelArt';
import { recolorRows } from '../../compose';
import { outlined } from '../../fx/outline';

/**
 * Classic's projectile sprites. Each is drawn without its rim and passed through
 * `outlined`, so every shot carries the same 1 px dark outline and reads
 * against the bright stage art. Origins are centred: shots are positioned
 * by their centre.
 */

const centred = (w: number, h: number) => ({ x: Math.floor(w / 2), y: Math.floor(h / 2) });

// ── HACKERMAN · code bolt "</>" ───────────────────────────────────────────

const codeGlyphs = pixels(`
  ..g...g.g..
  .g....g..g.
  g....g....g
  .g..g....g.
  ..g.g...g..
`);

export type CodeBoltAnimation = 'fly';

export const codeBoltSheet: PixelArtSheet<CodeBoltAnimation> = {
  palette: { o: '#0a2e18', g: '#7dff9a', w: '#eafff0' },
  size: { w: 13, h: 7 },
  origin: centred(13, 7),
  animations: {
    // A white flicker on alternate frames sells the "energy" without any blending.
    fly: {
      fps: 15,
      loop: true,
      frames: [outlined(codeGlyphs, 'o'), outlined(recolorRows(codeGlyphs, { g: 'w' }), 'o')],
    },
  },
};

// ── STRATEGY · sticky note ────────────────────────────────────────────────

const noteFace = pixels(`
  fyyyyyyy
  yyyyyyyy
  ylllllyy
  yyyyyyyy
  yllllyyy
  yyyyyyyy
  yyyyyyYY
  yyyyyYY.
`);

const noteEdge = pixels(`
  ........
  ........
  ........
  ffyyyyyy
  YYYYYYYY
  ........
  ........
  ........
`);

const noteSide = pixels(`
  ..fyyy..
  ..yyyy..
  ..ylly..
  ..yyyy..
  ..ylly..
  ..yyyy..
  ..yyYY..
  ..yYY...
`);

export type StickyNoteAnimation = 'spin';

export const stickyNoteSheet: PixelArtSheet<StickyNoteAnimation> = {
  palette: { o: '#3a2808', y: '#ffe14d', Y: '#e0a82a', f: '#fff6c0', l: '#8a6a1a' },
  size: { w: 10, h: 10 },
  origin: centred(10, 10),
  animations: {
    spin: {
      fps: 14,
      loop: true,
      frames: [outlined(noteFace, 'o'), outlined(noteSide, 'o'), outlined(noteEdge, 'o'), outlined(noteSide, 'o')],
    },
  },
};

// ── AGENT SUMMON · drone and its shot ────────────────────────────────────

const droneA = pixels(`
  .RRRRRRRRRR.
  .....mm.....
  ...wwwwwww..
  ..wkkkkkkkw.
  ..wkcckcckw.
  ..wkkkkkkkw.
  ...wwwwwww..
  ....t...t...
`);

// The rotor spins (short blades) and the eyes glance down as the thrusters flicker.
const droneB = pixels(`
  ....RRRR....
  .....mm.....
  ...wwwwwww..
  ..wkkkkkkkw.
  ..wkkkkkkkw.
  ..wkcckcckw.
  ...wwwwwww..
  ....T...T...
`);

export type DroneAnimation = 'hover';

export const droneSheet: PixelArtSheet<DroneAnimation> = {
  palette: {
    o: '#120e24',
    R: '#d6d0dc',
    m: '#4c4662',
    w: '#f4ece0',
    k: '#1c1024',
    c: '#6fe8ff',
    t: '#ffd84a',
    T: '#ff7a1a',
  },
  size: { w: 14, h: 10 },
  origin: centred(14, 10),
  animations: { hover: { fps: 10, loop: true, frames: [outlined(droneA, 'o'), outlined(droneB, 'o')] } },
};
