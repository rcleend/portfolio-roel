import type { PlayerIntent } from '../../entities/player/Player';
import type { World } from '../World';
import { dockOf } from './dock';
import type { Ledge } from './ledges';
import type { Nav } from './Nav';
import { type Goal, type Leg, planRoute, type Route, sameLedge } from './route';

/** Seconds without getting anywhere before a walk gives up; a closed rate-limit gate opens well within it. */
const STUCK_SECONDS = 4;
/** Fresh routes allowed after surprises (a knock, a landing somewhere unplanned) before a walk gives up. */
const MAX_REPLANS = 6;
/** Close enough to a take-off to jump from it, px. */
const TAKEOFF = 2.5;
/** Slow enough to jump straight up from where the hero stands, px/s. */
const SETTLED = 25;

export type WalkStatus = 'walking' | 'arrived' | 'failed' | 'stopped';

/**
 * Plays a route with the moves a player has: it holds a direction, presses and holds jump, and lets go, one step
 * at a time, so the hero gets there through the world's own physics. A knock or a landing somewhere unplanned
 * sends it looking for a new route to the same goal.
 */
export class RouteWalker {
  readonly goal: Goal;
  readonly #nav: Nav;
  readonly #idle: PlayerIntent;
  #legs: readonly Leg[];
  #leg = 0;
  /** The current leg has pressed jump, or walked off its edge: the hero is on the way down to where it ends. */
  #launched = false;
  #airFrames = 0;
  #status: WalkStatus = 'walking';
  #replans = 0;
  #knocked = false;
  /** Asked to stop: the jump under way, if any, lands first. */
  #stopping = false;
  /** In the air between legs: the route is looked at again on landing. */
  #landing = false;
  #still = 0;
  #lastX = Number.NaN;

  constructor(nav: Nav, goal: Goal, route: Route) {
    this.#nav = nav;
    this.#idle = nav.kit.IDLE_INTENT;
    this.goal = goal;
    this.#legs = route.legs;
  }

  get status(): WalkStatus {
    return this.#status;
  }

  /** Asked to stop, and finishing the jump under way before it does. */
  get stopping(): boolean {
    return this.#stopping;
  }

  /** Mid-jump on the way: stopping now would drop the hero wherever the jump is, a pit included. */
  get inFlight(): boolean {
    return this.#launched;
  }

  /**
   * Stops the walk: at once on the ground, and in the air once the jump under way has landed where it was going, so
   * a click mid-jump never leaves the hero to fall short into a pit.
   */
  stop(): void {
    this.#stopping = true;
  }

  /** What the hero does this step on the way to the goal; idle once there or given up. */
  intent(world: World, dt: number): PlayerIntent {
    if (this.#status === 'walking' && this.#stopping && !this.#launched) this.#status = 'stopped';
    if (this.#status !== 'walking') return this.#idle;
    const { player } = world;
    if (player.isLocked(world.time)) {
      this.#knocked = true;
      return this.#idle;
    }
    if (this.#knocked) {
      if (!player.grounded) return this.#idle;
      this.#knocked = false;
      if (!this.#replan(world)) return this.#idle;
    }
    // Set off in the air (a walk asked for mid-jump, a landing after a head-butt): look again from where it lands.
    if (!player.grounded && !this.#launched && this.#legs[this.#leg]?.kind !== 'ride') {
      this.#landing = true;
      return this.#idle;
    }
    if (this.#landing) {
      this.#landing = false;
      if (!this.#replan(world, false)) return this.#idle;
    }
    if (this.#stuck(world, dt)) return this.#fail();
    // A leg can end the moment it starts (a walk already there): play on into the next.
    for (let guard = 0; guard < 4; guard++) {
      const leg = this.#legs[this.#leg];
      if (!leg) {
        this.#status = 'arrived';
        return this.#idle;
      }
      const result = this.#play(world, leg);
      if (result !== 'next' && result !== 'replan') return result;
      if (this.#stopping) {
        this.#status = 'stopped';
        return this.#idle;
      }
      if (result === 'next') this.#next();
      else if (!this.#replan(world)) return this.#idle;
    }
    return this.#idle;
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
        return this.#move(steer(dx, vx, this.#decel));
      }
      case 'jump': {
        if (this.#launched) return this.#fly(world, leg.to, leg.land);
        if (!player.grounded) return 'replan';
        const dir = Math.sign(leg.land - leg.from);
        const there = Math.abs(leg.from - cx) <= TAKEOFF;
        const ready = dir === 0 ? Math.abs(vx) < SETTLED : vx * dir > -SETTLED;
        if (there && ready) return this.#launch(dir);
        return this.#move(there ? 0 : steer(leg.from - cx, vx, this.#decel));
      }
      case 'drop':
      case 'alight':
        if (this.#launched || !player.grounded) {
          this.#launched = true;
          return this.#fly(world, leg.to, leg.land);
        }
        if (leg.kind === 'alight' && player.standingOn !== leg.mover) return 'replan';
        return this.#move(leg.dir);
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
        if (dockOf(leg.mover).at === 'home' && under && Math.abs(vx) < SETTLED) return this.#launch(0);
        this.#still = 0;
        return this.#move(steer(leg.at - cx, vx, this.#decel));
      }
      case 'ride': {
        this.#still = 0;
        const aboard = player.standingOn === leg.mover;
        const { bump } = leg;
        if (!bump) {
          if (!aboard) return player.grounded ? 'replan' : this.#idle;
          return dockOf(leg.mover).at === 'away' ? 'next' : this.#idle;
        }
        if (bump.used) return 'next';
        if (this.#launched) {
          if (player.grounded && this.#airFrames > 1) {
            this.#launched = false;
            if (!aboard) return 'replan';
          }
          return this.#rise(0);
        }
        if (!aboard) return player.grounded ? 'replan' : this.#idle;
        const centre = bump.rect.x + bump.rect.w / 2;
        if (Math.abs(centre - cx) <= TAKEOFF) return this.#launch(0);
        // Carried past it without a jump: the block cannot be reached this ride.
        return cx > centre + 8 ? this.#fail() : this.#idle;
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
        return this.#move(Math.abs(dx) <= TAKEOFF ? 0 : steer(dx, vx, this.#decel));
      }
    }
  }

  get #decel(): number {
    return this.#nav.kit.MOVEMENT.groundDecel;
  }

  #move(x: -1 | 0 | 1): PlayerIntent {
    return x === 0 ? this.#idle : { ...this.#idle, x };
  }

  /** Presses jump, heading `dir`. */
  #launch(dir: number): PlayerIntent {
    this.#launched = true;
    this.#airFrames = 0;
    return { ...this.#idle, x: sign(dir), jumpPressed: true, jumpHeld: true };
  }

  /** Holds jump while rising, for the full height, and steers `x`. */
  #rise(x: -1 | 0 | 1): PlayerIntent {
    this.#airFrames++;
    return { ...this.#idle, x, jumpHeld: true };
  }

  /** In the air towards `to`: the leg is played once the feet are down on it, and anywhere else a surprise. */
  #fly(world: World, to: Ledge, land: number): PlayerIntent | 'next' | 'replan' {
    const { player } = world;
    if (player.grounded && this.#airFrames > 1) {
      const under = this.#nav.ledgeUnder(world, player.centerX, player.feet);
      return under && sameLedge(under, to) ? 'next' : 'replan';
    }
    this.#airFrames++;
    const x = steerAir(land - player.centerX);
    return { ...this.#idle, x, jumpHeld: player.body.vy < 0 };
  }

  #next(): void {
    this.#leg++;
    this.#launched = false;
    this.#airFrames = 0;
  }

  /** A fresh route to the goal from here; `surprised` ones are counted, so a walk that keeps going wrong gives up. */
  #replan(world: World, surprised = true): boolean {
    const route = this.#replans < MAX_REPLANS ? planRoute(this.#nav, world, this.goal) : null;
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
    return this.#idle;
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

/** Towards `dx` on the ground, letting go in time to stop on it rather than past it (at `decel` px/s²). */
function steer(dx: number, vx: number, decel: number): -1 | 0 | 1 {
  const braking = (vx * vx) / (2 * decel);
  if (Math.abs(dx) <= 1.5 || (Math.sign(vx) === Math.sign(dx) && Math.abs(dx) <= braking + 0.5)) return 0;
  return sign(dx);
}

/** Towards `dx` in the air, with a little slack so a landing does not twitch. */
function steerAir(dx: number): -1 | 0 | 1 {
  return Math.abs(dx) <= 2 ? 0 : sign(dx);
}
