import type { RoomView } from '../deck';

/**
 * Where the radio's sound comes from as the camera moves (SPEC §8.5): full at the radio,
 * a little farther off in the room (−2 dB) and at the computer (−5 dB); at the TV it
 * yields the floor to the game. Pure.
 */

/** Linear volume from each view the radio plays in. */
export const PERSPECTIVE = { radio: 1, room: 0.79, pc: 0.56 } as const satisfies Record<
  Exclude<RoomView, 'tv'>,
  number
>;

export interface RadioAudio {
  /** False at the TV: the radio fades out and waits (`pausedByTv`). */
  readonly audible: boolean;
  /** The element's volume, 0–1: the perspective times the album's own gain (≤ 0 dB). */
  readonly volume: number;
}

export function radioAudio(view: RoomView, gainDb = 0): RadioAudio {
  if (view === 'tv') return { audible: false, volume: 0 };
  return { audible: true, volume: PERSPECTIVE[view] * 10 ** (Math.min(0, gainDb) / 20) };
}

/** True when the camera heads for the TV, false when it leaves it, null for any other move. */
export function tvTransition(from: RoomView, to: RoomView): boolean | null {
  if (from === to) return null;
  if (to === 'tv') return true;
  if (from === 'tv') return false;
  return null;
}
