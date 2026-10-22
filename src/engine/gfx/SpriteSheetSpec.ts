import type { Vec2 } from '../math/Vec2';

/**
 * The JSON half of an image sprite sheet. The PNG holds one row per
 * animation, in the order of `animations`, frames left to right; it is
 * `frame.w × the largest frame count` wide and unused cells are transparent.
 *
 *     {
 *       "frame": { "w": 64, "h": 64 },
 *       "origin": { "x": 32, "y": 64 },
 *       "animations": [
 *         { "name": "idle", "fps": 8, "loop": true, "frames": 6 },
 *         { "name": "attack", "fps": 15, "loop": false, "frames": 5,
 *           "anchors": { "muzzle": [[50, 30], [52, 30], [54, 29], [54, 29], [52, 30]] } }
 *       ]
 *     }
 */
export interface SpriteSheetSpec {
  readonly frame: { readonly w: number; readonly h: number };
  /** The point placed on the drawing position, in frame pixels; may sit on the frame's edge (feet at the bottom). */
  readonly origin: Vec2;
  readonly animations: readonly SpriteAnimationSpec[];
}

export interface SpriteAnimationSpec {
  readonly name: string;
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: number;
  /** Named pixels per frame, in frame pixels — e.g. where a projectile leaves the hand. */
  readonly anchors: Readonly<Record<string, readonly Vec2[]>>;
}

export class SpriteSheetSpecError extends Error {
  override readonly name = 'SpriteSheetSpecError';
}

const SHEET_KEYS = ['frame', 'origin', 'animations'];
const ANIMATION_KEYS = ['name', 'fps', 'loop', 'frames', 'anchors'];

/**
 * Validates a sheet's JSON and throws a `SpriteSheetSpecError` naming the
 * file and the exact field, so a broken export fails loudly at load time
 * instead of drawing the wrong frame somewhere in a level.
 */
export function parseSpriteSheetSpec(raw: unknown, source: string): SpriteSheetSpec {
  const fail = (path: string, message: string): never => {
    throw new SpriteSheetSpecError(`Invalid sprite sheet ${source}: ${path} ${message}`);
  };
  const json = record(raw) ?? fail('the root', 'must be an object');
  rejectUnknownKeys(json, SHEET_KEYS, 'the root', fail);

  const frameJson = record(json.frame) ?? fail('frame', 'must be an object like { "w": 64, "h": 64 }');
  const w = positiveInteger(frameJson.w) ?? fail('frame.w', `must be a positive integer, got ${show(frameJson.w)}`);
  const h = positiveInteger(frameJson.h) ?? fail('frame.h', `must be a positive integer, got ${show(frameJson.h)}`);

  const originJson = record(json.origin) ?? fail('origin', 'must be an object like { "x": 32, "y": 64 }');
  const origin = {
    x:
      integerIn(originJson.x, 0, w) ?? fail('origin.x', `must be an integer from 0 to ${w}, got ${show(originJson.x)}`),
    y:
      integerIn(originJson.y, 0, h) ?? fail('origin.y', `must be an integer from 0 to ${h}, got ${show(originJson.y)}`),
  };

  const list = Array.isArray(json.animations) ? json.animations : fail('animations', 'must be an array');
  if (list.length === 0) fail('animations', 'must list at least one animation');
  const names = new Set<string>();
  const animations = list.map((value: unknown, index): SpriteAnimationSpec => {
    const at = `animations[${index}]`;
    const animation = record(value) ?? fail(at, 'must be an object');
    rejectUnknownKeys(animation, ANIMATION_KEYS, at, fail);
    const name =
      typeof animation.name === 'string' && animation.name.length > 0
        ? animation.name
        : fail(`${at}.name`, `must be a non-empty string, got ${show(animation.name)}`);
    if (names.has(name)) fail(`${at}.name`, `"${name}" is used twice`);
    names.add(name);
    const fps =
      typeof animation.fps === 'number' && Number.isFinite(animation.fps) && animation.fps > 0
        ? animation.fps
        : fail(`${at}.fps`, `must be a number above 0, got ${show(animation.fps)}`);
    const loop =
      typeof animation.loop === 'boolean'
        ? animation.loop
        : fail(`${at}.loop`, `must be true or false, got ${show(animation.loop)}`);
    const frames =
      positiveInteger(animation.frames) ??
      fail(`${at}.frames`, `must be a positive integer, got ${show(animation.frames)}`);
    return { name, fps, loop, frames, anchors: parseAnchors(animation.anchors, `${at}.anchors`, frames, w, h, fail) };
  });

  return { frame: { w, h }, origin, animations };
}

/** Size of the PNG a spec describes: one row per animation, as wide as the longest one. */
export function specImageSize(spec: SpriteSheetSpec): { readonly w: number; readonly h: number } {
  const columns = Math.max(...spec.animations.map((animation) => animation.frames));
  return { w: spec.frame.w * columns, h: spec.frame.h * spec.animations.length };
}

function parseAnchors(
  value: unknown,
  at: string,
  frames: number,
  w: number,
  h: number,
  fail: (path: string, message: string) => never,
): Readonly<Record<string, readonly Vec2[]>> {
  if (value === undefined) return {};
  const json = record(value) ?? fail(at, 'must be an object of named points, like { "muzzle": [[50, 30]] }');
  const anchors: Record<string, readonly Vec2[]> = {};
  for (const [name, points] of Object.entries(json)) {
    if (!Array.isArray(points) || points.length !== frames) {
      fail(`${at}.${name}`, `must list one [x, y] per frame (${frames}), got ${show(points)}`);
    }
    anchors[name] = (points as unknown[]).map((point, index) => {
      const pair = Array.isArray(point) && point.length === 2 ? point : null;
      const x = integerIn(pair?.[0], 0, w - 1);
      const y = integerIn(pair?.[1], 0, h - 1);
      if (x === null || y === null) {
        fail(`${at}.${name}[${index}]`, `must be [x, y] inside the ${w}×${h} frame, got ${show(point)}`);
      }
      return { x: x as number, y: y as number };
    });
  }
  return anchors;
}

/** A typo such as "anchor" would otherwise vanish silently; naming it saves a debugging session. */
function rejectUnknownKeys(
  json: Record<string, unknown>,
  allowed: readonly string[],
  at: string,
  fail: (path: string, message: string) => never,
): void {
  for (const key of Object.keys(json)) {
    if (!allowed.includes(key)) fail(at, `has an unknown key "${key}" (expected ${allowed.join(', ')})`);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

function integerIn(value: unknown, min: number, max: number): number | null {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : null;
}

function show(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}
