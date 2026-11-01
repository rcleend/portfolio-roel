import type { GameCursor } from '@/engine/core/GameSurface';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import type { PlayerIntent } from '../../../entities/player/Player';
import type { Action } from '../../../input/bindings';
import { type WalkTarget, walkTargetAt } from '../../../world/nav/goals';
import type { NavKit } from '../../../world/nav/kit';
import { Nav } from '../../../world/nav/Nav';
import { RouteWalker } from '../../../world/nav/RouteWalker';
import type { World } from '../../../world/World';

/** How long a click's attack waits for the hero to be able to strike (a cooldown, a knock), seconds. */
const ATTACK_PATIENCE = 0.5;
/** Closer than this to the hero, a point is neither left nor right of them: the way they face decides, px. */
const DEAD_CENTRE = 3;

/** What the button held down in the play does: auto-fire for an attack, nothing for a click that set off a walk. */
type Press = 'attack' | 'spent';

/**
 * Playing a level with the mouse alone (docs/ARCHITECTURE.md › Mouse play). A click on a floor walks there by the
 * level's own physics, jumping wherever the way needs it, and on a "?" block or a vehicle's roof goes to head-butt
 * or board it; a click anywhere else in the play turns the hero towards it and attacks, and holding the button there
 * keeps firing. A click elsewhere stops a walk, one on somewhere to go sends it there instead, and the scene stops it
 * for any key. Only a mouse plays: the touch pad is a finger's.
 * It comes as its own chunk (`load.ts`), handed the game's movement as a kit (`world/nav/kit.ts`).
 */
export class MousePlay {
  readonly #nav: Nav;
  #press: Press | null = null;
  #walker: RouteWalker | null = null;
  /** A walk asked for mid-jump: it sets off once the jump under way has landed. */
  #next: WalkTarget | null = null;
  #strike: { readonly dir: -1 | 1; readonly until: number; readonly fired: number } | null = null;
  #cursor: GameCursor = 'hand';

  constructor(kit: NavKit) {
    this.#nav = new Nav(kit);
  }

  /** The cursor over the play, as of the last step: where a click would walk or jump to, else an attack. */
  get cursor(): GameCursor {
    return this.#cursor;
  }

  /** A walk the visitor asked for is under way (or waits for the jump before it to land). */
  get walking(): boolean {
    return (this.#walker !== null && !this.#walker.stopping) || this.#next !== null;
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
    if (over && pointer.pressed) this.#click(world, worldX, worldY, time);
    if (!pointer.down) this.#press = null;

    let intent = this.#walker ? this.#walker.intent(world, dt) : this.#nav.kit.IDLE_INTENT;
    if (this.#walker && this.#walker.status !== 'walking') {
      this.#walker = null;
      const next = this.#next;
      this.#next = null;
      if (next) this.#walker = new RouteWalker(this.#nav, next.goal, next.route);
    }
    const strike = this.#strike;
    if (strike && (world.loadout.fired > strike.fired || time > strike.until)) this.#strike = null;
    if (this.#strike) intent = { ...intent, attackHeld: true, face: this.#strike.dir };
    else if (this.#press === 'attack') intent = { ...intent, attackHeld: true, face: this.#side(world, worldX) };

    this.#cursor = over ? this.#cursorAt(world, worldX, worldY) : 'hand';
    return intent;
  }

  /** Stops a walk under way, landing a jump first: a key, the touch pad or a key of the strip took over. */
  stopWalking(): void {
    this.#walker?.stop();
    this.#next = null;
  }

  /** Forgets everything under way, as the level leaves play (a pause, a fall). */
  reset(): void {
    this.#press = null;
    this.#walker = null;
    this.#next = null;
    this.#strike = null;
    this.#cursor = 'hand';
  }

  #click(world: World, worldX: number, worldY: number, time: number): void {
    const target = walkTargetAt(this.#nav, world, worldX, worldY);
    if (target) {
      this.#walk(target);
      this.#press = 'spent';
      return;
    }
    this.#attack(world, worldX, time);
    this.#press = 'attack';
  }

  /** Turns the hero towards `worldX` and fires one attack there, as soon as the hero can; a walk under way stops. */
  #attack(world: World, worldX: number, time: number): void {
    this.stopWalking();
    this.#strike = { dir: this.#side(world, worldX), until: time + ATTACK_PATIENCE, fired: world.loadout.fired };
  }

  #walk(target: WalkTarget): void {
    this.#strike = null;
    if (this.#walker?.inFlight) {
      // Mid-jump: land it first, then set off (the walk looks for its way again from where it lands).
      this.#walker.stop();
      this.#next = target;
      return;
    }
    this.#walker = new RouteWalker(this.#nav, target.goal, target.route);
    this.#next = null;
  }

  #side(world: World, worldX: number): -1 | 1 {
    const { player } = world;
    const dx = worldX - player.centerX;
    return Math.abs(dx) < DEAD_CENTRE ? player.facing : dx < 0 ? -1 : 1;
  }

  #cursorAt(world: World, worldX: number, worldY: number): GameCursor {
    const target = walkTargetAt(this.#nav, world, worldX, worldY);
    return target ? (target.route.jumps ? 'jump' : 'walk') : 'attack';
  }
}
