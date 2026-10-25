import { type PixelArtSheet, pixels } from '@/engine/gfx/PixelArt';

/**
 * Small props for the career screens. Authored at native size: each is drawn
 * at 1×, so every pixel here is a pixel on the CRT. Each takes its outline
 * from the screen that shows it, so a prop shared by two screens stays in
 * either one's scheme.
 */

const plane = pixels(`
  .oo...........
  .oro..........
  .orro.........
  .owwooooooooo.
  owwwwbwbwbwwwo
  .orrrrrrrrrrro
  ..oowwwwooooo.
  ....oooo......
`);

/** A tiny airliner flying the career route; its tail stripe flickers like a beacon. */
export function planeSheet(outline: string): PixelArtSheet<'fly'> {
  return {
    palette: { o: outline, w: '#ffffff', b: '#6fb6ff', r: '#e2352d', R: '#ffc83d' },
    size: { w: 14, h: 8 },
    origin: { x: 7, y: 4 },
    animations: {
      fly: {
        fps: 6,
        loop: true,
        frames: [plane, plane.map((row, y) => (y === 1 ? row.replace('r', 'R') : row))],
      },
    },
  };
}

const padlock = pixels(`
  ....ooooo....
  ...oLLLLLo...
  ..oLooooodo..
  ..oLo...odo..
  ..oLo...odo..
  ..oLo...odo..
  ooooooooooooo
  oYYYYYYYYYYgo
  oYgggggggggGo
  oYggggkggggGo
  oYgggkkkgggGo
  oYggggkggggGo
  oYggggkggggGo
  oYgggggggggGo
  oGGGGGGGGGGGo
  ooooooooooooo
`);

/** The locked third mission; its keyhole is cut in the outline's ink. */
export function padlockSheet(outline: string): PixelArtSheet<'idle'> {
  return {
    palette: { o: outline, L: '#e4e6f0', d: '#8a90a8', Y: '#fff3a0', g: '#ffc83d', G: '#c8861a', k: outline },
    size: { w: 13, h: 16 },
    origin: { x: 0, y: 0 },
    animations: { idle: { fps: 1, loop: true, frames: [padlock] } },
  };
}

const envelope = pixels(`
  ooooooooooo
  oowwwwwwwoo
  owowwwwwowo
  owwowwwowwo
  owwwooowwwo
  owwwwwwwwwo
  owwwwwwwwwo
  ooooooooooo
`);

const BLANK_ROW = '...........';

/** Mail icon for the contact call to action; it hops on the beat to invite a press. */
export function envelopeSheet(outline: string): PixelArtSheet<'idle'> {
  return {
    palette: { o: outline, w: '#ffffff' },
    size: { w: 11, h: 9 },
    origin: { x: 0, y: 0 },
    animations: {
      idle: {
        fps: 3,
        loop: true,
        frames: [
          [BLANK_ROW, ...envelope],
          [...envelope, BLANK_ROW],
        ],
      },
    },
  };
}
