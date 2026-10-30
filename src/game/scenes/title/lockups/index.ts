import { classicLockup } from './classic';
import { faithfulLockup } from './faithful';
import { headlinerLockup } from './headliner';
import { heavyMetalLockup } from './heavy-metal';

/**
 * Every title lockup. A new lockup is a folder beside `classic/` plus one
 * entry here; its id then becomes a `TitleLockupId`, a valid `lockup` scene
 * param.
 */
export const TITLE_LOCKUPS = [classicLockup, faithfulLockup, headlinerLockup, heavyMetalLockup] as const;

export type TitleLockupId = (typeof TITLE_LOCKUPS)[number]['id'];

export type { LockupArt, LockupGlint, TitleLockup } from './TitleLockup';
