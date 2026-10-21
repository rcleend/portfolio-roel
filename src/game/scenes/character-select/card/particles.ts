import { shade } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rng } from '@/engine/math/Rng';
import { mod } from '@/engine/math/scalar';
import { wobble } from '@/engine/motion/oscillators';
import type { ParticleKind } from '../classThemes';
import { cycle, type NonEmpty } from '../cycle';

/**
 * Class-themed particles drifting through the card: green code glyphs float
 * up for Hackerman, paint flecks tumble down for Artsy, sticky notes flutter
 * down for Strategy. Each particle is a handful of numbers and its position
 * is a pure function of time, so nothing is simulated and every frame is
 * reproducible.
 */
export interface Particle {
  readonly x: number;
  readonly y: number;
  /** Pixels per second along the drift direction. */
  readonly speed: number;
  /** Horizontal sway amplitude in pixels. */
  readonly sway: number;
  readonly swayPeriod: number;
  readonly phase: number;
  /** Picks the glyph or colour. */
  readonly variant: number;
  /** Near particles are larger, brighter and faster: a cheap sense of depth. */
  readonly near: boolean;
}

interface KindSpec {
  readonly count: number;
  /** -1 rises, 1 falls. */
  readonly direction: -1 | 1;
  readonly speed: readonly [number, number];
  readonly sway: readonly [number, number];
}

const SPECS: Readonly<Record<ParticleKind, KindSpec>> = {
  code: { count: 10, direction: -1, speed: [5, 12], sway: [0, 0] },
  paint: { count: 22, direction: 1, speed: [6, 13], sway: [1, 3] },
  notes: { count: 10, direction: 1, speed: [4, 8], sway: [3, 6] },
};

/** Particles wrap a little outside the area so they never pop in or out on screen. */
const MARGIN = 8;

export function createParticles(kind: ParticleKind, rng: Rng, width: number, height: number): Particle[] {
  const spec = SPECS[kind];
  return Array.from({ length: spec.count }, () => {
    const near = rng.chance(0.4);
    const speedScale = near ? 1 : 0.6;
    return {
      x: rng.int(2, width - 12),
      y: rng.int(0, height + MARGIN * 2),
      speed: rng.range(spec.speed[0], spec.speed[1]) * speedScale,
      sway: rng.range(spec.sway[0], spec.sway[1]),
      swayPeriod: rng.range(1.8, 3.4),
      phase: rng.range(0, 4),
      variant: rng.int(0, 255),
      near,
    };
  });
}

export function particlePosition(
  kind: ParticleKind,
  particle: Particle,
  time: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const spec = SPECS[kind];
  const travel = particle.y + spec.direction * particle.speed * time;
  return {
    x: Math.round(particle.x + wobble(time, particle.sway, particle.swayPeriod, particle.phase)),
    y: Math.round(mod(travel, height + MARGIN * 2) - MARGIN),
  };
}

export function drawParticles(
  gfx: Gfx,
  kind: ParticleKind,
  particles: readonly Particle[],
  originX: number,
  originY: number,
  height: number,
  time: number,
): void {
  const draw = DRAWERS[kind];
  for (const particle of particles) {
    const { x, y } = particlePosition(kind, particle, time, height);
    draw(gfx, originX + x, originY + y, particle, time);
  }
}

type Drawer = (gfx: Gfx, x: number, y: number, particle: Particle, time: number) => void;

// ── Code glyphs ───────────────────────────────────────────────────────────

/** 3 × 5 glyphs, just enough to spell a few tokens of code. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '{': ['.##', '.#.', '#..', '.#.', '.##'],
  '}': ['##.', '.#.', '..#', '.#.', '##.'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '=': ['...', '###', '...', '###', '...'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  ';': ['.', '#', '.', '#', '#'],
};
const TOKENS: NonEmpty<string> = ['</>', '{}', '01', '=>', '()', '1;', '10'];

const drawCode: Drawer = (gfx, x, y, particle, time) => {
  // Tokens re-roll every couple of seconds, like a terminal that is still compiling.
  const token = cycle(TOKENS, particle.variant + Math.floor((time + particle.phase) * 0.5));
  const color = particle.near ? '#3ddc84' : '#1c6e4c';
  let pen = x;
  for (const char of token) {
    const glyph = GLYPHS[char] ?? [];
    glyph.forEach((row, dy) => {
      [...row].forEach((cell, dx) => {
        if (cell === '#') gfx.pixel(pen + dx, y + dy, dy === 0 && particle.near ? '#b6ffd2' : color);
      });
    });
    pen += (glyph[0]?.length ?? 0) + 1;
  }
};

// ── Paint flecks ──────────────────────────────────────────────────────────

const PAINT: NonEmpty<string> = ['#e2352d', '#ffc83d', '#1fb5a6', '#ff5fa2', '#6fb6ff'];
/** Width × height per tumble frame: a fleck flips between a dash, a blob and a drop as it falls. */
const TUMBLE: NonEmpty<readonly [w: number, h: number]> = [
  [3, 1],
  [2, 2],
  [1, 3],
  [2, 2],
];

const drawPaint: Drawer = (gfx, x, y, particle, time) => {
  const base = cycle(PAINT, particle.variant);
  if (!particle.near) {
    gfx.pixel(x, y, shade(base, -0.45));
    return;
  }
  const [w, h] = cycle(TUMBLE, (time + particle.phase) * 7);
  gfx.fillRect(x, y, w, h, base);
};

// ── Sticky notes ──────────────────────────────────────────────────────────

const NOTES: NonEmpty<readonly [paper: string, strip: string]> = [
  ['#ffe14d', '#d9b21f'],
  ['#ff8ad0', '#d65aa6'],
  ['#8fd0ff', '#4f9fe0'],
  ['#a5ec7a', '#5fb84a'],
];

const drawNote: Drawer = (gfx, x, y, particle, time) => {
  const [paper, strip] = cycle(NOTES, particle.variant);
  if (!particle.near) {
    gfx.fillRect(x, y, 3, 3, shade(paper, -0.5));
    return;
  }
  // At the ends of its sway the note tilts edge-on and foreshortens, the way paper flutters.
  const swing = Math.abs(Math.sin(((time / particle.swayPeriod) * 2 + particle.phase) * Math.PI));
  const h = swing > 0.85 ? 3 : 6;
  gfx.fillRect(x, y, 6, h, paper);
  gfx.fillRect(x, y, 6, 1, strip);
  if (h === 6) {
    // Two scribbled lines of "notes".
    gfx.fillRect(x + 1, y + 2, 4, 1, strip);
    gfx.fillRect(x + 1, y + 4, 3, 1, strip);
  }
};

const DRAWERS: Readonly<Record<ParticleKind, Drawer>> = { code: drawCode, paint: drawPaint, notes: drawNote };
