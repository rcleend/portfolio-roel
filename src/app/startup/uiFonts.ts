/** The longest the loading screen waits for its face before it shows in the fallback. */
const FONT_WAIT_MS = 1500;

let ready: Promise<void> | null = null;

/**
 * Asks for the face the loading screen sets its word in (Chewy), so it downloads with the first chunk instead of when
 * the screen first paints it. Resolves when it is in, or after `FONT_WAIT_MS` on a slow link, and never rejects;
 * idempotent.
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
    fonts.load('400 1em Chewy', 'Loading...').then(done, done);
  });
  return ready;
}
