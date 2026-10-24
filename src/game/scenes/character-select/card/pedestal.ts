import type { Gfx } from '@/engine/gfx/Gfx';
import { INK, shadeOf } from '../../title/backdrops/blueprint/inks';
import type { ClassTheme } from '../classThemes';
import { cycle } from '../cycle';
import { fillEllipse, strokeEllipse } from './ellipse';

const RX = 30;
const RY = 7;
const DEPTH = 8;

/** Stone colours, as blueprint ramp steps: rim light, top face, inner top, then the side from lit to shadowed. */
const STONE = {
  rim: shadeOf(INK.mid),
  top: shadeOf(5),
  inset: shadeOf(4),
  side: [shadeOf(3), shadeOf(2), shadeOf(1)],
  shadow: shadeOf(0),
} as const;

/** Glow level per pulse step: up, peak, down, rest — four hard steps a second. */
const PULSE = [1, 2, 3, 2] as const;
const PULSE_STEPS_PER_SECOND = 4;

/**
 * A round stone pedestal with a glowing ring set into its top. The ring and
 * a halo on the ground step through the class's glow ramp, so the pedestal
 * breathes with the character's colour. `top` is the y of the top face's
 * centre, where the character's feet stand.
 */
export function drawPedestal(gfx: Gfx, cx: number, top: number, theme: ClassTheme, time: number): void {
  const level = cycle(PULSE, time * PULSE_STEPS_PER_SECOND);
  const [dim, mid, bright, hot] = theme.glow;

  // Light spilling onto the floor around the base swells a pixel with each pulse step.
  fillEllipse(gfx, cx, top + DEPTH + 1, RX + 2 + level, RY + 1 + level, level === 3 ? mid : dim);

  // Side wall, banded from lit to shadowed, closed by the curved bottom.
  fillEllipse(gfx, cx, top + DEPTH, RX, RY, STONE.shadow);
  STONE.side.forEach((color, band) => {
    const y = top + Math.floor((band * DEPTH) / STONE.side.length);
    const h = Math.ceil(DEPTH / STONE.side.length);
    gfx.fillRect(cx - RX, y, RX * 2, h, color);
  });

  // Top face: lit rim at the back, darker inset, then the glowing ring.
  fillEllipse(gfx, cx, top, RX, RY, STONE.rim);
  fillEllipse(gfx, cx, top + 1, RX - 1, RY - 1, STONE.top);
  fillEllipse(gfx, cx, top + 1, RX - 7, RY - 3, STONE.inset);
  strokeEllipse(gfx, cx, top + 1, RX - 5, RY - 2, level === 3 ? hot : level === 2 ? bright : mid);

  // Contact shadow under the feet.
  fillEllipse(gfx, cx, top, 9, 1, STONE.shadow);
}
