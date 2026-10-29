import type { RoomTarget } from '@/room';

/** What each prop is for, in a word: the menu's items and the labels over the props say the same. */
export const PROP_NAMES: Readonly<Record<RoomTarget, string>> = {
  pc: 'Résumé',
  radio: 'Music',
  tv: 'Game',
};
