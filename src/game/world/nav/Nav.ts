import type { World } from '../World';
import { JumpModel } from './jumps';
import type { NavKit } from './kit';
import { collectLedges, type Ledge, ledgeUnder } from './ledges';

/**
 * What finding the way through a stage takes, held once: the game's movement and sizes (handed over as a kit, so
 * mouse play's chunk imports none of it), the jump the motor makes, and each world's ledges.
 */
export class Nav {
  readonly kit: NavKit;
  readonly jumps: JumpModel;
  /** Half the hero's width: a centre this far inside a ledge stands on it whole. */
  readonly halfBody: number;
  readonly #ledges = new WeakMap<World, { readonly all: readonly Ledge[]; readonly arena: readonly Ledge[] }>();

  constructor(kit: NavKit) {
    this.kit = kit;
    this.jumps = new JumpModel(kit);
    this.halfBody = kit.PLAYER_SIZE.w / 2;
  }

  /** The stage's ledges; once the arena has closed behind the hero, only what lies inside it. */
  ledges(world: World): readonly Ledge[] {
    let entry = this.#ledges.get(world);
    if (!entry) {
      const all = collectLedges(world, this.kit);
      const wall = world.arena.x;
      const arena = all
        .map((ledge) => ({ ...ledge, x0: Math.max(ledge.x0, wall) }))
        .filter((ledge) => ledge.x1 - ledge.x0 >= this.kit.TILE);
      entry = { all, arena };
      this.#ledges.set(world, entry);
    }
    return world.arena.entered ? entry.arena : entry.all;
  }

  /** The ledge the hero's centre `x` and feet stand on, or `airborne`, the one they will come down on. */
  ledgeUnder(world: World, x: number, feet: number, airborne = false): Ledge | null {
    return ledgeUnder(this.ledges(world), x, feet, this.halfBody, airborne);
  }
}
