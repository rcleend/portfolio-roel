import type { RoomTarget } from '@/room';

/** What each prop is for, in a word: the menu's items and the labels over the props say the same. */
export const PROP_NAMES: Readonly<Record<RoomTarget, string>> = {
  pc: 'About',
  radio: 'Music',
  tv: 'Game',
};

/** The menu items' names for screen readers: the word, said in full. */
export const PROP_ACCESSIBLE_NAMES: Readonly<Record<RoomTarget, string>> = {
  pc: 'About me (CV)',
  radio: 'Music by me',
  tv: 'Play game',
};
