/** The longest the loading screen waits for its faces before it shows in the fallbacks. */
const FONT_WAIT_MS = 1500;

let ready: Promise<void> | null = null;

/**
 * Asks for the faces the loading screen sets its name and line in (Chewy, Nunito 600), so they download with the
 * first chunk instead of when the screen first paints them. Resolves when both are in, or after `FONT_WAIT_MS` on a
 * slow link, and never rejects; idempotent.
 */
export function loadUiFonts(): Promise<void> {
  ready ??= new Promise<void>((resolve) => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, FONT_WAIT_MS);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    Promise.all([fonts.load('400 1em Chewy', 'ROEL'), fonts.load('600 1em Nunito')]).then(done, done);
  });
  return ready;
}
