import { describe, expect, it, vi } from 'vitest';
import type { Album } from '@/content/radio/types';
import type { DiscArt } from '../deck';
import { DiscPrints, type DiscPrintsHost } from './discPrints';

const album = (id: string, disc?: string): Album => ({
  id,
  title: id,
  artist: 'Artist',
  cover: 'cover.webp',
  ...(disc ? { disc } : {}),
  tracks: [{ title: 'One', file: '01.m4a', seconds: 40 }],
});
const SHELF = [album('a', 'disc.webp'), album('b'), album('c', 'disc.webp')];

interface Fixture {
  readonly prints: DiscPrints;
  readonly calls: (readonly DiscArt[])[];
  readonly urls: string[];
  /** Resolves (or rejects, with `fail`) the art of the album at `index`. */
  arrive(index: number, fail?: boolean): Promise<void>;
  /** Runs the idle task the prints asked for, if any; returns whether there was one. */
  idle(): boolean;
  readonly idleRequests: number;
  readonly closed: string[];
  readonly painted: string[];
}

function fixture(albums: readonly Album[] = SHELF): Fixture {
  const calls: (readonly DiscArt[])[] = [];
  const urls: string[] = [];
  const closed: string[] = [];
  const painted: string[] = [];
  const art = new Map<number, { resolve(image: ImageBitmap): void; reject(error: Error): void }>();
  let idleTask: (() => void) | null = null;
  let idleRequests = 0;
  const host: DiscPrintsHost = {
    loadArt(url) {
      const index = urls.push(url) - 1;
      return new Promise<ImageBitmap>((resolve, reject) => art.set(index, { resolve, reject }));
    },
    canvas(size) {
      const canvas = Object.assign(new EventTarget(), {
        width: size,
        height: size,
        id: `canvas-${painted.length}`,
      }) as unknown as HTMLCanvasElement;
      const context = new Proxy(
        {},
        {
          get: (_target, key) =>
            key === 'measureText'
              ? () => ({ width: 10 })
              : key === 'drawImage'
                ? (image: { name: string }) => painted.push(image.name)
                : () => {},
          set: () => true,
        },
      ) as CanvasRenderingContext2D;
      return { canvas, context };
    },
    whenIdle(task) {
      idleRequests++;
      idleTask = task;
      return () => {
        if (idleTask === task) idleTask = null;
      };
    },
  };
  const deck = { labelSize: 256 as const, setDiscs: (discs: readonly DiscArt[]) => calls.push(discs) };
  const prints = new DiscPrints(deck, albums, (entry, name) => `${entry.id}/${name}`, host);
  return {
    prints,
    calls,
    urls,
    closed,
    painted,
    get idleRequests() {
      return idleRequests;
    },
    async arrive(index, fail = false) {
      const pending = art.get(index);
      if (!pending) throw new Error(`No art requested at ${index}`);
      const name = urls[index] ?? '';
      if (fail) pending.reject(new Error('404'));
      else pending.resolve({ name, close: () => closed.push(name) } as unknown as ImageBitmap);
      await Promise.resolve();
      await Promise.resolve();
    },
    idle() {
      const task = idleTask;
      idleTask = null;
      task?.();
      return task !== null;
    },
  };
}

describe('DiscPrints', () => {
  it('hands the room the plain shelf at once, in display order, and fetches each disc print or cover', () => {
    const { prints, calls, urls } = fixture();
    prints.start();
    expect(calls).toEqual([
      [
        { id: 'a', label: null },
        { id: 'b', label: null },
        { id: 'c', label: null },
      ],
    ]);
    expect(urls).toEqual(['a/disc.webp', 'b/cover.webp', 'c/disc.webp']);
  });

  it('paints nothing until painting is allowed, then one print per idle moment', async () => {
    const f = fixture();
    f.prints.start();
    await f.arrive(0);
    await f.arrive(1);
    expect(f.idleRequests).toBe(0);
    f.prints.setAllowed(true);
    expect(f.idle()).toBe(true);
    expect(f.painted).toEqual(['a/disc.webp']);
    expect(f.idle()).toBe(true);
    expect(f.painted).toEqual(['a/disc.webp', 'b/cover.webp']);
    // The third print has not arrived: nothing waits for an idle moment.
    expect(f.idle()).toBe(false);
    expect(f.calls).toHaveLength(1);
  });

  it('stops at once when painting is no longer allowed, and goes on where it left off', async () => {
    const f = fixture();
    f.prints.start();
    f.prints.setAllowed(true);
    await f.arrive(0);
    await f.arrive(1);
    f.idle();
    f.prints.setAllowed(false);
    expect(f.idle()).toBe(false);
    expect(f.painted).toEqual(['a/disc.webp']);
    f.prints.setAllowed(true);
    f.idle();
    expect(f.painted).toEqual(['a/disc.webp', 'b/cover.webp']);
  });

  it('gives the room every print together, in display order, once the last is painted', async () => {
    const f = fixture();
    f.prints.start();
    f.prints.setAllowed(true);
    await f.arrive(2);
    f.idle();
    await f.arrive(0);
    f.idle();
    expect(f.calls).toHaveLength(1);
    await f.arrive(1);
    f.idle();
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1]?.map((disc) => disc.id)).toEqual(['a', 'b', 'c']);
    expect(f.calls[1]?.every((disc) => disc.label !== null)).toBe(true);
    expect(f.closed.sort()).toEqual(['a/disc.webp', 'b/cover.webp', 'c/disc.webp']);
  });

  it('paints a plain disc with its text when the art cannot load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture([album('a')]);
    f.prints.start();
    f.prints.setAllowed(true);
    await f.arrive(0, true);
    await Promise.resolve();
    f.idle();
    expect(f.painted).toEqual([]);
    expect(f.calls[1]).toEqual([{ id: 'a', label: expect.objectContaining({ width: 256 }) }]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('drops the idle task and closes art that arrives after it is disposed', async () => {
    const f = fixture();
    f.prints.start();
    f.prints.setAllowed(true);
    await f.arrive(0);
    f.prints.dispose();
    expect(f.idle()).toBe(false);
    await f.arrive(1);
    expect(f.closed.sort()).toEqual(['a/disc.webp', 'b/cover.webp']);
    expect(f.painted).toEqual([]);
    expect(f.calls).toHaveLength(1);
  });

  /** Every print painted and handed to the room; returns the canvases it got. */
  async function shelved(f: Fixture): Promise<HTMLCanvasElement[]> {
    f.prints.start();
    f.prints.setAllowed(true);
    for (let i = 0; i < 3; i++) {
      await f.arrive(i);
      f.idle();
    }
    return (f.calls.at(-1) ?? []).map((disc) => disc.label as HTMLCanvasElement);
  }

  // A GPU process reset (a laptop's sleep, a display change) gives every print's canvas back blank, and the room's
  // restored context uploads it as it is: bare discs. The art was closed once painted, so it is fetched again.
  it('paints a print again on a new canvas, from art fetched again, when its canvas comes back blank', async () => {
    const f = fixture();
    const [a, b] = await shelved(f);
    expect(f.urls).toHaveLength(3);
    b?.dispatchEvent(new Event('contextrestored'));
    expect(f.urls).toEqual(['a/disc.webp', 'b/cover.webp', 'c/disc.webp', 'b/cover.webp']);
    await f.arrive(3);
    f.idle();
    expect(f.painted.at(-1)).toBe('b/cover.webp');
    const delivered = f.calls.at(-1) ?? [];
    expect(f.calls).toHaveLength(3);
    expect(delivered.map((disc) => disc.id)).toEqual(['a', 'b', 'c']);
    // The room takes a new canvas as a new print (and uploads it); the others it already has.
    expect(delivered[0]?.label).toBe(a);
    expect(delivered[1]?.label).not.toBe(b);
    expect(f.closed.filter((name) => name === 'b/cover.webp')).toHaveLength(2);
    // The old canvas is done with: it is not listened to any more.
    b?.dispatchEvent(new Event('contextrestored'));
    expect(f.urls).toHaveLength(4);
  });

  it('waits until painting is allowed to paint a restored print', async () => {
    const f = fixture();
    const [a] = await shelved(f);
    f.prints.setAllowed(false);
    a?.dispatchEvent(new Event('contextrestored'));
    await f.arrive(3);
    expect(f.idle()).toBe(false);
    f.prints.setAllowed(true);
    expect(f.idle()).toBe(true);
    expect(f.calls).toHaveLength(3);
  });

  it('stops listening once disposed', async () => {
    const f = fixture();
    const [a] = await shelved(f);
    f.prints.dispose();
    a?.dispatchEvent(new Event('contextrestored'));
    expect(f.urls).toHaveLength(3);
  });
});
