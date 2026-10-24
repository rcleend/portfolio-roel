import type { Gfx } from '@/engine/gfx/Gfx';
import { bob } from '@/engine/motion/oscillators';
import { INK, shadeOf } from '../title/backdrops/blueprint/inks';
import { ARROW_FLASH_SECONDS } from './choreography';
import { ARROW_LEFT_TIP, ARROW_RIGHT_TIP } from './layout';

const LENGTH = 10;

/** Blueprint inks, as the card's frame is drawn in, and a yellow and white flash. */
const COLORS = {
  outline: shadeOf(0),
  shadow: shadeOf(0),
  light: shadeOf(INK.hot),
  lit: shadeOf(INK.pale),
  shade: shadeOf(INK.ghost),
  flashA: '#ffe14d',
  flashB: '#ffffff',
} as const;

export interface ArrowState {
  /** Seconds since this arrow was last pressed, or `null` if never. */
  readonly pressedAgo: number | null;
  readonly hovered: boolean;
}

/**
 * The two chunky triangular arrows beside the card. They bob outwards in two
 * hard poses; a press kicks the arrow a further two pixels out and flashes it
 * yellow and white for a few frames.
 */
export function drawArrows(gfx: Gfx, time: number, left: ArrowState, right: ArrowState): void {
  const nudge = bob(time, 2, 0.6);
  drawArrow(gfx, ARROW_LEFT_TIP.x, ARROW_LEFT_TIP.y, -1, nudge, left);
  drawArrow(gfx, ARROW_RIGHT_TIP.x, ARROW_RIGHT_TIP.y, 1, nudge, right);
}

function drawArrow(gfx: Gfx, tipX: number, tipY: number, direction: -1 | 1, nudge: number, state: ArrowState): void {
  const flashing = state.pressedAgo !== null && state.pressedAgo < ARROW_FLASH_SECONDS;
  const kick = flashing ? 2 : 0;
  const x = tipX + direction * (nudge + kick);
  const flashColor = flashing && state.pressedAgo !== null && Math.floor(state.pressedAgo * 30) % 2 === 0;
  const top = flashing ? (flashColor ? COLORS.flashA : COLORS.flashB) : COLORS.light;
  const bottom = flashing ? top : state.hovered ? COLORS.lit : COLORS.shade;

  // Column by column from the tip back to the base, so every edge is a clean stair step.
  for (let i = 0; i < LENGTH; i++) {
    const column = x - direction * i;
    const span = i;
    gfx.fillRect(column + 1, tipY - span + 1, 1, span * 2 + 1, COLORS.shadow);
  }
  for (let i = 0; i < LENGTH; i++) {
    const column = x - direction * i;
    const span = i;
    gfx.fillRect(column, tipY - span - 1, 1, span * 2 + 3, COLORS.outline);
  }
  for (let i = 1; i < LENGTH - 1; i++) {
    const column = x - direction * i;
    const span = i - 1;
    gfx.fillRect(column, tipY - span, 1, span + 1, top);
    gfx.fillRect(column, tipY + 1, 1, span, bottom);
  }
}
