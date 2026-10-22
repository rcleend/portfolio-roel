import { classicBackdrop } from './classic';
import { liftoffBackdrop } from './liftoff';

/**
 * Every title backdrop, in the order the playground lists them. A new
 * backdrop is a folder beside `classic/` plus one entry here; its id then
 * becomes a `TitleBackdropId`, a valid `backdrop` scene param.
 */
export const TITLE_BACKDROPS = [classicBackdrop, liftoffBackdrop] as const;

export type TitleBackdropId = (typeof TITLE_BACKDROPS)[number]['id'];

export type { BackdropArt, TitleBackdrop, TitleFrame } from './TitleBackdrop';
