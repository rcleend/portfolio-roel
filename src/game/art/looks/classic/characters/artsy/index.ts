import { defineHeroLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { artsySheet } from './sheet';

/** The paint colours ARTSY cycles through, shot by shot, with an outline shade for each. */
const PAINTS = [
  { fill: '#ff4fa3', rim: '#7a0f45' },
  { fill: '#3fd8ff', rim: '#0b4a6a' },
  { fill: '#ffd84a', rim: '#7a4a08' },
] as const;

/** Classic ARTSY; his paint blobs cycle colours and trail a drip that sells the arc. */
export const look = defineHeroLook('artsy', {
  sheet: artsySheet,
  attack: () => ({
    shot: (gfx, shot) => {
      const paint = PAINTS[shot.index % PAINTS.length] ?? PAINTS[0];
      gfx.circle(shot.x, shot.y, 3, paint.rim);
      gfx.circle(shot.x, shot.y, 2, paint.fill);
      gfx.pixel(shot.x - 1, shot.y - 1, '#ffffff');
      gfx.pixel(shot.x - shot.direction * 4, shot.y - 2, paint.fill);
    },
    impact: drawBurst,
  }),
});
