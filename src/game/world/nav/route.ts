import type { MoveScale } from '../../entities/player/movement';
import type { HighlightBlock } from '../../entities/stage/HighlightBlock';
import type { MovingPlatform } from '../../entities/stage/MovingPlatform';
import type { World } from '../World';
import { dockOf } from './dock';
import type { Ledge } from './ledges';
import type { Nav } from './Nav';

/** Where a walk ends: standing on a ledge, aboard a vehicle, or having head-butted a "?" block. */
export type Goal =
  | { readonly kind: 'stand'; readonly ledge: Ledge; readonly x: number }
  | { readonly kind: 'board'; readonly mover: MovingPlatform }
  | { readonly kind: 'bump'; readonly block: HighlightBlock };

/**
 * One stretch of a route, played from wherever the last one left the hero. `land` is where to steer while airborne;
 * the ledge counts as reached wherever the feet come down on it.
 */
export type Leg =
  | { readonly kind: 'walk'; readonly x: number }
  | { readonly kind: 'jump'; readonly from: number; readonly to: Ledge; readonly land: number }
  | { readonly kind: 'drop'; readonly edge: number; readonly dir: -1 | 1; readonly to: Ledge; readonly land: number }
  | { readonly kind: 'board'; readonly mover: MovingPlatform; readonly at: number }
  | { readonly kind: 'ride'; readonly mover: MovingPlatform; readonly bump: HighlightBlock | null }
  | {
      readonly kind: 'alight';
      readonly mover: MovingPlatform;
      readonly dir: -1 | 1;
      readonly to: Ledge;
      readonly land: number;
    }
  | { readonly kind: 'bump'; readonly block: HighlightBlock; readonly x: number };

export interface Route {
  readonly legs: readonly Leg[];
  /** Somewhere on it the hero leaves the ground on purpose: a jump, a vehicle boarded, a block head-butted. */
  readonly jumps: boolean;
}

/** What a jump, a drop and a boarding cost, in pixels of walking, so a route takes them only when they save a walk. */
const COST = { jump: 24, drop: 8, board: 48 } as const;
/** How far inside a ledge to aim a landing, so the whole body comes down on it. */
const LANDING = 10;
/** Searching stops after this many expansions; the stages' graphs need a few dozen. */
const MAX_EXPANSIONS = 400;

type Place = Ledge | MovingPlatform;

interface Node {
  readonly place: Place;
  readonly x: number;
  readonly cost: number;
  readonly legs: readonly Leg[];
  readonly done: boolean;
}

/**
 * The cheapest way from where the hero stands to `goal`, in legs the hero can play with the moves a player has:
 * walking, full jumps, walking off an edge, and riding a vehicle from its home across to the far end of its track.
 * Null when there is none (or the hero is in the air). Closed rate-limit gates are not in the way: a walk waits.
 */
export function planRoute(nav: Nav, world: World, goal: Goal): Route | null {
  const start = startOf(nav, world);
  if (!start) return null;
  const ledges = nav.ledges(world);
  const open: Node[] = [{ ...start, cost: 0, legs: [], done: false }];
  const seen = new Set<string>();
  for (let expansions = 0; open.length > 0 && expansions < MAX_EXPANSIONS; expansions++) {
    open.sort((a, b) => a.cost - b.cost);
    const node = open.shift() as Node;
    if (node.done) return { legs: node.legs, jumps: node.legs.some(leavesTheGround) };
    const key = `${ledges.indexOf(node.place as Ledge)}:${world.movers.indexOf(node.place as MovingPlatform)}:${Math.round(node.x / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    open.push(...successors(nav, world, ledges, node, goal));
  }
  return null;
}

function leavesTheGround(leg: Leg): boolean {
  return (
    leg.kind === 'jump' || leg.kind === 'board' || leg.kind === 'bump' || (leg.kind === 'ride' && leg.bump !== null)
  );
}

/** The same stretch of the same ledge: the arena's wall trims the ledges it closes on. */
export function sameLedge(a: Ledge, b: Ledge): boolean {
  return a.kind === b.kind && a.top === b.top && a.x0 < b.x1 && b.x0 < a.x1;
}

function isMover(place: Place): place is MovingPlatform {
  return 'track' in place;
}

/** The hero's place: the vehicle or ledge underfoot, or in the air the one below that the feet will come down on. */
function startOf(nav: Nav, world: World): { readonly place: Place; readonly x: number } | null {
  const { player } = world;
  const x = player.centerX;
  const airborne = !player.grounded;
  const ledge = nav.ledgeUnder(world, x, player.feet, airborne);
  const mover = world.movers.find((candidate) => {
    if (!airborne) return candidate === player.standingOn;
    const roof = candidate.rect;
    const over = x > roof.x - nav.halfBody && x < roof.x + roof.w + nav.halfBody;
    return over && roof.y >= player.feet - 1 && (!ledge || roof.y < ledge.top);
  });
  if (mover) return { place: mover, x };
  return ledge ? { place: ledge, x } : null;
}

function* successors(nav: Nav, world: World, ledges: readonly Ledge[], node: Node, goal: Goal): Generator<Node> {
  const { place, x, cost, legs } = node;
  const step = (to: Place, at: number, more: number, ...added: Leg[]): Node => ({
    place: to,
    x: at,
    cost: cost + more,
    legs: [...legs, ...added],
    done: false,
  });
  const finish = (more: number, ...added: Leg[]): Node => ({ ...step(place, x, more, ...added), done: true });

  if (isMover(place)) {
    yield* aboard(nav, world, ledges, place, x, goal, step, finish);
    return;
  }
  if (goal.kind === 'stand' && sameLedge(goal.ledge, place)) {
    const at = Math.min(Math.max(goal.x, place.x0 + nav.halfBody), place.x1 - nav.halfBody);
    yield finish(Math.abs(at - x), { kind: 'walk', x: at });
  }
  if (goal.kind === 'bump') {
    const at = bumpFrom(nav, place, goal.block);
    if (at !== null) yield finish(Math.abs(at - x) + COST.jump, { kind: 'bump', block: goal.block, x: at });
  }
  for (const to of ledges) {
    if (to === place || to.kind === 'block') continue;
    for (const hop of hops(nav, world, place, x, to)) yield step(to, hop.land, hop.cost, hop.leg);
  }
  for (const mover of world.movers) {
    const roof = dockOf(mover).home;
    const at = roof.x + roof.w / 2;
    const rise = place.top - roof.y;
    const under = at > place.x0 + 2 && at < place.x1 - 2;
    if (under && rise > 0 && rise <= nav.jumps.maxRise(scaleAt(nav, world, at, place.top))) {
      yield step(mover, at, Math.abs(at - x) + COST.board, { kind: 'board', mover, at });
    }
  }
}

type Step = (to: Place, at: number, more: number, ...added: Leg[]) => Node;
type Finish = (more: number, ...added: Leg[]) => Node;

/** Aboard a vehicle the hero rides it to the far end of its track (head-butting a block on the way), then steps off. */
function* aboard(
  nav: Nav,
  world: World,
  ledges: readonly Ledge[],
  mover: MovingPlatform,
  x: number,
  goal: Goal,
  step: Step,
  finish: Finish,
): Generator<Node> {
  const aboardNow = world.player.standingOn === mover || !world.player.grounded;
  const dock = dockOf(mover);
  const now = aboardNow && dock.at !== 'home' ? mover.rect : dock.home;
  const { away } = dock;
  const travel = away.x - now.x;
  if (goal.kind === 'board' && goal.mover === mover) yield finish(0);
  if (goal.kind === 'bump') {
    const { x: bx, y, w, h } = goal.block.rect;
    const centre = bx + w / 2;
    const passes = centre >= x - 2 && centre <= x + travel + 2;
    const rise = away.y - (y + h);
    if (passes && rise > 0 && rise <= nav.jumps.headReach(nav.kit.PLAYER_SIZE.h)) {
      yield finish(travel + COST.jump, { kind: 'ride', mover, bump: goal.block });
    }
  }
  for (const dir of [-1, 1] as const) {
    const edge = dir > 0 ? away.x + away.w : away.x;
    const land = edge + dir * (nav.halfBody + LANDING);
    for (const to of ledges) {
      if (to.kind === 'block' || to.top <= away.y || land <= to.x0 + 2 || land >= to.x1 - 2) continue;
      if (LANDING > nav.jumps.dropReach(to.top - away.y)) continue;
      yield step(
        to,
        land,
        Math.abs(travel) + Math.abs(edge - x - travel) + COST.drop,
        { kind: 'ride', mover, bump: null },
        { kind: 'alight', mover, dir, to, land },
      );
    }
  }
}

interface Hop {
  readonly leg: Leg;
  readonly land: number;
  readonly cost: number;
}

/**
 * The moves from ledge `from`, standing at `x`, onto ledge `to`: a jump from under it (the raised ledges are all
 * one-way) or from beside it, walking off an edge onto it, or a jump across a gap to it.
 */
function* hops(nav: Nav, world: World, from: Ledge, x: number, to: Ledge): Generator<Hop> {
  const { jumps, halfBody } = nav;
  const rise = from.top - to.top;
  const standing = (at: number): boolean => at >= from.x0 + 2 && at <= from.x1 - 2;
  if (rise > 0) {
    const lo = Math.max(from.x0, to.x0) + LANDING;
    const hi = Math.min(from.x1, to.x1) - LANDING;
    const under = lo <= hi ? clearTakeoff(nav, world, from, to, Math.min(Math.max(x, lo), hi), lo, hi) : null;
    const besides = [to.x0 - LANDING, to.x1 + LANDING, from.x0 + 2, from.x1 - 2, ...zoneEdges(nav, world, from, to)];
    for (const takeoff of under === null ? besides : [under, ...besides]) {
      if (!standing(takeoff)) continue;
      const scale = scaleAt(nav, world, takeoff, from.top);
      if (rise > jumps.maxRise(scale)) continue;
      const land = Math.min(Math.max(takeoff, to.x0 + LANDING), to.x1 - LANDING);
      // Coming down on the near end: the body overlaps it a few pixels before its centre is over it.
      const nearest = Math.min(Math.max(takeoff, to.x0 + 2 - halfBody), to.x1 - 2 + halfBody);
      if (Math.abs(nearest - takeoff) > jumps.reach(rise, scale)) continue;
      const leg: Leg = { kind: 'jump', from: takeoff, to, land };
      yield { leg, land, cost: Math.abs(x - takeoff) + COST.jump + Math.abs(land - takeoff) };
    }
    return;
  }
  for (const dir of [-1, 1] as const) {
    const edge = dir > 0 ? from.x1 : from.x0;
    if (dir > 0 ? to.x1 <= edge + LANDING : to.x0 >= edge - LANDING) continue;
    const land =
      dir > 0
        ? Math.max(to.x0 + LANDING, edge + halfBody + LANDING)
        : Math.min(to.x1 - LANDING, edge - halfBody - LANDING);
    if (land <= to.x0 + 2 || land >= to.x1 - 2) continue;
    const drop = -rise;
    if (drop > 0 && Math.abs(land - edge) <= halfBody + jumps.dropReach(drop) - 4) {
      yield { leg: { kind: 'drop', edge, dir, to, land }, land, cost: Math.abs(x - edge) + COST.drop };
      continue;
    }
    const takeoff = edge - dir * 2;
    const nearest = dir > 0 ? to.x0 + 2 - halfBody : to.x1 - 2 + halfBody;
    const span = Math.max(0, (nearest - takeoff) * dir);
    if (span > jumps.reach(rise, scaleAt(nav, world, takeoff, from.top))) continue;
    yield {
      leg: { kind: 'jump', from: takeoff, to, land },
      land,
      cost: Math.abs(x - takeoff) + COST.jump + Math.abs(land - takeoff),
    };
  }
}

/**
 * A take-off under `to` with nothing solid overhead that would stop the jump short, as near `x` as there is one in
 * `lo`..`hi`.
 */
function clearTakeoff(
  nav: Nav,
  world: World,
  from: Ledge,
  to: Ledge,
  x: number,
  lo: number,
  hi: number,
): number | null {
  const { grid } = world;
  const height = nav.kit.PLAYER_SIZE.h;
  const top = grid.rowAt(to.top - height - 3);
  const bottom = grid.rowAt(from.top - height - 1);
  const clear = (at: number): boolean => {
    for (let col = grid.colAt(at - nav.halfBody + 0.01); col <= grid.colAt(at + nav.halfBody - 0.01); col++) {
      for (let row = top; row <= bottom; row++) if (grid.kindAt(col, row) === 'solid') return false;
    }
    return true;
  };
  for (let offset = 0; offset <= hi - lo; offset += 8) {
    if (x - offset >= lo && clear(x - offset)) return x - offset;
    if (x + offset <= hi && clear(x + offset)) return x + offset;
  }
  return null;
}

/**
 * Take-offs just clear of the slow zones beside `to`, where a jump has its full height: far enough out that a walker
 * jumping a little short of one is still clear of the zone.
 */
function zoneEdges(nav: Nav, world: World, from: Ledge, to: Ledge): number[] {
  const edges: number[] = [];
  const clear = nav.halfBody + 5;
  for (const zone of world.slowZones) {
    const { x, w, y } = zone.rect;
    if (y > from.top || x > to.x1 + 80 || x + w < to.x0 - 80) continue;
    edges.push(x - clear, x + w + clear);
  }
  return edges;
}

/** The slow zone's pull on a body standing with its centre at `x` and its feet at `feet`, if it stands in one. */
function scaleAt(nav: Nav, world: World, x: number, feet: number): MoveScale {
  const { w, h } = nav.kit.PLAYER_SIZE;
  const body = { x: x - nav.halfBody, y: feet - h, w, h };
  return world.slowZones.find((zone) => zone.contains(body))?.scale ?? nav.kit.NORMAL_SCALE;
}

/** Where on `ledge` the hero can head-butt `block` from, or null when it is not overhead within a jump. */
function bumpFrom(nav: Nav, ledge: Ledge, block: HighlightBlock): number | null {
  if (block.used) return null;
  const { x, y, w, h } = block.rect;
  const centre = x + w / 2;
  const rise = ledge.top - (y + h);
  if (centre <= ledge.x0 || centre >= ledge.x1 || rise <= 0) return null;
  return rise <= nav.jumps.headReach(nav.kit.PLAYER_SIZE.h) ? centre : null;
}
