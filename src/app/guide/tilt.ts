import { useEffect } from 'react';
import type { Room } from '@/room';
import { GESTURE_EVENTS } from '../audio/firstGesture';

/**
 * The phone's gyroscope looking gently round the room view (round six, item 38): while the overview shows on a touch
 * screen, tilting the phone moves the camera a little, as the pointer's parallax does on a desktop (the room smooths
 * and clamps it, and keeps it to the room view). Small: a tilt of `RANGE_DEGREES` is the whole of it. Off under
 * reduced motion, and wherever there is no orientation sensor or the visitor said no.
 *
 * iOS asks the visitor first, and only from a gesture: the first tap after this loads asks (the TV's way out, or any
 * tap at the game); a refusal or a browser without the question is silent.
 */

/** Degrees of tilt from where the phone was held that reach the parallax's edge. */
const RANGE_DEGREES = 18;
/** How quickly "where the phone is held" follows the phone, per reading: a held tilt eases back to the middle. */
const RECENTRE = 0.004;

type Permission = 'granted' | 'denied' | 'pending';
let permission: Permission = 'pending';

interface OrientationConstructor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Asks iOS for the sensor on the next gesture; elsewhere it is simply there. Once per page. */
function askOnNextGesture(): () => void {
  const ask = (DeviceOrientationEvent as unknown as OrientationConstructor).requestPermission;
  if (!ask) {
    permission = 'granted';
    return () => {};
  }
  const options = { capture: true, passive: true } as const;
  const stop = (): void => {
    for (const type of GESTURE_EVENTS) window.removeEventListener(type, handle, options);
  };
  function handle(event: Event): void {
    // iOS grants the question only from a tap's end or a click.
    if (event.type !== 'touchend' && event.type !== 'click') return;
    stop();
    ask?.call(DeviceOrientationEvent).then(
      (answer) => {
        permission = answer;
      },
      () => {
        permission = 'denied';
      },
    );
  }
  for (const type of GESTURE_EVENTS) window.addEventListener(type, handle, options);
  return stop;
}

export function useTiltLook(room: Room, touch: boolean, active: boolean): void {
  const wanted = touch && typeof DeviceOrientationEvent !== 'undefined';

  useEffect(() => {
    if (!wanted || permission !== 'pending' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return askOnNextGesture();
  }, [wanted]);

  useEffect(() => {
    if (!wanted || !active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let held: { x: number; y: number } | null = null;
    const onOrientation = (event: DeviceOrientationEvent): void => {
      if (permission !== 'granted' || event.beta === null || event.gamma === null) return;
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
