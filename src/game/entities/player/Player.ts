import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import type { CharacterAnimation } from '../../art/looks/contracts';
import { type Body, type CollisionWorld, moveBody, type Surface } from '../../world/collision';
import type { RenderKit } from '../RenderKit';
import { type MoveIntent, type MoveScale, NORMAL_SCALE, PlatformerMotor } from './movement';
import { HAND, PLAYER_SIZE } from './size';

/** What the player asks for during one step, independent of devices. */
export interface PlayerIntent extends MoveIntent {
  readonly attackHeld: boolean;
  readonly skill1Pressed: boolean;
  readonly skill2Pressed: boolean;
}

export const IDLE_INTENT: PlayerIntent = {
  x: 0,
  jumpPressed: false,
  jumpHeld: false,
  attackHeld: false,
  skill1Pressed: false,
  skill2Pressed: false,
};

/** What happened to the player's body during one step. */
export interface PlayerStep {
  readonly jumped: boolean;
  /** Touched down this step after being airborne. */
  readonly landed: boolean;
  /** Solid cells the head bumped ("?" blocks). */
  readonly ceilingCells: readonly { readonly col: number; readonly row: number }[];
}

export const MAX_HEARTS = 5;
const INVULNERABLE_SECONDS = 1.3;
const KNOCKBACK_SECONDS = 0.3;
const KNOCKBACK = { x: 150, y: -220 } as const;
const STOMP_BOUNCE = -280;

/** Poses that override locomotion for a moment. */
type ActionPose = 'attack' | 'skill' | 'hurt' | 'victory';

/**
 * The hero: movement, health, invulnerability frames and which animation
 * to show. Attacks and skills are spawned by the world; the player only
 * strikes the matching pose.
 */
export class Player {
  readonly characterId: CharacterId;
  readonly body: Body;
  hearts = MAX_HEARTS;
  facing: -1 | 1 = 1;
  readonly #motor = new PlatformerMotor();
  #riding: Surface | null = null;
  /** Horizontal speed inherited from a moving platform at take-off, kept until landing. */
  #carry = 0;
  #grounded = false;
  #invulnerableUntil = Number.NEGATIVE_INFINITY;
  #lockedUntil = Number.NEGATIVE_INFINITY;
  #action: { readonly pose: ActionPose; readonly since: number; readonly until: number } | null = null;
  #animation: CharacterAnimation = 'idle';
  #animationSince = 0;

  constructor(characterId: CharacterId, x: number, feetY: number) {
    this.characterId = characterId;
    this.body = {
      x: x - PLAYER_SIZE.w / 2,
      y: feetY - PLAYER_SIZE.h,
      w: PLAYER_SIZE.w,
      h: PLAYER_SIZE.h,
      vx: 0,
      vy: 0,
    };
  }

  get rect(): Rect {
    return this.body;
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  get centerY(): number {
    return this.body.y + this.body.h / 2;
  }

  get feet(): number {
    return this.body.y + this.body.h;
  }

  get grounded(): boolean {
    return this.#grounded;
  }

  /** The moving platform or barrier underfoot, if any. */
  get standingOn(): Surface | null {
    return this.#riding;
  }

  /** Where shots leave from: chest height, just in front of the body. */
  get hand(): { readonly x: number; readonly y: number } {
    return { x: this.centerX + this.facing * HAND.reach, y: this.feet - HAND.height };
  }

  isInvulnerable(time: number): boolean {
    return time < this.#invulnerableUntil;
  }

  isLocked(time: number): boolean {
    return time < this.#lockedUntil;
  }

  update(
    intent: PlayerIntent,
    dt: number,
    collision: CollisionWorld,
    time: number,
    scale: MoveScale = NORMAL_SCALE,
  ): PlayerStep {
    const locked = this.isLocked(time);
    const move: MoveIntent = locked ? { x: 0, jumpPressed: false, jumpHeld: false } : intent;
    if (!locked && intent.x !== 0) this.facing = intent.x;

    const jumped = this.#motor.step(this.body, move, dt, locked ? { speed: 0, jump: 0 } : scale);
    if (jumped && this.#riding) {
      this.#carry = this.#riding.dx / dt;
      this.#riding = null;
    }

    const ownVx = this.body.vx;
    this.body.vx = ownVx + this.#carry;
    const wasGrounded = this.#grounded;
    const contacts = moveBody(this.body, dt, collision, this.#riding);
    this.body.vx = contacts.wall !== 0 ? 0 : ownVx;
    if (contacts.wall !== 0 || contacts.grounded) this.#carry = 0;

    this.#riding = contacts.surface;
    this.#grounded = contacts.grounded;
    this.#motor.settle(contacts.grounded);
    this.#updateAnimation(time);
    return { jumped, landed: contacts.grounded && !wasGrounded, ceilingCells: contacts.ceilingCells };
  }

  /**
   * Takes a hit from something at `fromX`. Returns false while invulnerable.
   * `pushback: false` keeps the knockback vertical — used where a shove
   * would throw the player off a platform or into a pit.
   */
  hurt(fromX: number, time: number, pushback = true): boolean {
    if (this.isInvulnerable(time)) return false;
    this.hearts = Math.max(0, this.hearts - 1);
    const away = this.centerX < fromX ? -1 : 1;
    this.body.vx = pushback ? away * KNOCKBACK.x : 0;
    this.body.vy = KNOCKBACK.y;
    this.#carry = 0;
    this.#riding = null;
    this.#grounded = false;
    this.#motor.reset();
    this.#motor.settle(false);
    this.#invulnerableUntil = time + INVULNERABLE_SECONDS;
    this.#lockedUntil = time + KNOCKBACK_SECONDS;
    this.strike('hurt', time, KNOCKBACK_SECONDS);
    return true;
  }

  /** Bounces off a customer's head after landing on it. */
  bounce(): void {
    this.body.vy = STOMP_BOUNCE;
    this.#motor.settle(false);
  }

  /** Puts the player back on its feet at a checkpoint with a moment of grace. */
  respawn(x: number, feetY: number, time: number): void {
    this.body.x = x - this.body.w / 2;
    this.body.y = feetY - this.body.h;
    this.body.vx = 0;
    this.body.vy = 0;
    this.#carry = 0;
    this.#riding = null;
    this.#motor.reset();
    this.#invulnerableUntil = time + INVULNERABLE_SECONDS;
    this.#lockedUntil = Number.NEGATIVE_INFINITY;
    this.#action = null;
  }

  heal(): void {
    this.hearts = MAX_HEARTS;
  }

  /** Holds an action pose (attack, skill, victory) for `seconds` instead of the locomotion animation. */
  strike(pose: ActionPose, time: number, seconds: number): void {
    this.#action = { pose, since: time, until: time + seconds };
  }

  /** The animation on show and how far into it, at `time`. */
  pose(time: number): { readonly animation: CharacterAnimation; readonly time: number } {
    return { animation: this.#animation, time: time - this.#animationSince };
  }

  render(gfx: Gfx, kit: RenderKit): void {
    const invulnerable = this.isInvulnerable(kit.time) && !this.isLocked(kit.time);
    if (invulnerable && !blink(kit.time, 3 / 60, 3 / 60)) return;
    const { animation, time } = this.pose(kit.time);
    gfx.sprite(kit.looks.characters[this.characterId].sheet, animation, time, this.centerX, this.feet, {
      flipX: this.facing < 0,
    });
  }

  #updateAnimation(time: number): void {
    const action = this.#action && time < this.#action.until ? this.#action : null;
    let next: CharacterAnimation;
    // Attack poses stand still, so they only show when the body is planted; running and jumping keep their legs.
    if (action && (action.pose !== 'attack' || (this.#grounded && Math.abs(this.body.vx) < 20))) next = action.pose;
    else if (!this.#grounded) next = this.body.vy < 0 ? 'jump' : 'fall';
    else next = Math.abs(this.body.vx) > 12 ? 'run' : 'idle';
    if (next !== this.#animation || (action && action.since === time)) {
      this.#animation = next;
      this.#animationSince = action?.pose === next ? action.since : time;
    }
  }
}
