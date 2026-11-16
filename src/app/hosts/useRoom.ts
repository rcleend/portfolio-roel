import { type RefObject, useEffect, useRef, useState } from 'react';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { FramingInsets, Room } from '@/room';

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
 * module resolves, so only one WebGL context ever exists. Any failure — the
 * chunk, no WebGL (createRoom throws), or the room's making — reports `unavailable` so the caller can fall back to the flat TV.
 */
export function useRoom(
  container: RefObject<HTMLElement | null>,
  overlayContainer: RefObject<HTMLElement | null>,
  surface: GameSurface,
  /** What the app's overlays cover as the page opens: the room frames its opening view, and lights it first, by it. */
  insets: FramingInsets,
): RoomStatus {
  const [status, setStatus] = useState<RoomStatus>({ state: 'loading' });
  // Read once, at creation; later changes go through `setFramingInsets`.
  const opening = useRef(insets);

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
          framingInsets: opening.current,
          mood: 'rose',
          air: { haze: 0.7, dust: 0.3 },
          quality: fixedQuality(),
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

/**
 * `?quality=high|medium|low` (development, or production with `?debug`) fixes the room's quality tier for
 * measurements and screenshots; otherwise the room chooses and governs it (docs/ROOM.md › Quality).
 */
function fixedQuality(): 'high' | 'medium' | 'low' | 'auto' {
  const query = new URLSearchParams(window.location.search);
  const value = query.get('quality');
  const allowed = import.meta.env.DEV || query.has('debug');
  return allowed && (value === 'high' || value === 'medium' || value === 'low') ? value : 'auto';
}
