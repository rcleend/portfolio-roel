import { type LevelId, levels } from '@/content';
import { CUSTOMER_CONCEPTS, type CustomerConceptId } from '../../art/looks/terraria/customer-concepts/concepts';
import type { LineupParams } from '../params';

type Backdrop = 'menu' | LevelId;

/** The customer the customers cast stands in both moods: a Terraria concept, or the one the game draws. */
export type LineupCustomer = 'game' | CustomerConceptId;

/** What the lineup shows, resolved from its params. */
export type Lineup =
  | { readonly cast: 'terraria' | 'revised' | 'game'; readonly backdrop: Backdrop }
  | { readonly cast: 'customers'; readonly backdrop: Backdrop; readonly customer: LineupCustomer };

export class LineupParamsError extends Error {
  override readonly name = 'LineupParamsError';
}

const CASTS = ['terraria', 'revised', 'game', 'customers'] as const;

/**
 * Reads the lineup's params, which arrive as untrusted JSON from the
 * harness. Anything unknown throws, naming what would have been accepted, so
 * a typo fails a screenshot instead of showing the wrong lineup.
 */
export function resolveLineup(params: LineupParams | undefined): Lineup {
  const raw: Record<string, unknown> = { ...params };
  const backdrops = ['menu', ...levels.map((level) => level.id)] as const;
  const cast = oneOf(raw.cast ?? 'terraria', 'cast', CASTS);
  const backdrop = oneOf(raw.backdrop ?? 'menu', 'backdrop', backdrops);
  if (cast !== 'customers') {
    if (raw.customer !== undefined) throw new LineupParamsError('lineup: customer is only for the customers cast');
    return { cast, backdrop };
  }
  const customers = ['game', ...CUSTOMER_CONCEPTS.map((concept) => concept.id)] as const;
  return { cast, backdrop, customer: oneOf(raw.customer ?? 'game', 'customer', customers) };
}

function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new LineupParamsError(
    `lineup: ${name} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value) ?? 'nothing'}`,
  );
}
