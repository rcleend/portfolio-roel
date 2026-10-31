import { type RefObject, useEffect, useState } from 'react';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { Room } from '@/room';

export type RoomStatus =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly room: Room }
  | { readonly state: 'unavailable' };

/**
 * Lazily loads the room module (three.js is ~180 kB gzipped and the flat host
 * never needs it), builds one room in `container` and disposes it on unmount.
 * The room lays the computer's live screen into `overlayContainer`, which must
 * cover the same box outside the stage's `role="application"`.
 *
 * StrictMode safe: the first, discarded effect run is cancelled before the
 * module resolves, so only one WebGL context and one asset download ever
 * exist. Any failure — the chunk, no WebGL (createRoom throws), or the
 * models — reports `unavailable` so the caller can fall back to the flat TV.
 */
export function useRoom(
  container: RefObject<HTMLElement | null>,
  overlayContainer: RefObject<HTMLElement | null>,
  surface: GameSurface,
): RoomStatus {
  const [status, setStatus] = useState<RoomStatus>({ state: 'loading' });

  useEffect(() => {
    const element = container.current;
    const overlay = overlayContainer.current;
    if (!element || !overlay) return;
    let cancelled = false;
    let room: Room | null = null;
    const fail = (error: unknown): void => {
      if (cancelled) return;
      console.warn('Room unavailable, falling back to the flat TV:', error);
      room?.dispose();
      room = null;
      setStatus({ state: 'unavailable' });
    };

    import('@/room').then(({ createRoom }) => {
      if (cancelled) return;
      try {
        room = createRoom({
          container: element,
          overlayContainer: overlay,
          surface,
          mood: 'rose',
          air: { haze: 0.7, dust: 0.3 },
        });
      } catch (error) {
        fail(error);
        return;
      }
      const created = room;
      created.ready.then(() => {
        if (!cancelled) setStatus({ state: 'ready', room: created });
      }, fail);
    }, fail);

    return () => {
      cancelled = true;
      room?.dispose();
      room = null;
    };
  }, [container, overlayContainer, surface]);

  return status;
}
