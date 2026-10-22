import { type PixelArtSheet, pixels } from '@/engine/gfx/PixelArt';
import { recolorRows } from '../compose';
import { outlined } from './outline';

/** An 11 × 11 twinkling star: the highlight card's decoration and classic's north star. Origin centred. */
const star = pixels(`
  ....y....
  ....y....
  ...yyy...
  yyyywyyyy
  .yyywyyy.
  ..yyyyy..
  ..yYYYy..
  .yY...Yy.
  .y.....y.
`);

export type StarAnimation = 'twinkle';

export const starSheet: PixelArtSheet<StarAnimation> = {
  palette: { o: '#4a1c08', y: '#ffd84a', Y: '#ff9a1f', w: '#ffffff' },
  size: { w: 11, h: 11 },
  origin: { x: 5, y: 5 },
  animations: {
    twinkle: {
      fps: 8,
      loop: true,
      frames: [outlined(star, 'o'), outlined(recolorRows(star, { y: 'w', w: 'y' }), 'o')],
    },
  },
};
