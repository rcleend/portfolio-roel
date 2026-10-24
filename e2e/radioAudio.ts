import { expect, type Page } from '@playwright/test';

/**
 * What the radio's end-to-end specs watch of the page's audio: the media elements it makes, the decodes and audio
 * contexts it asks for, and the Media Session handlers it sets. The radio plays one streaming `<audio>` element
 * that is never put in the document, so it is found by watching `createElement`.
 */

export interface Sound {
  readonly src: string;
  readonly time: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly paused: boolean;
}

declare global {
  interface Window {
    __spy: {
      readonly audios: HTMLAudioElement[];
      decodes: number;
      /** Audio contexts open now (made and not closed). */
      contexts: number;
      readonly handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;
    };
    __timing?: { click: number; audible: number };
  }
}

/** Counts media elements, decodes and audio contexts, and keeps the Media Session's handlers to call. */
export async function spyOnAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const audios: HTMLAudioElement[] = [];
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {};
    window.__spy = { audios, decodes: 0, contexts: 0, handlers };
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, ...args: Parameters<Document['createElement']>) {
      const element = create.apply(this, args);
      if (element instanceof HTMLAudioElement) audios.push(element);
      return element;
    } as Document['createElement'];
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, ...args) {
      window.__spy.decodes++;
      return decode.apply(this, args);
    } as BaseAudioContext['decodeAudioData'];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        window.__spy.contexts++;
      }
      override close(): Promise<void> {
        window.__spy.contexts--;
        return super.close();
      }
    };
    const session = navigator.mediaSession;
    const setHandler = session.setActionHandler.bind(session);
    session.setActionHandler = (action, handler) => {
      handlers[action] = handler;
      setHandler(action, handler);
    };
  });
}

/** Audio the page has fetched (media requests: not the development server's `?url` modules naming the files). */
export function audioRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'media') urls.push(new URL(request.url()).pathname);
  });
  return urls;
}

/** The radio's element as it is now, or null before the first pick. */
export const sound = (page: Page): Promise<Sound | null> =>
  page.evaluate(() => {
    const element = window.__spy.audios[0];
    if (!element) return null;
    const { src, currentTime: time, volume, muted, paused } = element;
    return { src: new URL(src, location.href).pathname, time, volume, muted, paused };
  });

/** Waits until the element plays out loud: unmuted, above silence, and its clock moving. */
export async function waitAudible(page: Page, timeout = 5000): Promise<Sound> {
  let last = -1;
  let current: Sound | null = null;
  await expect
    .poll(
      async () => {
        current = await sound(page);
        const moving = current !== null && current.time > last && last >= 0;
        last = current?.time ?? -1;
        return Boolean(current && moving && !current.paused && !current.muted && current.volume > 0.05);
      },
      { timeout, intervals: [50] },
    )
    .toBe(true);
  if (!current) throw new Error('no sound');
  return current;
}

/** Time from the next pointerdown to the first frame the element is audible, measured in the page. */
export async function timePickToSound(page: Page, pick: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    const timing = { click: 0, audible: 0 };
    window.__timing = timing;
    const start = (): void => {
      if (!timing.click) timing.click = performance.now();
    };
    // A pointer's press, or the key that activates a focused button.
    window.addEventListener('pointerdown', start, { capture: true, once: true });
    window.addEventListener('keydown', start, { capture: true, once: true });
    let last = -1;
    const poll = (): void => {
      const element = window.__spy.audios[0];
      const moving = element !== undefined && element.currentTime > last && last >= 0;
      last = element?.currentTime ?? -1;
      if (timing.click && element && moving && !element.paused && !element.muted && element.volume > 0.05) {
        timing.audible = performance.now();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  await pick();
  await page.waitForFunction(() => (window.__timing?.audible ?? 0) > 0, null, { timeout: 5000 });
  return page.evaluate(() => (window.__timing ? window.__timing.audible - window.__timing.click : Number.NaN));
}
