import type { Gfx } from '@/engine/gfx/Gfx';
import { lazy } from '../../../../art/logos/lazy';
import { bitmapToCanvas } from '../../../../art/logos/raster/toCanvas';
import type { BackdropArt, TitleBackdrop, TitleFrame } from '../TitleBackdrop';
import { paintCard } from './card';
import { CRATER_CENTER, CRATER_FRAMES, paintCrater } from './crater';
import { drawFireball } from './fireball';
import { craterVisible, fireballGlow, fireballRadius } from './impact';

/** The card fills the game's native resolution (docs/ARCHITECTURE.md › Rendering model). */
const CARD = { width: 320, height: 240 } as const;
/** Crater wobble frames, played forwards and back so the loop never jumps. */
const WOBBLE = [0, 1, 2, 3, 2, 1] as const;
const WOBBLE_FPS = 10;
/** Strongest fireball light washing over the card. */
const FIREBALL_GLOW_MAX = 0.3;
const FIREBALL_LIGHT = '#fff6dc';

/**
 * Metal Slug's backdrop (docs/ART-DIRECTION.md › Title): an old printed
 * khaki card, a white-hot fireball that collapses while its light dims, and
 * the molten crater it leaves behind the lockup, wobbling.
 */
export const classicBackdrop: TitleBackdrop<'classic'> = {
  id: 'classic',
  name: 'Classic',
  description: 'A khaki card, a white-hot fireball and the molten crater it leaves, after Metal Slug.',
  prepare: lazy(paintClassicBackdrop),
};

/** About 50 ms on a laptop, nearly all of it the crater's wobble frames. */
function paintClassicBackdrop(): BackdropArt {
  const card = bitmapToCanvas(paintCard(CARD.width, CARD.height));
  const craterFrames = Array.from({ length: CRATER_FRAMES }, (_, frame) => bitmapToCanvas(paintCrater(frame)));
  return {
    drawBehind(gfx: Gfx, frame: TitleFrame): void {
      const { time, impact, screen } = frame;
      gfx.image(card, 0, 0);
      const radius = fireballRadius(time);
      if (radius > 0) {
        // The fireball lights up the whole card, dimming in steps as it collapses.
        gfx.withAlpha(fireballGlow(time) * FIREBALL_GLOW_MAX, () =>
          gfx.fillRect(0, 0, screen.width, screen.height, FIREBALL_LIGHT),
        );
        drawFireball(gfx, impact.x, impact.y, radius);
      }
      if (!craterVisible(time)) return;
      const crater = craterFrames[WOBBLE[Math.floor(time * WOBBLE_FPS) % WOBBLE.length] ?? 0];
      if (crater) gfx.image(crater, impact.x - CRATER_CENTER.x, impact.y - CRATER_CENTER.y);
    },
  };
}
