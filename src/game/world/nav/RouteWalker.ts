import { MOVEMENT } from '../../entities/player/movement';
import { IDLE_INTENT, type PlayerIntent } from '../../entities/player/Player';
import type { World } from '../World';
import { type Ledge, ledgesOf, ledgeUnder } from './ledges';
import { type Goal, type Leg, planRoute, type Route, sameLedge } from './route';

/** Seconds without getting anywhere before a walk gives up; a closed rate-limit gate opens well within it. */
const STUCK_SECONDS = 4;
/** Fresh routes allowed after surprises (a knock, a landing somewhere unplanned) before a walk gives up. */
const MAX_REPLANS = 6;
/** Close enough to a take-off to jump from it, px. */
const TAKEOFF = 2.5;
/** Slow enough to jump straight up from where the hero stands, px/s. */
const SETTLED = 25;

export type WalkStatus = 'walking' | 'arrived' | 'failed';

/**
 * Plays a route with the moves a player has: it holds a direction, presses and holds jump, and lets go, one step
 * at a time, so the hero gets there through the world's own physics. A knock or a landing somewhere unplanned
 * sends it looking for a new route to the same goal.
 */
export class RouteWalker {
  readonly goal: Goal;
  #legs: readonly Leg[];
  #leg = 0;
  /** The current leg has pressed jump, or walked off its edge: the hero is on the way down to where it ends. */
  #launched = false;
  #airFrames = 0;
  #status: WalkStatus = 'walking';
  #replans = 0;
  #knocked = false;
  /** In the air between legs: the route is looked at again on landing. */
  #landing = false;
  #still = 0;
  #lastX = Number.NaN;

  constructor(goal: Goal, route: Route) {
    this.goal = goal;
    this.#legs = route.legs;
  }

  get status(): WalkStatus {
    return this.#status;
  }

  /** What the hero does this step on the way to the goal; idle once there or given up. */
  intent(world: World, dt: number): PlayerIntent {
    if (this.#status !== 'walking') return IDLE_INTENT;
    const { player } = world;
    if (player.isLocked(world.time)) {
      this.#knocked = true;
      return IDLE_INTENT;
    }
    if (this.#knocked) {
      if (!player.grounded) return IDLE_INTENT;
      this.#knocked = false;
      if (!this.#replan(world)) return IDLE_INTENT;
    }
    // Set off in the air (a walk asked for mid-jump, a landing after a head-butt): look again from where it lands.
    if (!player.grounded && !this.#launched && this.#legs[this.#leg]?.kind !== 'ride') {
      this.#landing = true;
      return IDLE_INTENT;
    }
    if (this.#landing) {
      this.#landing = false;
      if (!this.#replan(world, false)) return IDLE_INTENT;
    }
    if (this.#stuck(world, dt)) return this.#fail();
    // A leg can end the moment it starts (a walk already there): play on into the next.
    for (let guard = 0; guard < 4; guard++) {
      const leg = this.#legs[this.#leg];
      if (!leg) {
        this.#status = 'arrived';
        return IDLE_INTENT;
      }
      const result = this.#play(world, leg);
      if (result === 'next') this.#next();
      else if (result === 'replan') {
        if (!this.#replan(world)) return IDLE_INTENT;
      } else return result;
    }
    return IDLE_INTENT;
  }

  #play(world: World, leg: Leg): PlayerIntent | 'next' | 'replan' {
    const { player } = world;
    const cx = player.centerX;
    const vx = player.body.vx;
    switch (leg.kind) {
      case 'walk': {
        if (!player.grounded) return 'replan';
        const dx = leg.x - cx;
        if (Math.abs(dx) <= 1.5 && Math.abs(vx) < 20) return 'next';
        return move(steer(dx, vx));
      }
      case 'jump': {
        if (this.#launched) return this.#fly(world, leg.to, leg.land);
        if (!player.grounded) return 'replan';
        const dir = Math.sign(leg.land - leg.from);
        const there = Math.abs(leg.from - cx) <= TAKEOFF;
        const ready = dir === 0 ? Math.abs(vx) < SETTLED : vx * dir > -SETTLED;
        if (there && ready) return this.#launch(dir);
        return move(there ? 0 : steer(leg.from - cx, vx));
      }
      case 'drop':
      case 'alight':
        if (this.#launched || !player.grounded) {
          this.#launched = true;
          return this.#fly(world, leg.to, leg.land);
        }
        if (leg.kind === 'alight' && player.standingOn !== leg.mover) return 'replan';
        return move(leg.dir);
      case 'board': {
        if (player.standingOn === leg.mover) return 'next';
        const roof = leg.mover.rect;
        const centre = roof.x + roof.w / 2;
        if (this.#launched) {
          if (player.grounded && this.#airFrames > 1) return 'replan';
          return this.#rise(steerAir(centre - cx));
        }
        if (!player.grounded) return 'replan';
        const under = cx > roof.x + 8 && cx < roof.x + roof.w - 8;
        if (leg.mover.docked === 'home' && under && Math.abs(vx) < SETTLED) return this.#launch(0);
        this.#still = 0;
        return move(steer(leg.at - cx, vx));
      }
      case 'ride': {
        this.#still = 0;
        const aboard = player.standingOn === leg.mover;
        const { bump } = leg;
        if (!bump) {
          if (!aboard) return player.grounded ? 'replan' : IDLE_INTENT;
          return leg.mover.docked === 'away' ? 'next' : IDLE_INTENT;
        }
        if (bump.used) return 'next';
        if (this.#launched) {
          if (player.grounded && this.#airFrames > 1) {
            this.#launched = false;
            if (!aboard) return 'replan';
          }
          return this.#rise(0);
        }
        if (!aboard) return player.grounded ? 'replan' : IDLE_INTENT;
        const centre = bump.rect.x + bump.rect.w / 2;
        if (Math.abs(centre - cx) <= TAKEOFF) return this.#launch(0);
        // Carried past it without a jump: the block cannot be reached this ride.
        return cx > centre + 8 ? this.#fail() : IDLE_INTENT;
      }
      case 'bump': {
        if (leg.block.used) return 'next';
        if (this.#launched) {
          if (player.grounded && this.#airFrames > 1) return this.#fail();
          return this.#rise(steerAir(leg.x - cx));
        }
        if (!player.grounded) return 'replan';
        const dx = leg.x - cx;
        if (Math.abs(dx) <= TAKEOFF && Math.abs(vx) < SETTLED) return this.#launch(0);
        return move(Math.abs(dx) <= TAKEOFF ? 0 : steer(dx, vx));
      }
    }
  }

  /** Presses jump, heading `dir`. */
  #launch(dir: number): PlayerIntent {
    this.#launched = true;
    this.#airFrames = 0;
    return { ...IDLE_INTENT, x: sign(dir), jumpPressed: true, jumpHeld: true };
  }

  /** Holds jump while rising, for the full height, and steers `x`. */
  #rise(x: -1 | 0 | 1): PlayerIntent {
    this.#airFrames++;
    return { ...IDLE_INTENT, x, jumpHeld: true };
  }

  /** In the air towards `to`: the leg is played once the feet are down on it, and anywhere else a surprise. */
  #fly(world: World, to: Ledge, land: number): PlayerIntent | 'next' | 'replan' {
    const { player } = world;
    if (player.grounded && this.#airFrames > 1) {
      const under = ledgeUnder(ledgesOf(world), player.centerX, player.feet);
      return under && sameLedge(under, to) ? 'next' : 'replan';
    }
    this.#airFrames++;
    const x = steerAir(land - player.centerX);
    return { ...IDLE_INTENT, x, jumpHeld: player.body.vy < 0 };
  }

  #next(): void {
    this.#leg++;
    this.#launched = false;
    this.#airFrames = 0;
  }

  /** A fresh route to the goal from here; `surprised` ones are counted, so a walk that keeps going wrong gives up. */
  #replan(world: World, surprised = true): boolean {
    const route = this.#replans < MAX_REPLANS ? planRoute(world, this.goal) : null;
    if (surprised) this.#replans++;
    if (!route) {
      this.#fail();
      return false;
    }
    this.#legs = route.legs;
    this.#leg = 0;
    this.#launched = false;
    this.#airFrames = 0;
    return true;
  }

  #fail(): PlayerIntent {
    this.#status = 'failed';
    return IDLE_INTENT;
  }

  /** True once the hero has gone nowhere for `STUCK_SECONDS` (waiting for a vehicle does not count). */
  #stuck(world: World, dt: number): boolean {
    const x = world.player.centerX;
    if (!(Math.abs(x - this.#lastX) <= 0.5)) {
      this.#lastX = x;
      this.#still = 0;
    } else {
      this.#still += dt;
    }
    return this.#still > STUCK_SECONDS;
  }
}

function sign(value: number): -1 | 0 | 1 {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function move(x: -1 | 0 | 1): PlayerIntent {
  return x === 0 ? IDLE_INTENT : { ...IDLE_INTENT, x };
}

/** Towards `dx` on the ground, letting go in time to stop on it rather than past it. */
function steer(dx: number, vx: number): -1 | 0 | 1 {
  const braking = (vx * vx) / (2 * MOVEMENT.groundDecel);
  if (Math.abs(dx) <= 1.5 || (Math.sign(vx) === Math.sign(dx) && Math.abs(dx) <= braking + 0.5)) return 0;
  return sign(dx);
}

/** Towards `dx` in the air, with a little slack so a landing does not twitch. */
function steerAir(dx: number): -1 | 0 | 1 {
  return Math.abs(dx) <= 2 ? 0 : sign(dx);
}
