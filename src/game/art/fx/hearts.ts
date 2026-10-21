import { type PixelArtSheet, pixels } from '@/engine/gfx/PixelArt';
import { outlined } from './outline';

/** 11 × 10 hearts: the HUD's health and the "won over" pop above a happy customer. */
const heart = pixels(`
  .rr...rr.
  rwrr.rrrr
  rwrrrrrrr
  rrrrrrrrr
  .rrrrrrR.
  ..rrrrR..
  ...rrR...
  ....R....
`);

const hollow = pixels(`
  .ee...ee.
  eEEe.eEEe
  eEEEeEEEe
  eEEEEEEEe
  .eEEEEEe.
  ..eEEEe..
  ...eEe...
  ....e....
`);

export type HeartAnimation = 'full' | 'empty';

export const heartSheet: PixelArtSheet<HeartAnimation> = {
  palette: { o: '#1a0a14', r: '#ff3a4a', R: '#b01830', w: '#ffffff', e: '#5a3a5a', E: '#2a1830' },
  size: { w: 11, h: 10 },
  origin: { x: 0, y: 0 },
  animations: {
    full: { fps: 1, loop: true, frames: [outlined(heart, 'o')] },
    empty: { fps: 1, loop: true, frames: [outlined(hollow, 'o')] },
  },
};
