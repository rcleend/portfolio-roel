/**
 * Events that count as a user gesture. Browsers differ on which ones grant
 * audio "user activation": Chrome counts `pointerup`/`touchend` for touch but
 * not `touchstart`, Safari is the reverse in places, so listen to all of them
 * and let the first one that works win.
 */
export const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click'] as const;

/**
 * Calls `attempt` on every user gesture until it succeeds once, then stops
 * listening. Returns a function that stops listening early.
 */
export function onFirstGesture(target: EventTarget, attempt: () => Promise<void>): () => void {
  let done = false;
  let pending = false;
  const options: AddEventListenerOptions = { capture: true, passive: true };
  const stop = (): void => {
    done = true;
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, handle, options);
  };
  function handle(): void {
    if (done || pending) return;
    pending = true;
    attempt().then(stop, () => {
      // Not a gesture this browser accepts (or the context refused): try again on the next one.
      pending = false;
    });
  }
  for (const type of GESTURE_EVENTS) target.addEventListener(type, handle, options);
  return stop;
}
