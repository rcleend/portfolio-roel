import { classicLockup } from './classic';

/**
 * Every title lockup, in the order the playground lists them. A new lockup
 * is a folder beside `classic/` plus one entry here; its id then becomes a
 * `TitleLockupId`, a valid `lockup` scene param.
 */
export const TITLE_LOCKUPS = [classicLockup] as const;

export type TitleLockupId = (typeof TITLE_LOCKUPS)[number]['id'];

export type { LockupArt, LockupGlint, TitleLockup } from './TitleLockup';
