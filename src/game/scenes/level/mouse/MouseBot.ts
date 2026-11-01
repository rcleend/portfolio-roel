import { walkTargetAt } from '../../../world/nav/goals';
import type { Nav } from '../../../world/nav/Nav';
import type { World } from '../../../world/World';
import type { TestMouse } from './testing';

/** One pointer action a step: move there, then press or release. */
type Action = { readonly x: number; readonly y: number; readonly button?: 'press' | 'release' };

/** Screen rows the bot looks for floor on: the ground's band, and a raised ledge's. */
const FLOOR_ROWS = [208, 156, 180];
/** A customer this close is the bot's business before walking on, px. */
const ENGAGE = 170;
/** Further above or below the hero than this, a customer is out of the shots' line: walk on, px. */
const LINE = 20;
/** Seconds of holding the button on one customer before the bot leaves them be for a while. */
const PATIENCE = 4;

/**
 * Plays a level with a mouse and nothing else, like a visitor watching the screen (tests and tooling only): it holds
 * the button on whoever is unhappy in reach, double-clicks the "?" blocks it sees, and otherwise double-clicks the
 * farthest floor ahead it can walk to. It reads the world only to see what is where, as eyes would; everything it
 * does goes through `TestMouse`.
 */
export class MouseBot {
  readonly #nav: Nav;
  readonly #mouse: TestMouse;
  #queue: Action[] = [];
  #holding: { readonly until: number } | null = null;
  /** Customers the bot gave up on, and until when. */
  readonly #ignored = new Map<object, number>();

  constructor(nav: Nav, mouse: TestMouse) {
    this.#nav = nav;
    this.#mouse = mouse;
  }

  /** Acts for one step; `walking` says whether a walk it asked for is under way. */
  act(world: World, walking: boolean): void {
    const action = this.#queue.shift() ?? this.#decide(world, walking);
    if (action) this.#do(action);
  }

  /** What to do next with the mouse, if anything; a double click queues the rest of itself. */
  #decide(world: World, walking: boolean): Action | null {
    const view = world.camera.view;
    const toScreen = (x: number, y: number): Action => ({ x: Math.round(x - view.x), y: Math.round(y - view.y) });
    const target = this.#target(world);
    if (target) {
      // Hold the button on it: the hero turns that way and keeps firing.
      const at = toScreen(target.centerX, target.rect.y + target.rect.h / 2);
      if (!this.#holding) {
        this.#holding = { until: world.time + PATIENCE };
        return { ...at, button: 'press' };
      }
      if (world.time < this.#holding.until) return at;
      this.#ignored.set(target, world.time + PATIENCE * 1.5);
    }
    if (this.#holding) {
      this.#holding = null;
      return { x: this.#mouse.x, y: this.#mouse.y, button: 'release' };
    }
    if (walking) return null;
    const goal = this.#nextBlock(world, toScreen) ?? this.#farthestFloor(world);
    if (goal) this.#doubleClick(goal);
    return this.#queue.shift() ?? null;
  }

  /** The unhappy customer to deal with first: the escalated one, else the nearest within reach on screen. */
  #target(world: World) {
    const { player } = world;
    const view = world.camera.view;
    const onScreen = (x: number) => x > view.x + 4 && x < view.x + world.camera.width - 4;
    const unhappy = world.customers.filter(
      (customer) => customer.active && !customer.won && onScreen(customer.centerX),
    );
    const boss = unhappy.find((customer) => customer.escalated);
    if (boss) return boss;
    const near = unhappy.filter(
      (customer) =>
        Math.abs(customer.centerX - player.centerX) < ENGAGE &&
        Math.abs(customer.feet - player.feet) < LINE &&
        (this.#ignored.get(customer) ?? 0) < world.time,
    );
    return near.sort((a, b) => Math.abs(a.centerX - player.centerX) - Math.abs(b.centerX - player.centerX))[0];
  }

  /** An unopened "?" block on screen the hero can get to. */
  #nextBlock(world: World, toScreen: (x: number, y: number) => Action): Action | null {
    for (const block of world.blocks) {
      if (block.used) continue;
      const { x, y, w, h } = block.rect;
      const at = toScreen(x + w / 2, y + h / 2);
      if (at.x < 8 || at.x > world.camera.width - 8) continue;
      if (walkTargetAt(this.#nav, world, x + w / 2, y + h / 2)) return at;
    }
    return null;
  }

  /** The floor farthest right on screen that a double click would walk to. */
  #farthestFloor(world: World): Action | null {
    const view = world.camera.view;
    for (let x = world.camera.width - 6; x > 8; x -= 6) {
      for (const y of FLOOR_ROWS) {
        const target = walkTargetAt(this.#nav, world, x + view.x, y + view.y);
        if (target && target.x > world.player.centerX + 4) return { x, y };
      }
    }
    return null;
  }

  #doubleClick(at: Action): void {
    const idle = { x: at.x, y: at.y };
    this.#queue.push(
      { ...at, button: 'press' },
      idle,
      idle,
      { ...at, button: 'release' },
      idle,
      idle,
      idle,
      { ...at, button: 'press' },
      idle,
      idle,
      { ...at, button: 'release' },
    );
  }

  #do(action: Action): void {
    this.#mouse.move(action.x, action.y);
    if (action.button === 'press') this.#mouse.press();
    if (action.button === 'release') this.#mouse.release();
  }
}
