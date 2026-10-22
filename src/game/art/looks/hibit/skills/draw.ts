import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { Vec2 } from '@/engine/math/Vec2';
import type { BurstView } from '@/game/entities/effects/Burst';
import type { CasterSnapshot } from '@/game/skills/SkillVisual';

/**
 * The drawing kit the six hibit skill looks share (docs/looks/hibit-skills.md):
 * frame-exact playback of their strips, the look's palette for what code
 * draws, banded rings and sparks in the hibit style.
 */

/** A six-tone ramp, dark to light: tone 0 is the keyline, tone 5 the hottest highlight. */
export type Ramp = readonly [string, string, string, string, string, string];

export const WHITE = '#ffffff';

/** The ramps code draws with; the generator paints the strips from the same values (tools/looks/hibit/skills/hibitfx/palette.py). */
export const RAMPS = {
  cyan: ['#0f1f4a', '#14497c', '#1b86b8', '#34c4e8', '#86f2ff', '#dcfdff'],
  violet: ['#1d1142', '#3c2484', '#653fc6', '#9670f2', '#c8acff', '#f0e6ff'],
  amber: ['#3b1208', '#7c2e0c', '#c66414', '#f4a226', '#ffd65c', '#fff4bc'],
  potion: ['#37082f', '#701556', '#b22684', '#ea47a0', '#ff8ac4', '#ffd8ee'],
  calm: ['#2c1a4c', '#5a3c8c', '#9a78d0', '#d0a8f0', '#ffd0f0', '#fff4fc'],
  mint: ['#0c3a3a', '#167060', '#2eae8a', '#68e0b0', '#b4f8d8', '#eefff8'],
  sound: ['#1a0f3e', '#3a2490', '#6a4ad8', '#a690ff', '#d8ccff', '#ffffff'],
  gold: ['#4a1608', '#9a3a0c', '#e07418', '#ffae2a', '#ffe066', '#fffad0'],
  bubble: ['#0b2840', '#125876', '#2499bc', '#58d6ee', '#b6f6ff', '#ffffff'],
} as const satisfies Readonly<Record<string, Ramp>>;

/** The world is one screen tall: rows outside it are never seen, so banded rings skip them. */
const WORLD_ROWS = { top: 0, bottom: 240 } as const;

/** Frame `index` of `animation`, clamped to the strip, with the sheet's origin on (x, y). */
export function drawFrame(
  gfx: Gfx,
  sheet: SpriteSheet,
  animation: string,
  index: number,
  x: number,
  y: number,
  flipX = false,
): void {
  const count = sheet.frameCount(animation);
  const frame = Math.min(count - 1, Math.max(0, Math.floor(index)));
  // The middle of the frame's slot, so float rounding never lands on a neighbour.
  gfx.sprite(sheet, animation, ((frame + 0.5) / count) * sheet.duration(animation), x, y, { flipX });
}

/** Which frame of a strip playing at `fps` shows `seconds` after it started. */
export function frameAt(seconds: number, fps: number): number {
  return Math.floor(Math.max(0, seconds) * fps + 1e-9);
}

/** One band of a banded ring: `width` px of `color`, every `every`-th row only (2 is a scanline dither). */
export interface RingBand {
  readonly color: string;
  readonly width: number;
  readonly every?: number;
}

/**
 * A ring of concentric bands, outermost first, filled row by row so
 * neighbouring bands never leave gaps (stacked midpoint circles do).
 */
export function drawBandedRing(gfx: Gfx, x: number, y: number, outer: number, bands: readonly RingBand[]): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  let radius = outer;
  for (const band of bands) {
    const inner = Math.max(0, radius - band.width);
    if (radius <= 0) return;
    fillAnnulus(gfx, cx, cy, radius, inner, band.color, band.every ?? 1);
    radius = inner;
  }
}

function fillAnnulus(gfx: Gfx, cx: number, cy: number, outer: number, inner: number, color: string, every: number): void {
  const top = Math.max(WORLD_ROWS.top, cy - Math.ceil(outer));
  const bottom = Math.min(WORLD_ROWS.bottom - 1, cy + Math.ceil(outer));
  for (let row = top; row <= bottom; row++) {
    if (every > 1 && row % every !== 0) continue;
    const dy = row - cy;
    if (Math.abs(dy) > outer) continue;
    const reach = Math.round(Math.sqrt(outer * outer - dy * dy));
    if (Math.abs(dy) >= inner) {
      gfx.fillRect(cx - reach, row, reach * 2 + 1, 1, color);
      continue;
    }
    const hole = Math.round(Math.sqrt(inner * inner - dy * dy));
    const width = Math.max(1, reach - hole);
    gfx.fillRect(cx - reach, row, width, 1, color);
    gfx.fillRect(cx + reach - width + 1, row, width, 1, color);
  }
}

/**
 * The spark burst the world rolled, drawn in the hibit style: every particle
 * a small cross that shrinks and cools along `ramp` instead of blinking out.
 * Positions and lifetimes are the world's; only the drawing is the look's.
 */
export function drawSparks(gfx: Gfx, burst: BurstView, ramp: Ramp): void {
  for (const particle of burst.particles) {
    if (particle.age >= particle.life) continue;
    const t = particle.age / particle.life;
    const x = Math.round(particle.x);
    const y = Math.round(particle.y);
    if (t < 0.35) {
      gfx.pixel(x, y, WHITE);
      gfx.pixel(x - 1, y, ramp[4]);
      gfx.pixel(x + 1, y, ramp[4]);
      gfx.pixel(x, y - 1, ramp[4]);
      gfx.pixel(x, y + 1, ramp[4]);
    } else {
      gfx.pixel(x, y, t < 0.7 ? ramp[5] : ramp[3]);
    }
  }
}

/** A 1 px line with every other pixel left out: a tether, a signal. */
export function drawDottedLine(gfx: Gfx, from: Vec2, to: Vec2, color: string, phase = 0): void {
  const x0 = Math.round(from.x);
  const y0 = Math.round(from.y);
  const steps = Math.max(Math.abs(Math.round(to.x) - x0), Math.abs(Math.round(to.y) - y0));
  for (let i = 0; i <= steps; i++) {
    if ((i + phase) % 2 === 1) continue;
    const t = steps === 0 ? 0 : i / steps;
    gfx.pixel(Math.round(x0 + (to.x - x0) * t), Math.round(y0 + (to.y - y0) * t), color);
  }
}

/** Classic heroes stand 40 px tall; how much higher a look's chest, hands and mouth sit on a taller hero. */
export function chestLift(heroHeight: number): number {
  return Math.max(0, Math.round((heroHeight - 40) * 0.75));
}

/** The hero's mouth: the pose's `mouth` anchor, or where a mouth sits on a hero this tall. */
export function mouthOf(caster: CasterSnapshot): Vec2 {
  return caster.anchor('mouth') ?? { x: caster.x + caster.facing * 5, y: caster.feet - Math.round(caster.height * 0.78) };
}

/** The hand a skill pose holds things in: the `hand` anchor, or in front of a hero this tall at chest height. */
export function handOf(caster: CasterSnapshot): Vec2 {
  return caster.hand ?? { x: caster.x + caster.facing * 10, y: caster.feet - 17 - chestLift(caster.height) };
}
