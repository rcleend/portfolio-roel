import { type LookSelectionInput, parseLookSelection } from '@/game/art/looks/selection';
import { isSceneId } from '@/game/scenes';
import type { SceneId } from '@/game/scenes/params';

/** Development harness switches, read from the page URL (docs/ARCHITECTURE.md › Development harness). */
export interface HarnessConfig {
  /** True in development, or in production with `?debug`. */
  readonly enabled: boolean;
  readonly host: string | null;
  readonly scene: SceneId | null;
  readonly params: unknown;
  readonly seed: number | null;
  /** Step this many frames synchronously, then pause. */
  readonly frames: number | null;
  /** Which look each hero, the customer and each skill is drawn in, e.g. `{"customer":"hibit"}`. */
  readonly looks: LookSelectionInput | null;
  /** `?capture`: the TV view with its tube dark and no UI, for the startup stills (scripts/capture-tv-stills.mjs). */
  readonly capture: boolean;
}

export class HarnessConfigError extends Error {
  override readonly name = 'HarnessConfigError';
}

/**
 * Parses harness parameters. Outside development (and without `?debug`)
 * everything but `host` is ignored, so visitors cannot land mid-game by URL.
 * Malformed values throw: a typo should fail a screenshot loudly, not
 * silently capture the boot screen.
 */
export function readHarnessConfig(search: string, isDev: boolean): HarnessConfig {
  const query = new URLSearchParams(search);
  const enabled = isDev || query.has('debug');
  const host = query.get('host');
  if (!enabled) {
    return { enabled, host, scene: null, params: undefined, seed: null, frames: null, looks: null, capture: false };
  }

  const sceneParam = query.get('scene');
  if (sceneParam !== null && !isSceneId(sceneParam)) throw new HarnessConfigError(`Unknown scene "${sceneParam}"`);

  const paramsParam = query.get('params');
  const looksParam = query.get('looks');
  return {
    enabled,
    host,
    scene: sceneParam,
    params: paramsParam === null ? undefined : jsonParam('params', paramsParam),
    seed: integerParam(query, 'seed'),
    frames: integerParam(query, 'frames'),
    looks: looksParam === null ? null : looksSelection(jsonParam('looks', looksParam)),
    capture: query.has('capture'),
  };
}

function jsonParam(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HarnessConfigError(`${name} must be JSON, got ${raw}`);
  }
}

function looksSelection(raw: unknown): LookSelectionInput {
  try {
    return parseLookSelection(raw);
  } catch (error) {
    throw new HarnessConfigError(error instanceof Error ? error.message : String(error));
  }
}

function integerParam(query: URLSearchParams, name: string): number | null {
  const raw = query.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new HarnessConfigError(`${name} must be a non-negative integer, got ${raw}`);
  return value;
}
