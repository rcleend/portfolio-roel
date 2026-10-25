import type { Rect } from '@/engine/math/Rect';
import type { Rng } from '@/engine/math/Rng';
import { approach } from '@/engine/math/scalar';
import { type Body, type CollisionWorld, moveBody } from '../../world/collision';
import type { CustomerTuning } from './tuning';

/** Where a customer is in their arc from furious to happy. */
export type CustomerMood =
  | { readonly kind: 'entering' }
  | { readonly kind: 'patrol' }
  | { readonly kind: 'approach' }
  | { readonly kind: 'windup'; readonly until: number }
  | { readonly kind: 'recover'; readonly until: number }
  | { readonly kind: 'hurt'; readonly until: number }
  | { readonly kind: 'stunned'; readonly until: number }
  | { readonly kind: 'chargeWindup'; readonly until: number }
  | { readonly kind: 'charge'; readonly until: number; readonly direction: -1 | 1 }
  | { readonly kind: 'won'; readonly since: number };

/** What a customer perceives and may do during one step. */
export interface CustomerContext {
  readonly time: number;
  /** The player's centre x and feet y. */
  readonly player: { readonly x: number; readonly feet: number };
  readonly collision: CollisionWorld;
  /** Walk-speed multiplier from active skills (UX Elixir slows everyone down). */
  readonly speedScale: number;
  /** Calm customers do not shout. */
  readonly calm: boolean;
  /** The camera view: customers only start a shout on screen, so no complaint flies in from nowhere. */
  readonly view: Rect;
  readonly rng: Rng;
  /** Releases one complaint bubble; `index` numbers the bubbles of a volley. */
  shout(customer: Customer, index: number): void;
  /** An entering customer touched down (the escalated one drops in from above). */
  landed(customer: Customer): void;
}

export interface CustomerHit {
  readonly damage: number;
  /** Which way the hit pushes. */
  readonly direction: -1 | 1;
  /** UX Elixir: a regular customer is won over at once; an escalated one takes triple damage. */
  readonly decisive?: boolean;
}

export type HitOutcome = 'ignored' | 'hurt' | 'won';

const GRAVITY = 1400;
const MAX_FALL = 440;
const HURT_SECONDS = 0.22;
const KNOCKBACK = 70;
const FLASH_SECONDS = 4 / 60;
/** Seconds of happy cheering before a won-over customer strolls off. */
const CELEBRATE_SECONDS = 0.8;
const STROLL_SPEED = 46;
/** Patrols wander this far either side of the spawn point. */
const PATROL_RANGE = 40;

/**
 * The Unhappy Customer. Patrols until the player comes into view, then
 * walks up to shouting distance and lets rip with complaint bubbles. Hits
 * lower their frustration; at zero they are won over, cheer, and stroll off.
 * The escalated variant is the same customer at twice the size, with more
 * frustration, double volleys and a charge.
 */
export class Customer {
  readonly tuning: CustomerTuning;
  readonly body: Body;
  readonly #home: number;
  frustration: number;
  facing: -1 | 1 = -1;
  #mood: CustomerMood;
  #moodSince = 0;
  #nextShout = 0;
  #nextCharge = 0;
  #flashUntil = Number.NEGATIVE_INFINITY;
  #grounded = false;
  #walked = 0;

  /** Spawns standing with feet at (x, feetY), `x` being the body's centre. */
  constructor(tuning: CustomerTuning, x: number, feetY: number, mood: CustomerMood = { kind: 'patrol' }) {
    this.tuning = tuning;
    const { w, h } = tuning.hitbox;
    this.body = { x: x - w / 2, y: feetY - h, w, h, vx: 0, vy: 0 };
    this.#home = x;
    this.frustration = tuning.frustration;
    this.#mood = mood;
  }

  get mood(): CustomerMood {
    return this.#mood;
  }

  /**
   * How far the customer has moved, in pixels of its art (world pixels over
   * its draw scale): a walk cycle played by distance rather than time keeps
   * the feet planted at any speed, as Terraria drives a walker's frames from
   * its velocity.
   */
  get walked(): number {
    return this.#walked;
  }

  /** Seconds since the current mood began, for animation timing. */
  moodAge(time: number): number {
    return time - this.#moodSince;
  }

  get escalated(): boolean {
    return this.tuning.scale > 1;
  }

  get won(): boolean {
    return this.#mood.kind === 'won';
  }

  /** Can still be hit and still hurts on contact. */
  get active(): boolean {
    return !this.won;
  }

  get stunned(): boolean {
    return this.#mood.kind === 'stunned';
  }

  get rect(): Rect {
    return this.body;
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  get feet(): number {
    return this.body.y + this.body.h;
  }

  /** The point complaint bubbles leave from. */
  get mouth(): { readonly x: number; readonly y: number } {
    return { x: this.centerX + this.facing * 6 * this.tuning.scale, y: this.feet - 24 * this.tuning.scale };
  }

  isFlashing(time: number): boolean {
    return time < this.#flashUntil;
  }

  /** Charging or about to charge: contact with a charging customer always hurts. */
  get charging(): boolean {
    return this.#mood.kind === 'charge';
  }

  update(dt: number, ctx: CustomerContext): void {
    this.#think(ctx);
    this.#move(dt, ctx);
  }

  hit(hit: CustomerHit, time: number): HitOutcome {
    if (this.won) return 'ignored';
    this.#flashUntil = time + FLASH_SECONDS;
    const damage = hit.decisive ? (this.escalated ? hit.damage * 3 : this.frustration) : hit.damage;
    this.frustration = Math.max(0, this.frustration - damage);
    if (this.frustration === 0) {
      this.#setMood({ kind: 'won', since: time }, time);
      this.body.vx = 0;
      return 'won';
    }
    // The escalated customer has "super armour": it flashes but never staggers, so the fight keeps its pressure.
    const busy = this.#mood.kind === 'stunned' || this.#mood.kind === 'charge' || this.#mood.kind === 'entering';
    if (!this.escalated && !busy) {
      this.#setMood({ kind: 'hurt', until: time + HURT_SECONDS }, time);
      this.body.vx = hit.direction * KNOCKBACK;
      this.#nextShout = Math.max(this.#nextShout, time + 0.6);
    }
    return 'hurt';
  }

  stun(seconds: number, time: number): void {
    if (this.won || this.#mood.kind === 'entering') return;
    this.#setMood({ kind: 'stunned', until: time + seconds }, time);
    this.body.vx = 0;
  }

  #think(ctx: CustomerContext): void {
    const { time } = ctx;
    const mood = this.#mood;
    const dx = ctx.player.x - this.centerX;
    const distance = Math.abs(dx);
    const sees = distance < this.tuning.sightRange && Math.abs(ctx.player.feet - this.feet) < 120;

    switch (mood.kind) {
      case 'entering':
        if (this.#grounded) {
          ctx.landed(this);
          this.#nextShout = time + 1.2;
          this.#nextCharge = time + (this.tuning.charge?.every[0] ?? 0);
          this.#setMood({ kind: 'approach' }, time);
        }
        return;
      case 'patrol':
        if (sees) {
          this.#nextShout = Math.max(this.#nextShout, time + ctx.rng.range(0.25, 0.6));
          this.#setMood({ kind: 'approach' }, time);
        }
        return;
      case 'approach': {
        if (!sees && distance > this.tuning.sightRange * 1.4) {
          this.#setMood({ kind: 'patrol' }, time);
          return;
        }
        this.facing = dx < 0 ? -1 : 1;
        const charge = this.tuning.charge;
        if (charge && time >= this.#nextCharge && distance > 56) {
          this.#setMood({ kind: 'chargeWindup', until: time + charge.windup }, time);
        } else if (!ctx.calm && time >= this.#nextShout && sees && this.#onScreen(ctx.view)) {
          this.#setMood({ kind: 'windup', until: time + this.tuning.windup }, time);
        }
        return;
      }
      case 'windup':
        if (time >= mood.until) {
          for (let index = 0; index < this.tuning.volley; index++) ctx.shout(this, index);
          this.#nextShout = time + ctx.rng.range(this.tuning.shoutEvery[0], this.tuning.shoutEvery[1]);
          this.#setMood({ kind: 'recover', until: time + this.tuning.recover }, time);
        }
        return;
      case 'chargeWindup':
        if (time >= mood.until) {
          const maxSeconds = this.tuning.charge?.maxSeconds ?? 0;
          this.#setMood({ kind: 'charge', until: time + maxSeconds, direction: this.facing }, time);
        }
        return;
      case 'charge':
        if (time >= mood.until) this.#endCharge(ctx);
        return;
      case 'recover':
      case 'hurt':
      case 'stunned':
        if (time >= mood.until) this.#setMood({ kind: 'approach' }, time);
        return;
      case 'won':
        return;
    }
  }

  #move(dt: number, ctx: CustomerContext): void {
    const mood = this.#mood;
    const walk = this.tuning.walkSpeed * ctx.speedScale;
    let target = 0;
    switch (mood.kind) {
      case 'patrol': {
        if (this.centerX < this.#home - PATROL_RANGE) this.facing = 1;
        else if (this.centerX > this.#home + PATROL_RANGE) this.facing = -1;
        target = this.facing * walk * 0.6;
        break;
      }
      case 'approach': {
        const distance = Math.abs(ctx.player.x - this.centerX);
        target = distance > this.tuning.keepDistance ? this.facing * walk : 0;
        break;
      }
      case 'charge':
        target = mood.direction * (this.tuning.charge?.speed ?? 0);
        break;
      case 'won':
        if (ctx.time - mood.since > CELEBRATE_SECONDS) {
          this.facing = ctx.player.x > this.centerX ? -1 : 1;
          target = this.facing * STROLL_SPEED;
        }
        break;
      default:
        target = 0;
    }

    const knockedBack = mood.kind === 'hurt';
    this.body.vx = knockedBack ? approach(this.body.vx, 0, 400 * dt) : target;
    // Customers never walk off a ledge on their own; patrols turn around instead.
    if (!knockedBack && this.body.vx !== 0 && !this.#groundAhead(ctx.collision, Math.sign(this.body.vx))) {
      this.body.vx = 0;
      if (mood.kind === 'patrol') this.facing = this.facing === 1 ? -1 : 1;
      if (mood.kind === 'charge') this.#endCharge(ctx);
    }
    this.body.vy = Math.min(this.body.vy + GRAVITY * dt, MAX_FALL);
    const from = this.body.x;
    const contacts = moveBody(this.body, dt, ctx.collision);
    this.#walked += Math.abs(this.body.x - from) / this.tuning.scale;
    this.#grounded = contacts.grounded;
    if (contacts.wall !== 0) {
      if (mood.kind === 'patrol') this.facing = contacts.wall === 1 ? -1 : 1;
      if (mood.kind === 'charge') this.#endCharge(ctx);
    }
  }

  #endCharge(ctx: CustomerContext): void {
    const charge = this.tuning.charge;
    if (!charge) return;
    this.#nextCharge = ctx.time + ctx.rng.range(charge.every[0], charge.every[1]);
    this.#nextShout = Math.max(this.#nextShout, ctx.time + 0.8);
    this.#setMood({ kind: 'recover', until: ctx.time + this.tuning.recover }, ctx.time);
  }

  #onScreen(view: Rect): boolean {
    return this.centerX > view.x + 8 && this.centerX < view.x + view.w - 8;
  }

  #groundAhead(collision: CollisionWorld, direction: number): boolean {
    const { grid } = collision;
    const probeX = direction > 0 ? this.body.x + this.body.w + 1 : this.body.x - 1;
    return grid.kindAt(grid.colAt(probeX), grid.rowAt(this.feet + 1)) !== 'empty';
  }

  #setMood(mood: CustomerMood, time: number): void {
    this.#mood = mood;
    this.#moodSince = time;
  }
}
