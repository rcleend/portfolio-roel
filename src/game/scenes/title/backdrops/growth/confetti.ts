import { parseHex } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import { Rng } from '@/engine/math/Rng';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { bitmapToCanvas } from '../../../../art/logos/raster/toCanvas';
import { CHART } from './layout';
import { AXIS, CYAN, INK } from './palette';
import type { Pixel } from './series';

/**
 * The burst where the line breaks the ceiling: the chart's own data-point
 * markers (squares, plus signs and triangles) and a few splinters of the
 * ceiling, flung up and out, spinning in 90° steps and cooling through the
 * phosphor ramp as they fall. Behind them, smaller and slower, dimmer
 * specks fall further back: parallax that gives the flat terminal depth.
 * Each piece is a pure function of its age.
 */

/** Marker shapes, each in four spin steps, on a 5 × 5 grid centred on (2, 2). */
const SHAPES = {
  /** A splinter of the ceiling. */
  splinter: [
    ['.....', '.....', '.###.', '.....', '.....'],
    ['.....', '...#.', '..#..', '.#...', '.....'],
    ['.....', '..#..', '..#..', '..#..', '.....'],
    ['.....', '.#...', '..#..', '...#.', '.....'],
  ],
  /** A square data point, turning onto its corner and back. */
  square: [
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
  ],
  /** A plus-sign data point, turning into a cross and back. */
  cross: [
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.#.#.', '..#..', '.#.#.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['.....', '.#.#.', '..#..', '.#.#.', '.....'],
  ],
  /** A triangle data point, turning a quarter at a time. */
  triangle: [
    ['.....', '..#..', '.###.', '.....', '.....'],
    ['.....', '.#...', '.##..', '.#...', '.....'],
    ['.....', '.....', '.###.', '..#..', '.....'],
    ['.....', '...#.', '..##.', '...#.', '.....'],
  ],
  /** A far-off fleck: two pixels, tumbling. */
  speck: [
    ['.....', '.....', '..##.', '.....', '.....'],
    ['.....', '...#.', '..#..', '.....', '.....'],
    ['.....', '..#..', '..#..', '.....', '.....'],
    ['.....', '..#..', '...#.', '.....', '.....'],
  ],
} as const;

type Shape = keyof typeof SHAPES;
const SHAPE_NAMES = Object.keys(SHAPES) as Shape[];
const MARKERS: readonly Shape[] = ['square', 'cross', 'triangle'];
const SPIN_STEPS = 4;
const SPRITE = 5;

/** Each family cools white-hot → hot → lit → dim over a piece's life. */
const FAMILIES = {
  green: ['#ffffff', INK[4], INK[3], INK[2]],
  cyan: ['#ffffff', CYAN[4], CYAN[3], CYAN[2]],
  ceiling: ['#ffffff', CYAN[4], AXIS, CYAN[2]],
  /** Far specks start a step cooler, so distance reads as dimness too. */
  far: [INK[4], INK[3], INK[2], INK[1]],
} as const;

type Family = keyof typeof FAMILIES;
const FAMILY_NAMES = Object.keys(FAMILIES) as Family[];
const HEATS = 4;

/** One piece of confetti: where and how it was flung, and how it falls, spins and cools. */
export interface Confetto {
  readonly x: number;
  readonly y: number;
  /** Launch velocity, pixels per frame. */
  readonly vx: number;
  readonly vy: number;
  /** The speed it flutters down at once the air has caught it, pixels per frame: far pieces fall slower, as parallax has them. */
  readonly fall: number;
  /** Frames until it has cooled out. */
  readonly life: number;
  /** Frames per 90° spin step; 0 for none. */
  readonly spin: number;
  /** The spin step it starts on. */
  readonly phase: number;
  readonly shape: Shape;
  readonly family: Family;
}

/** Launch directions in degrees (0 is right, −90 up) and the share of pieces thrown that way. */
interface Lane {
  readonly share: number;
  readonly angle: readonly [number, number];
}

/**
 * How the burst behaves. Lively pieces mostly skid out to the left along
 * the top of the screen, above the logo, since the breach sits by the
 * screen's right edge; some go up and come down later and a few drop
 * straight down past the rising line. Under reduced motion there is no
 * throw: a few pieces start spread along the top and drift down slowly
 * without spinning.
 */
const BURST = {
  lively: {
    near: 30,
    far: 18,
    splinters: 3,
    spread: { x: [-2, 2], y: [-1, 1] },
    lanes: [
      { share: 0.65, angle: [-180, -160] },
      { share: 0.25, angle: [-160, -110] },
      { share: 0.1, angle: [95, 125] },
    ],
    speed: [3, 11],
    spin: [3, 6],
    life: [70, 110],
    fall: 0.6,
  },
  calm: {
    near: 8,
    far: 6,
    splinters: 2,
    spread: { x: [-120, -4], y: [-10, 4] },
    lanes: [{ share: 1, angle: [-180, 0] }],
    speed: [0, 0.15],
    spin: [0, 0],
    life: [90, 120],
    fall: 0.3,
  },
} as const;
/** How much slower far pieces move and fall than near ones. */
const FAR_DEPTH = 0.5;
/**
 * Air drag: each frame a piece keeps this share of its speed relative to
 * its fall, so it bursts out fast, slows, and flutters down.
 */
const DRAG = 0.93;
const SEED = 0x35ab;

/** The pieces flung from `origin`, far ones first so near ones draw over them. */
export function burstFrom(origin: Pixel, reducedMotion: boolean): readonly Confetto[] {
  const style = reducedMotion ? BURST.calm : BURST.lively;
  const rng = new Rng(SEED);
  const piece = (depth: number, shape: Shape, family: Family): Confetto => {
    const lane = laneFor(style.lanes, rng.next());
    const angle = rng.range(lane.angle[0], lane.angle[1]) * (Math.PI / 180);
    const speed = rng.range(style.speed[0], style.speed[1]) * depth;
    return {
      x: origin.x + rng.int(style.spread.x[0], style.spread.x[1]),
      y: origin.y + rng.int(style.spread.y[0], style.spread.y[1]),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      fall: style.fall * depth,
      life: rng.int(style.life[0], style.life[1]),
      spin: style.spin[1] === 0 ? 0 : rng.int(style.spin[0], style.spin[1]),
      phase: rng.int(0, SPIN_STEPS - 1),
      shape,
      family,
    };
  };
  const far = Array.from({ length: style.far }, () => piece(FAR_DEPTH, 'speck', 'far'));
  const near = Array.from({ length: style.near }, (_, index) =>
    index < style.splinters
      ? piece(1, 'splinter', 'ceiling')
      : piece(1, rng.pick(MARKERS), rng.chance(0.65) ? 'green' : 'cyan'),
  );
  return [...far, ...near];
}

/** The lane a uniform draw `pick` in [0, 1) falls in, by their shares. */
function laneFor(lanes: readonly Lane[], pick: number): Lane {
  let total = 0;
  for (const lane of lanes) {
    total += lane.share;
    if (pick < total) return lane;
  }
  return lanes[lanes.length - 1] as Lane;
}

/** Where a piece is at some age and how it looks: filled in by `placeConfetto`, and reused so drawing allocates nothing. */
export interface ConfettoPose {
  x: number;
  y: number;
  /** Spin step, 0–3. */
  spin: number;
  /** Cooling step, 0 (white-hot) to 3 (dim). */
  heat: number;
}

/**
 * Places a piece `age` frames after the burst: its throw dies away under
 * drag while it settles into a steady flutter downwards (the closed form
 * of a velocity that eases towards the fall speed by `DRAG` each frame), a
 * spin step every few frames and a step cooler every quarter of its life.
 * False once it has cooled out or fallen through the floor.
 */
export function placeConfetto(piece: Confetto, age: number, pose: ConfettoPose): boolean {
  if (age < 0 || age >= piece.life) return false;
  const thrown = (1 - DRAG ** age) / (1 - DRAG);
  pose.x = Math.round(piece.x + piece.vx * thrown);
  pose.y = Math.round(piece.y + (piece.vy - piece.fall) * thrown + piece.fall * age);
  pose.spin = piece.spin === 0 ? 0 : (piece.phase + Math.floor(age / piece.spin)) % SPIN_STEPS;
  pose.heat = Math.floor((age * HEATS) / piece.life);
  return pose.y < CHART.bottom - 2;
}

/** Every shape × spin step × family × heat on one small sheet, painted once. */
export interface ConfettiSheet {
  readonly canvas: HTMLCanvasElement;
  /** Source x of a shape's spin step. */
  column(shape: Shape, spin: number): number;
  /** Source y of a family's heat. */
  row(family: Family, heat: number): number;
}

export function paintConfettiSheet(): ConfettiSheet {
  const sheet = new Bitmap(SPRITE * SHAPE_NAMES.length * SPIN_STEPS, SPRITE * FAMILY_NAMES.length * HEATS);
  const column = (shape: Shape, spin: number): number => (SHAPE_NAMES.indexOf(shape) * SPIN_STEPS + spin) * SPRITE;
  const row = (family: Family, heat: number): number => (FAMILY_NAMES.indexOf(family) * HEATS + heat) * SPRITE;
  for (const shape of SHAPE_NAMES) {
    SHAPES[shape].forEach((rows, spin) => {
      for (const family of FAMILY_NAMES) {
        FAMILIES[family].forEach((ink, heat) => {
          const color = parseHex(ink);
          rows.forEach((line, y) => {
            [...line].forEach((cell, x) => {
              if (cell === '#') sheet.set(column(shape, spin) + x, row(family, heat) + y, color);
            });
          });
        });
      }
    });
  }
  return { canvas: bitmapToCanvas(sheet), column, row };
}

/** Draws the burst `age` frames after the break. */
export function drawBurst(gfx: Gfx, sheet: ConfettiSheet, pieces: readonly Confetto[], age: number): void {
  const pose: ConfettoPose = { x: 0, y: 0, spin: 0, heat: 0 };
  for (const piece of pieces) {
    if (!placeConfetto(piece, age, pose)) continue;
    const sx = sheet.column(piece.shape, pose.spin);
    const sy = sheet.row(piece.family, pose.heat);
    // Straight to the context: Gfx.image would allocate a source rectangle per piece, every frame.
    gfx.ctx.drawImage(sheet.canvas, sx, sy, SPRITE, SPRITE, pose.x - 2, pose.y - 2, SPRITE, SPRITE);
  }
}
