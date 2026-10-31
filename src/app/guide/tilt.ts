import { useEffect } from 'react';
import type { Room } from '@/room';

/**
 * The phone's gyroscope looking gently round the room view (round six, item 38): while the overview shows on a touch
 * screen, tilting the phone moves the camera a little, as the pointer's parallax does on a desktop (the room smooths
 * and clamps it, and keeps it to the room view). Small: a tilt of `RANGE_DEGREES` is the whole of it. Off under
 * reduced motion and wherever there is no orientation sensor.
 *
 * The site never asks for the sensor: where the browser would want permission first (iOS Safari's
 * `DeviceOrientationEvent.requestPermission`), there is simply no tilt, and no question, button or hint.
 */

/** Degrees of tilt from where the phone was held that reach the parallax's edge. */
const RANGE_DEGREES = 18;
/** How quickly "where the phone is held" follows the phone, per reading: a held tilt eases back to the middle. */
const RECENTRE = 0.004;

/** True where orientation events arrive without asking the visitor (not where the browser gates them on a prompt). */
function sensorFree(): boolean {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  return typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission !== 'function';
}

export function useTiltLook(room: Room, touch: boolean, active: boolean): void {
  const wanted = touch && sensorFree();

  useEffect(() => {
    if (!wanted || !active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let held: { x: number; y: number } | null = null;
    const onOrientation = (event: DeviceOrientationEvent): void => {
      if (event.beta === null || event.gamma === null) return;
      // Into the screen's own axes: right and up as the visitor sees it, however the phone is turned.
      const angle = screen.orientation?.angle ?? 0;
      const [x, y] =
        angle === 90
          ? [event.beta, event.gamma]
          : angle === 270 || angle === -90
            ? [-event.beta, -event.gamma]
            : angle === 180
              ? [-event.gamma, event.beta]
              : [event.gamma, -event.beta];
      held ??= { x, y };
      held.x += (x - held.x) * RECENTRE;
      held.y += (y - held.y) * RECENTRE;
      const clamp = (value: number): number => Math.max(-1, Math.min(1, value / RANGE_DEGREES));
      room.setTilt({ x: clamp(x - held.x), y: clamp(y - held.y) });
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      room.setTilt(null);
    };
  }, [room, wanted, active]);
}
