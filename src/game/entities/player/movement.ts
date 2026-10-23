import { approach } from '@/engine/math/scalar';
import type { Body } from '../../world/collision';
import type { JumpEnvelope } from '../../world/map/validateLayout';

/**
 * Movement tuning in px and seconds. Snappy rather than floaty: full speed in
 * about a tenth of a second, a heavier fall than rise, and a ~70 px jump
 * (just over four tiles) that clears a three-tile pit with room to spare.
 */
export const MOVEMENT = {
  runSpeed: 110,
  groundAccel: 1200,
  groundDecel: 1500,
  airAccel: 850,
  airDecel: 450,
  /** While rising with jump held. */
  riseGravity: 1150,
  /** While falling, or rising after jump was released. */
  fallGravity: 1500,
  jumpSpeed: 400,
  /** Releasing jump early caps the upward speed here: tap for a hop, hold for the full jump. */
  jumpCutSpeed: 140,
  maxFallSpeed: 440,
  /** Grace period to still jump after running off a ledge. */
  coyoteTime: 0.1,
  /** A jump pressed this long before landing still happens on landing. */
  jumpBuffer: 0.12,
} as const;

export type MovementTuning = typeof MOVEMENT;

/** What the player wants this step, independent of keys or gamepads. */
export interface MoveIntent {
  readonly x: -1 | 0 | 1;
  readonly jumpPressed: boolean;
  readonly jumpHeld: boolean;
}

/** Temporary multipliers from the environment, e.g. scope-creep vines. */
export interface MoveScale {
  readonly speed: number;
  readonly jump: number;
}

export const NORMAL_SCALE: MoveScale = { speed: 1, jump: 1 };

/**
 * The feel of a platformer jump: coyote time, jump buffering, variable jump
 * height and separate rise/fall gravity. It only changes velocities; collision
 * is resolved afterwards by `moveBody`, whose result is fed back via `settle`.
 */
export class PlatformerMotor {
  readonly #tuning: MovementTuning;
  #grounded = false;
  #coyote = 0;
  #buffer = 0;
  #rising = false;

  constructor(tuning: MovementTuning = MOVEMENT) {
    this.#tuning = tuning;
  }

  get grounded(): boolean {
    return this.#grounded;
  }

  /** Applies one step of intent and gravity to the body's velocity; returns true on the step a jump starts. */
  step(body: Body, intent: MoveIntent, dt: number, scale: MoveScale = NORMAL_SCALE): boolean {
    const t = this.#tuning;
    this.#buffer = intent.jumpPressed ? t.jumpBuffer : Math.max(0, this.#buffer - dt);
    this.#coyote = this.#grounded ? t.coyoteTime : Math.max(0, this.#coyote - dt);

    const accel = this.#grounded
      ? intent.x !== 0
        ? t.groundAccel
        : t.groundDecel
      : intent.x !== 0
        ? t.airAccel
        : t.airDecel;
    body.vx = approach(body.vx, intent.x * t.runSpeed * scale.speed, accel * dt);

    let jumped = false;
    if (this.#buffer > 0 && this.#coyote > 0) {
      body.vy = -t.jumpSpeed * scale.jump;
      this.#buffer = 0;
      this.#coyote = 0;
      this.#grounded = false;
      this.#rising = true;
      jumped = true;
    }
    if (this.#rising && (body.vy >= 0 || !intent.jumpHeld)) {
      if (body.vy < -t.jumpCutSpeed) body.vy = -t.jumpCutSpeed;
      this.#rising = false;
    }
    const gravity = this.#rising ? t.riseGravity : t.fallGravity;
    body.vy = Math.min(body.vy + gravity * dt, t.maxFallSpeed);
    return jumped;
  }

  /** Feeds back whether collision put the body on the ground this step. */
  settle(grounded: boolean): void {
    this.#grounded = grounded;
    if (grounded) this.#rising = false;
  }

  /** Forgets any pending jump, e.g. after a respawn or while knocked back. */
  reset(): void {
    this.#buffer = 0;
    this.#coyote = 0;
    this.#rising = false;
  }
}

/**
 * The jump this tuning allows, for level validation. `safety` shrinks both
 * height and distance so validated layouts never demand a pixel-perfect jump.
 */
export function jumpEnvelope(tuning: MovementTuning, bodyHeight: number, safety = 0.85): JumpEnvelope {
  const apex = (tuning.jumpSpeed * tuning.jumpSpeed) / (2 * tuning.riseGravity);
  const timeToApex = tuning.jumpSpeed / tuning.riseGravity;
  return {
    maxRise: apex * safety,
    bodyHeight,
    reach(rise) {
      if (rise > apex * safety) return Number.NEGATIVE_INFINITY;
      const fallTime = Math.sqrt((2 * (apex - rise)) / tuning.fallGravity);
      return tuning.runSpeed * (timeToApex + fallTime) * safety;
    },
  };
}
