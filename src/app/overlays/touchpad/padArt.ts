import { pixelPath } from '../../pixel/pixelPath';
import type { PadDirection } from './padActions';

/** A pixel mask: true where the shape is filled. */
type Mask = (x: number, y: number) => boolean;

function rows(width: number, height: number, mask: Mask): string[] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (mask(x, y) ? '#' : '.')).join(''),
  );
}

/** Pixels of `mask` whose neighbour at (dx, dy) is outside it: a one-pixel rim on that side. */
function rim(mask: Mask, dx: number, dy: number): Mask {
  return (x, y) => mask(x, y) && !mask(x + dx, y + dy);
}

const shifted =
  (mask: Mask, dx: number, dy: number): Mask =>
  (x, y) =>
    mask(x - dx, y - dy);

// ── D-pad ─────────────────────────────────────────────────────────────────

export const DPAD_SIZE = 27;
const ARM = { from: 9, to: 17 } as const;
const CENTRE = (DPAD_SIZE - 1) / 2;

const inRange = (value: number): boolean => value >= 0 && value < DPAD_SIZE;
const cross: Mask = (x, y) =>
  inRange(x) && inRange(y) && ((x >= ARM.from && x <= ARM.to) || (y >= ARM.from && y <= ARM.to));

/** The arm a pixel belongs to, for drawing a pressed arm darker. */
function armOf(x: number, y: number): PadDirection | null {
  if (!cross(x, y)) return null;
  if (y < ARM.from) return 'up';
  if (y > ARM.to) return 'down';
  if (x < ARM.from) return 'left';
  if (x > ARM.to) return 'right';
  return null;
}

/** Up-pointing arrow on the up arm; the others are rotations of it about the centre. */
const UP_ARROW: readonly (readonly [number, number])[] = [
  [13, 3],
  [12, 4],
  [13, 4],
  [14, 4],
  [11, 5],
  [12, 5],
  [13, 5],
  [14, 5],
  [15, 5],
];

const ROTATE: Readonly<Record<PadDirection, (x: number, y: number) => readonly [number, number]>> = {
  up: (x, y) => [x, y],
  right: (x, y) => [DPAD_SIZE - 1 - y, x],
  down: (x, y) => [DPAD_SIZE - 1 - x, DPAD_SIZE - 1 - y],
  left: (x, y) => [y, DPAD_SIZE - 1 - x],
};

function arrow(direction: PadDirection): string {
  const points = new Set(UP_ARROW.map(([x, y]) => ROTATE[direction](x, y).join(',')));
  return pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => points.has(`${x},${y}`)));
}

const dimple: Mask = (x, y) => Math.hypot(x - CENTRE, y - CENTRE) <= 2.6;

export const dpadArt = {
  shadow: pixelPath(rows(DPAD_SIZE + 2, DPAD_SIZE + 2, shifted(cross, 2, 2))),
  outline: pixelPath(
    rows(
      DPAD_SIZE,
      DPAD_SIZE,
      (x, y) => !cross(x, y) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => cross(x + dx, y + dy))),
    ),
  ),
  body: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, cross)),
  highlight: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => rim(cross, 0, -1)(x, y) || rim(cross, -1, 0)(x, y))),
  shade: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => rim(cross, 0, 1)(x, y) || rim(cross, 1, 0)(x, y))),
  dimple: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, dimple)),
  arms: {
    up: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => armOf(x, y) === 'up')),
    down: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => armOf(x, y) === 'down')),
    left: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => armOf(x, y) === 'left')),
    right: pixelPath(rows(DPAD_SIZE, DPAD_SIZE, (x, y) => armOf(x, y) === 'right')),
  },
  arrows: { up: arrow('up'), down: arrow('down'), left: arrow('left'), right: arrow('right') },
} as const;

// ── Round buttons (Neo Geo A/B/C/D) ───────────────────────────────────────

export const BUTTON_RADIUS = 6;
/** Face plus a one-pixel dark ring. */
export const BUTTON_SIZE = (BUTTON_RADIUS + 1) * 2 + 1;
const BUTTON_CENTRE = BUTTON_RADIUS + 1;

const disc =
  (radius: number, cx = BUTTON_CENTRE, cy = BUTTON_CENTRE): Mask =>
  (x, y) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= (radius + 0.5) ** 2;

const face = disc(BUTTON_RADIUS);
const pressedFace = disc(BUTTON_RADIUS, BUTTON_CENTRE, BUTTON_CENTRE + 1);

export const buttonArt = {
  ring: pixelPath(
    rows(
      BUTTON_SIZE,
      BUTTON_SIZE + 1,
      (x, y) => disc(BUTTON_RADIUS + 1)(x, y) || disc(BUTTON_RADIUS + 1, BUTTON_CENTRE, BUTTON_CENTRE + 1)(x, y),
    ),
  ),
  face: pixelPath(rows(BUTTON_SIZE, BUTTON_SIZE, face)),
  /** Lower-right rim in the button's dark tone: the curvature of a domed cap. */
  shade: pixelPath(rows(BUTTON_SIZE, BUTTON_SIZE, (x, y) => face(x, y) && !face(x + 2, y + 2))),
  highlight: pixelPath(
    rows(BUTTON_SIZE, BUTTON_SIZE, (x, y) => face(x, y) && !face(x - 1, y - 2) && y < BUTTON_CENTRE),
  ),
  glint: pixelPath(
    rows(BUTTON_SIZE, BUTTON_SIZE, (x, y) => (x === 4 && y === 4) || (x === 5 && y === 3) || (x === 4 && y === 3)),
  ),
  pressedFace: pixelPath(rows(BUTTON_SIZE, BUTTON_SIZE + 1, pressedFace)),
} as const;

// ── START capsule ─────────────────────────────────────────────────────────

export const START_SIZE = { w: 15, h: 6 } as const;
const capsule: Mask = (x, y) => {
  if (x < 0 || y < 0 || x >= START_SIZE.w || y >= START_SIZE.h - 1) return false;
  const cornerX = x < 2 ? 2 - x : x > START_SIZE.w - 3 ? x - (START_SIZE.w - 3) : 0;
  const cornerY = y < 1 ? 1 : y > START_SIZE.h - 3 ? 1 : 0;
  return !(cornerX === 2 && cornerY === 1) && !(cornerX === 2 && (y === 0 || y === START_SIZE.h - 2));
};

export const startArt = {
  outline: pixelPath(
    rows(START_SIZE.w + 2, START_SIZE.h + 2, (x, y) => {
      const inner = shifted(capsule, 1, 1);
      return !inner(x, y) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => inner(x + dx, y + dy)));
    }),
  ),
  shadow: pixelPath(rows(START_SIZE.w, START_SIZE.h, shifted(capsule, 0, 1))),
  body: pixelPath(rows(START_SIZE.w, START_SIZE.h, capsule)),
  highlight: pixelPath(rows(START_SIZE.w, START_SIZE.h, rim(capsule, 0, -1))),
  pressed: pixelPath(rows(START_SIZE.w, START_SIZE.h, shifted(capsule, 0, 1))),
} as const;
