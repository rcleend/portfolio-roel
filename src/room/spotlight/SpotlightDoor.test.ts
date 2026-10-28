import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomTarget } from '../camera/anchors';
import type { LitProp } from './PropSpotlight';
import { SpotlightDoor } from './SpotlightDoor';
import type { SpotlightHost } from './spotlightContract';

const shown: (RoomTarget | null)[] = [];
const disposed = vi.fn();
let emit: (lit: LitProp | null) => void = () => {};

vi.mock('./Spotlight', () => ({
  createSpotlight: (_host: SpotlightHost, tell: (lit: LitProp | null) => void) => {
    emit = tell;
    return { show: (target: RoomTarget | null) => shown.push(target), dispose: disposed };
  },
}));

/** Lets the dynamic import settle. */
async function loaded(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function door(): SpotlightDoor {
  const spotlight = new SpotlightDoor();
  spotlight.attach(() => ({}) as SpotlightHost);
  return spotlight;
}

describe('the spotlight door', () => {
  afterEach(() => {
    shown.length = 0;
    disposed.mockClear();
  });

  it('loads the glow once, when asked, and only after the room has loaded', async () => {
    const early = new SpotlightDoor();
    early.preload();
    await loaded();
    early.setOpen(true);
    early.hover('tv');
    expect(shown).toEqual([]);

    const spotlight = door();
    spotlight.preload();
    spotlight.preload();
    await loaded();
    // The chunk is told what to light as it arrives: nothing yet.
    expect(shown).toEqual([null]);
  });

  it('lights only while the camera rests in the room view', async () => {
    const spotlight = door();
    spotlight.preload();
    await loaded();
    spotlight.hover('tv');
    expect(shown.at(-1)).toBeNull();
    spotlight.setOpen(true);
    expect(shown.at(-1)).toBe('tv');
    spotlight.setOpen(false);
    expect(shown.at(-1)).toBeNull();
  });

  it("puts the app's pick before the pointer's, and hands back to the pointer", async () => {
    const spotlight = door();
    spotlight.preload();
    await loaded();
    spotlight.setOpen(true);
    spotlight.hover('tv');
    spotlight.light('radio');
    expect(shown.at(-1)).toBe('radio');
    spotlight.hover(null);
    expect(shown.at(-1)).toBe('radio');
    spotlight.light(null);
    expect(shown.at(-1)).toBeNull();
    spotlight.hover('pc');
    expect(shown.at(-1)).toBe('pc');
  });

  it('passes on what the chunk tells, and keeps the last of it', async () => {
    const spotlight = door();
    const heard = vi.fn();
    const stop = spotlight.onChange(heard);
    spotlight.preload();
    await loaded();
    emit({ target: 'pc', x: 10, y: 20 });
    expect(heard).toHaveBeenLastCalledWith({ target: 'pc', x: 10, y: 20 });
    expect(spotlight.lit).toEqual({ target: 'pc', x: 10, y: 20 });
    stop();
    emit(null);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(spotlight.lit).toBeNull();
    spotlight.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
