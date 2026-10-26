import type { CharacterId, SkillId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import { type HeroPose, heroFrame, type LayeredMove } from '../../art/looks/contracts';
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

interface Action {
  readonly pose: ActionPose;
  readonly since: number;
  readonly until: number;
  /** The skill being cast, while the pose is `skill`. */
  readonly skill: SkillId | null;
}

/** What the legs are doing. */
type Move = 'idle' | LayeredMove;

/** Faster than this on the ground, the hero runs. */
const RUN_SPEED = 12;
/** Slower than this on the ground, the hero is planted, and a look drawn whole shows his attack pose. */
const PLANTED_SPEED = 20;

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
  #action: Action | null = null;
  /** The action under way at the last update, if any. */
  #acting: Action | null = null;
  /** The action a look drawn whole shows instead of the move, if any: all but an attack off planted feet. */
  #shown: Action | null = null;
  #move: Move = 'idle';
  #moveSince = 0;

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
    this.#action = { pose, since: time, until: time + seconds, skill: null };
    this.#showAction(time);
  }

  /** Holds the skill pose for `seconds` while casting `skill`, which a look may pose its own way. */
  cast(skill: SkillId, time: number, seconds: number): void {
    this.#action = { pose: 'skill', since: time, until: time + seconds, skill };
    this.#showAction(time);
  }

  /** The pose on show at `time`: an action or the move, and an attack or skill made on the move. */
  pose(time: number): HeroPose {
    const shown = this.#shown;
    const acting = this.#acting;
    const move = this.#move;
    const actsOnTheMove = acting !== null && move !== 'idle' && (acting.pose === 'attack' || acting.pose === 'skill');
    return {
      animation: shown?.pose ?? move,
      skill: shown?.pose === 'skill' ? shown.skill : null,
      time: time - (shown?.since ?? this.#moveSince),
      onTheMove: actsOnTheMove
        ? { action: acting.pose, actionTime: time - acting.since, move, moveTime: time - this.#moveSince }
        : null,
    };
  }

  render(gfx: Gfx, kit: RenderKit): void {
    const invulnerable = this.isInvulnerable(kit.time) && !this.isLocked(kit.time);
    if (invulnerable && !blink(kit.time, 3 / 60, 3 / 60)) return;
    const { sheet } = kit.looks.characters[this.characterId];
    const frame = heroFrame(sheet, this.pose(kit.time));
    const options = { flipX: this.facing < 0 };
    if (frame.legs) gfx.sprite(sheet, frame.legs.animation, frame.legs.time, this.centerX, this.feet, options);
    gfx.sprite(sheet, frame.animation, frame.time, this.centerX, this.feet, options);
  }

  #updateAnimation(time: number): void {
    let move: Move;
    if (!this.#grounded) move = this.body.vy < 0 ? 'jump' : 'fall';
    else move = Math.abs(this.body.vx) > RUN_SPEED ? 'run' : 'idle';
    if (move !== this.#move) {
      this.#move = move;
      this.#moveSince = time;
    }
    this.#showAction(time);
  }

  /**
   * Settles how the action under way shows. The world strikes an attack or casts a skill after updating the
   * hero in the same step, so both settle it again: that step's frame already swings the item.
   */
  #showAction(time: number): void {
    const action = this.#action && time < this.#action.until ? this.#action : null;
    this.#acting = action;
    // An attack pose stands still, so a look drawn whole shows it only while the body is planted; on the move,
    // he keeps the move's legs, and only a look drawn in layers swings the attack over them (`heroFrame`).
    const planted = this.#grounded && Math.abs(this.body.vx) < PLANTED_SPEED;
    this.#shown = action && (action.pose !== 'attack' || planted) ? action : null;
  }
}
