import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutCubic } from '@/engine/motion/easing';
import { BOOM } from './colors';
import { STAGE } from './layout';

/** High over the pad, where the rocket left the screen. */
const CENTER = { x: STAGE.pad.x + 1, y: 8 } as const;
const RADIUS = { from: 8, to: 156 } as const;
/** Seen from far below, the ring is a flat ellipse. */
const FLATTEN = 0.24;
/** An inner echo, one step dimmer, so the ring reads as a shock front rather than a drawn line. */
const ECHO = 0.82;

/**
 * The distant sonic boom: a thin ring racing out across the top of the sky
 * (easeOut), dimming one palette step at a time as it goes, with a fainter
 * echo inside it.
 */
export function drawBoom(gfx: Gfx, progress: number): void {
  const rx = RADIUS.from + (RADIUS.to - RADIUS.from) * easeOutCubic(progress);
  const step = Math.min(BOOM.length - 1, Math.floor(progress * BOOM.length));
  ring(gfx, rx, BOOM[step] ?? BOOM[0]);
  const echo = BOOM[step + 1];
  if (echo) ring(gfx, rx * ECHO, echo);
}

/** A gap-free 1 px ellipse outline: sampled along both axes, so its flat and steep stretches are both closed. */
function ring(gfx: Gfx, radiusX: number, color: string): void {
  const rx = Math.round(radiusX);
  const ry = Math.max(1, Math.round(radiusX * FLATTEN));
  for (let dx = -rx; dx <= rx; dx++) {
    const dy = Math.round(ry * Math.sqrt(1 - (dx / rx) ** 2));
    gfx.pixel(CENTER.x + dx, CENTER.y + dy, color);
    if (CENTER.y - dy >= 0) gfx.pixel(CENTER.x + dx, CENTER.y - dy, color);
  }
  for (let dy = -ry; dy <= ry; dy++) {
    if (CENTER.y + dy < 0) continue;
    const dx = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
    gfx.pixel(CENTER.x + dx, CENTER.y + dy, color);
    gfx.pixel(CENTER.x - dx, CENTER.y + dy, color);
  }
}
