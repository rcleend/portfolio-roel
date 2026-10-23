import { type LevelId, levels } from '@/content';
import type { LineupParams } from '../params';

/** What the lineup shows, resolved from its params. */
export interface Lineup {
  readonly cast: 'terraria' | 'game';
  readonly backdrop: 'menu' | LevelId;
}

export class LineupParamsError extends Error {
  override readonly name = 'LineupParamsError';
}

const CASTS = ['terraria', 'game'] as const;

/**
 * Reads the lineup's params, which arrive as untrusted JSON from the
 * harness. Anything unknown throws, naming what would have been accepted, so
 * a typo fails a screenshot instead of showing the wrong lineup.
 */
export function resolveLineup(params: LineupParams | undefined): Lineup {
  const raw: Record<string, unknown> = { ...params };
  const backdrops = ['menu', ...levels.map((level) => level.id)] as const;
  return {
    cast: oneOf(raw.cast ?? 'terraria', 'cast', CASTS),
    backdrop: oneOf(raw.backdrop ?? 'menu', 'backdrop', backdrops),
  };
}

function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new LineupParamsError(
    `lineup: ${name} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value) ?? 'nothing'}`,
  );
}
