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

  // A prop under the pointer always shows itself: it comes before what the app asks for (its menu's item under the
  // pointer, else the one its keyboard has), and the app's pick comes back as the pointer leaves the prop.
  it("puts the prop under the pointer before the app's pick, and hands back to it", async () => {
    const spotlight = door();
    spotlight.preload();
    await loaded();
    spotlight.setOpen(true);
    spotlight.light('radio');
    expect(shown.at(-1)).toBe('radio');
    spotlight.hover('tv');
    expect(shown.at(-1)).toBe('tv');
    spotlight.hover(null);
    expect(shown.at(-1)).toBe('radio');
    spotlight.light(null);
    expect(shown.at(-1)).toBeNull();
    spotlight.hover('pc');
    expect(shown.at(-1)).toBe('pc');
  });

  // A hover belongs to the pose it was picked at: the door forgets it as the camera sets off, and the room says again
  // what the pointer rests on once it has landed (RoomInteraction.refreshCursor), so no prop lights for the pose it
  // was left behind in.
  it('forgets the pointer’s prop as the camera sets off, and takes it again on arrival', async () => {
    const spotlight = door();
    spotlight.preload();
    await loaded();
    spotlight.setOpen(true);
    spotlight.hover('tv');
    expect(shown.at(-1)).toBe('tv');

    spotlight.setOpen(false);
    expect(shown.at(-1)).toBeNull();
    spotlight.setOpen(true);
    expect(shown.at(-1)).toBeNull();
    spotlight.hover('tv');
    expect(shown.at(-1)).toBe('tv');
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
