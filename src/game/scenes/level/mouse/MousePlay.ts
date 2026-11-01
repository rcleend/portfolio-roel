import type { GameCursor } from '@/engine/core/GameSurface';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import type { PlayerIntent } from '../../../entities/player/Player';
import type { Action } from '../../../input/bindings';
import { type WalkTarget, walkTargetAt } from '../../../world/nav/goals';
import type { NavKit } from '../../../world/nav/kit';
import { Nav } from '../../../world/nav/Nav';
import { RouteWalker } from '../../../world/nav/RouteWalker';
import type { World } from '../../../world/World';

/** Seconds within which a second click makes a double click; a click on a floor waits this long to be an attack. */
export const DOUBLE_CLICK_SECONDS = 0.3;
/** How far apart the two clicks of a double click may land, native px. */
const DOUBLE_CLICK_SLOP = 6;
/** How long a click's attack waits for the hero to be able to strike (a cooldown, a knock), seconds. */
const ATTACK_PATIENCE = 0.5;
/** Closer than this to the hero, a point is neither left nor right of them: the way they face decides, px. */
const DEAD_CENTRE = 3;

/** A click in the play: where on the screen and in the world, when, and whether it may yet become a double click's first. */
interface Click {
  readonly x: number;
  readonly y: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly at: number;
  /** It landed on somewhere a double click would walk to, so its attack waits to see whether a second click follows. */
  readonly waiting: boolean;
}

/** What the button held down in the play does: auto-fire for an attack, nothing yet or ever for a double click's. */
type Press = 'attack' | 'waiting' | 'spent';

/**
 * Playing a level with the mouse alone (docs/ARCHITECTURE.md › Mouse play). A click anywhere in the play turns the
 * hero towards it and attacks, holding the button keeps firing; a double click on a floor walks there by the
 * level's own physics, jumping wherever the way needs it, and on a "?" block or a vehicle's roof goes to head-butt
 * or board it. Clicks on a floor wait out the double click's window before they attack, so a double click never
 * fires; elsewhere they attack at once and a second click adds nothing. A new click stops a walk, a double click
 * sends it somewhere else, and the scene stops it for any key. Only a mouse plays: the touch pad is a finger's.
 * It comes as its own chunk (`load.ts`), handed the game's movement as a kit (`world/nav/kit.ts`).
 */
export class MousePlay {
  readonly #nav: Nav;
  #last: Click | null = null;
  #press: Press | null = null;
  #walker: RouteWalker | null = null;
  #strike: { readonly dir: -1 | 1; readonly until: number; readonly fired: number } | null = null;
  #cursor: GameCursor = 'hand';

  constructor(kit: NavKit) {
    this.#nav = new Nav(kit);
  }

  /** The cursor over the play, as of the last step: where a double click would walk or jump to, else the attack's way. */
  get cursor(): GameCursor {
    return this.#cursor;
  }

  get walking(): boolean {
    return this.#walker !== null;
  }

  /**
   * Advances one play step and returns what the mouse has the hero do. `inPlay` is false while the pointer is over
   * the HUD's keys rather than the play.
   */
  update(input: InputSnapshot<Action>, world: World, time: number, dt: number, inPlay: boolean): PlayerIntent {
    const { pointer } = input;
    const view = world.camera.view;
    const over = pointer.kind === 'mouse' && pointer.over && inPlay;
    const worldX = pointer.x + view.x;
    const worldY = pointer.y + view.y;
    const last = this.#last;
    // A click on a floor that no second click followed was a single click after all.
    if (last?.waiting && time - last.at > DOUBLE_CLICK_SECONDS) {
      this.#last = null;
      this.#attack(world, last.worldX, time);
      if (this.#press === 'waiting') this.#press = 'attack';
    }
    if (over && pointer.pressed) this.#click(world, { x: pointer.x, y: pointer.y, worldX, worldY, at: time });
    if (!pointer.down) this.#press = null;

    const walker = this.#walker;
    let intent = walker ? walker.intent(world, dt) : this.#nav.kit.IDLE_INTENT;
    if (walker && walker.status !== 'walking') this.#walker = null;
    const strike = this.#strike;
    if (strike && (world.loadout.fired > strike.fired || time > strike.until)) this.#strike = null;
    if (this.#strike) intent = { ...intent, attackHeld: true, face: this.#strike.dir };
    else if (this.#press === 'attack') intent = { ...intent, attackHeld: true, face: this.#side(world, worldX) };

    this.#cursor = over ? this.#cursorAt(world, worldX, worldY) : 'hand';
    return intent;
  }

  /** Stops a walk under way: a key, the touch pad or a key of the strip took over. */
  stopWalking(): void {
    this.#walker = null;
  }

  /** Forgets everything under way, as the level leaves play (a pause, a fall). */
  reset(): void {
    this.#last = null;
    this.#press = null;
    this.#walker = null;
    this.#strike = null;
    this.#cursor = 'hand';
  }

  #click(world: World, click: Omit<Click, 'waiting'>): void {
    const last = this.#last;
    const second =
      last !== null &&
      click.at - last.at <= DOUBLE_CLICK_SECONDS &&
      Math.hypot(click.x - last.x, click.y - last.y) <= DOUBLE_CLICK_SLOP;
    if (second) {
      // A double click: a walk if either click was on somewhere to go, and never a second attack.
      this.#last = null;
      this.#press = 'spent';
      const target =
        walkTargetAt(this.#nav, world, click.worldX, click.worldY) ??
        (last.waiting ? walkTargetAt(this.#nav, world, last.worldX, last.worldY) : null);
      if (target) this.#walk(target);
      return;
    }
    if (last?.waiting) this.#attack(world, last.worldX, click.at);
    const waiting = walkTargetAt(this.#nav, world, click.worldX, click.worldY) !== null;
    this.#last = { ...click, waiting };
    if (waiting) {
      this.#press = 'waiting';
      return;
    }
    this.#attack(world, click.worldX, click.at);
    this.#press = 'attack';
  }

  /** Turns the hero towards `worldX` and fires one attack there, as soon as the hero can; a walk under way stops. */
  #attack(world: World, worldX: number, time: number): void {
    this.#walker = null;
    this.#strike = { dir: this.#side(world, worldX), until: time + ATTACK_PATIENCE, fired: world.loadout.fired };
  }

  #walk(target: WalkTarget): void {
    this.#walker = new RouteWalker(this.#nav, target.goal, target.route);
    this.#strike = null;
  }

  #side(world: World, worldX: number): -1 | 1 {
    const { player } = world;
    const dx = worldX - player.centerX;
    return Math.abs(dx) < DEAD_CENTRE ? player.facing : dx < 0 ? -1 : 1;
  }

  #cursorAt(world: World, worldX: number, worldY: number): GameCursor {
    const target = walkTargetAt(this.#nav, world, worldX, worldY);
    const way = (x: number): 'left' | 'right' => (this.#side(world, x) < 0 ? 'left' : 'right');
    if (!target) return `attack-${way(worldX)}`;
    return target.route.jumps ? `jump-${way(target.x)}` : `walk-${way(target.x)}`;
  }
}
