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
  if (!enabled) return { enabled, host, scene: null, params: undefined, seed: null, frames: null };

  const sceneParam = query.get('scene');
  if (sceneParam !== null && !isSceneId(sceneParam)) throw new HarnessConfigError(`Unknown scene "${sceneParam}"`);

  const paramsParam = query.get('params');
  let params: unknown;
  if (paramsParam !== null) {
    try {
      params = JSON.parse(paramsParam);
    } catch {
      throw new HarnessConfigError(`params must be JSON, got ${paramsParam}`);
    }
  }

  return {
    enabled,
    host,
    scene: sceneParam,
    params,
    seed: integerParam(query, 'seed'),
    frames: integerParam(query, 'frames'),
  };
}

function integerParam(query: URLSearchParams, name: string): number | null {
  const raw = query.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new HarnessConfigError(`${name} must be a non-negative integer, got ${raw}`);
  return value;
}
