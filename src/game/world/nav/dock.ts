import type { Rect } from '@/engine/math/Rect';
import type { MovingPlatform } from '../../entities/stage/MovingPlatform';

/** A vehicle's two stops: its roof as it lies at home and at the far end of its track, and the stop it stands at. */
export interface Dock {
  readonly home: Rect;
  readonly away: Rect;
  /** Where the vehicle stands, or null on its way. */
  readonly at: 'home' | 'away' | null;
}

/** Reads a vehicle's stops from what it shows: its roof, the prop's left edge and the track it runs along. */
export function dockOf(mover: MovingPlatform): Dock {
  const roof = mover.rect;
  const margin = roof.x - mover.x;
  const { from, to } = mover.track;
  const away = to - (roof.w + 2 * margin);
  return {
    home: { ...roof, x: from + margin },
    away: { ...roof, x: away + margin },
    at: mover.x === from ? 'home' : mover.x === away ? 'away' : null,
  };
}
