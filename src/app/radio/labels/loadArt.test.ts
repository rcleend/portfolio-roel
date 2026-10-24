import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_TIMEOUT_MS, loadArt } from './loadArt';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadArt', () => {
  it('gives up on art that does not arrive, so one slow host cannot hold back every print', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const loading = loadArt('https://slow.example/cover.jpg', 384);
    expect(timeout).toHaveBeenCalledWith(ART_TIMEOUT_MS);
    const signal = fetch.mock.calls[0]?.[1].signal as AbortSignal;
    // The timer's abort, as the browser would fire it.
    signal.dispatchEvent(new Event('abort'));
    await expect(loading).rejects.toThrow();
  });

  it('refuses a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(loadArt('/missing.webp', 384)).rejects.toThrow('HTTP 404');
  });
});
