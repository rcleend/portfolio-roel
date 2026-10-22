import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rng } from '@/engine/math/Rng';
import { blink } from '@/engine/motion/oscillators';
import type { Effect } from './Effect';

export interface BurstSpec {
  readonly count: number;
  readonly colors: readonly string[];
  /** Launch speed range in px/s. */
  readonly speed: readonly [number, number];
  /** Launch angle range in radians; 0 is right, -π/2 is up. */
  readonly angle: readonly [number, number];
  readonly gravity: number;
  /** Lifetime range in seconds. */
  readonly life: readonly [number, number];
  /** Square particle size in px (1 or 2 read as pixel debris). */
  readonly size: number;
}

/** One piece of debris as a look sees it: where it is, how old, and the colour it was dealt. */
export interface ParticleView {
  readonly x: number;
  readonly y: number;
  readonly age: number;
  readonly life: number;
  readonly color: string;
}

/** A burst as a look sees it. Drawing never touches the random stream: every roll happened at launch. */
export interface BurstView {
  /** Where it went off. */
  readonly x: number;
  readonly y: number;
  readonly age: number;
  readonly particles: readonly ParticleView[];
  /** Square particle size in px. */
  readonly size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  readonly life: number;
  readonly color: string;
}

/**
 * Pixel debris flying out of a point: hit sparks, bubble pops, paint drops,
 * confetti. Particles blink out over their last quarter instead of fading,
 * the way hardware sprites disappear.
 */
export class Burst implements Effect, BurstView {
  readonly x: number;
  readonly y: number;
  readonly #particles: Particle[];
  readonly #spec: BurstSpec;
  #age = 0;

  constructor(x: number, y: number, spec: BurstSpec, rng: Rng) {
    this.x = x;
    this.y = y;
    this.#spec = spec;
    this.#particles = Array.from({ length: spec.count }, () => {
      const angle = rng.range(spec.angle[0], spec.angle[1]);
      const speed = rng.range(spec.speed[0], spec.speed[1]);
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: rng.range(spec.life[0], spec.life[1]),
        color: rng.pick(spec.colors),
      };
    });
  }

  get age(): number {
    return this.#age;
  }

  get particles(): readonly ParticleView[] {
    return this.#particles;
  }

  get size(): number {
    return this.#spec.size;
  }

  get done(): boolean {
    return this.#particles.every((particle) => particle.age >= particle.life);
  }

  update(dt: number): void {
    this.#age += dt;
    for (const particle of this.#particles) {
      particle.age += dt;
      particle.vy += this.#spec.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  render(gfx: Gfx): void {
    drawBurst(gfx, this);
  }
}

/** The standard burst: square particles in their dealt colours, blinking out over their last quarter. */
export function drawBurst(gfx: Gfx, burst: BurstView): void {
  const { size } = burst;
  for (const particle of burst.particles) {
    if (particle.age >= particle.life) continue;
    const fading = particle.age > particle.life * 0.75;
    if (fading && !blink(particle.age, 1 / 30, 1 / 30)) continue;
    gfx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size, particle.color);
  }
}

/** Ready-made recipes so every hit, pop and celebration looks the same everywhere. */
export const BURSTS = {
  hitSpark: {
    count: 7,
    colors: ['#ffffff', '#fff4b0', '#ffd84a'],
    speed: [60, 140],
    angle: [-Math.PI, Math.PI],
    gravity: 0,
    life: [0.12, 0.25],
    size: 1,
  },
  bubblePop: {
    count: 12,
    colors: ['#ffffff', '#e4defc', '#c4b8f5'],
    speed: [50, 120],
    angle: [-Math.PI, Math.PI],
    gravity: 120,
    life: [0.2, 0.4],
    size: 2,
  },
  dust: {
    count: 5,
    colors: ['#d6d0dc', '#9a8c9c'],
    speed: [20, 50],
    angle: [-Math.PI, 0],
    gravity: 60,
    life: [0.15, 0.3],
    size: 1,
  },
  confetti: {
    count: 60,
    colors: ['#ff3a4a', '#ffd84a', '#3ddc84', '#6fb6ff', '#ff7ae0', '#ffffff'],
    speed: [80, 220],
    angle: [-Math.PI * 0.95, -Math.PI * 0.05],
    gravity: 220,
    life: [1.2, 2.2],
    size: 2,
  },
  /** A "?" block giving up its highlight. */
  blockSparkle: {
    count: 12,
    colors: ['#ffffff', '#fff4b0', '#ffd84a'],
    speed: [40, 110],
    angle: [-Math.PI, 0],
    gravity: 90,
    life: [0.3, 0.6],
    size: 2,
  },
  /** The north star arriving. */
  starImpact: {
    count: 14,
    colors: ['#ffffff', '#fff4b0', '#ffd84a', '#ff9a1f'],
    speed: [40, 120],
    angle: [-Math.PI, Math.PI],
    gravity: 0,
    life: [0.2, 0.45],
    size: 2,
  },
  /** The escalated customer hitting the ground. */
  bigDust: {
    count: 18,
    colors: ['#d6d0dc', '#9a8c9c', '#6a6280'],
    speed: [40, 120],
    angle: [-Math.PI, 0],
    gravity: 120,
    life: [0.25, 0.5],
    size: 2,
  },
  sparkle: {
    count: 3,
    colors: ['#ffffff', '#fff4b0'],
    speed: [10, 30],
    angle: [-Math.PI, Math.PI],
    gravity: 0,
    life: [0.15, 0.3],
    size: 1,
  },
} as const satisfies Readonly<Record<string, BurstSpec>>;
