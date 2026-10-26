import type { TitleParams } from '../params';
import { TITLE_BACKDROPS, type TitleBackdrop } from './backdrops';
import { TITLE_LOCKUPS, type TitleLockup } from './lockups';
import type { TitleVariant } from './TitleVariant';

/**
 * The title visitors see: the lockup and backdrop used wherever the scene's
 * params leave one out. Promoting a playground winner is a one-line change.
 */
export const TITLE_DEFAULTS = { lockup: 'classic', backdrop: 'blueprint' } as const satisfies Required<TitleParams>;

/** The two halves of the title's look. */
export interface TitleVariants {
  readonly lockup: TitleLockup;
  readonly backdrop: TitleBackdrop;
}

const PARAM_KEYS: readonly string[] = ['lockup', 'backdrop'];

/**
 * The variants `params` ask for, defaults filling the gaps. Params also
 * arrive as hand-written harness JSON, so anything unknown throws and names
 * what exists: a typo must fail the screenshot, not quietly show the
 * default in a comparison.
 */
export function resolveTitleVariants(params: unknown = {}): TitleVariants {
  if (!isRecord(params)) {
    throw new Error(`Title params must be an object such as {"backdrop":"classic"}, got ${JSON.stringify(params)}`);
  }
  const stray = Object.keys(params).find((key) => !PARAM_KEYS.includes(key));
  if (stray !== undefined) throw new Error(`Title params: unknown key "${stray}"; expected ${PARAM_KEYS.join(' or ')}`);
  return {
    lockup: variantById('lockup', TITLE_LOCKUPS, params.lockup ?? TITLE_DEFAULTS.lockup),
    backdrop: variantById('backdrop', TITLE_BACKDROPS, params.backdrop ?? TITLE_DEFAULTS.backdrop),
  };
}

/**
 * Paints the art of the title `params` show, the default one when left out,
 * so its first frame never stutters. For the default that takes about 45 ms
 * on a laptop, two thirds of it the logo and the rest the blueprint: call it
 * while nothing on screen moves, as the boot does during its black frames.
 * Later calls are free.
 */
export function prepareTitle(params?: TitleParams): void {
  const { lockup, backdrop } = resolveTitleVariants(params);
  lockup.prepare();
  backdrop.prepare();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function variantById<V extends TitleVariant>(kind: string, registry: readonly V[], id: unknown): V {
  const variant = registry.find((candidate) => candidate.id === id);
  if (variant) return variant;
  const known = registry.map((candidate) => `"${candidate.id}"`).join(', ');
  throw new Error(`Title: unknown ${kind} ${JSON.stringify(id)}; registered ${kind}s: ${known}`);
}
