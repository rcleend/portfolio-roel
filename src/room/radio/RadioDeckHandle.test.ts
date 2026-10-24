// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlsLayer } from './ControlsLayer';
import type { RadioDevice, RadioDeviceEvents, RadioHost } from './deviceContract';
import { discSlots } from './discLayout';
import type { DeckState } from './RadioDeck';
import { DEFAULT_DISCS, type DeviceLoader, RadioDeckHandle } from './RadioDeckHandle';
import { RADIO_FIXTURE } from './radioFixtures';
import { radioViewpoint } from './radioFraming';

const motion = (reduced = false) => ({ matches: reduced }) as MediaQueryList;
const PLAYING: DeckState = { loaded: 'disc-2', transport: 'playing', lcd: { kind: 'reading' } };

function fakeDevice(): RadioDevice & Record<string, ReturnType<typeof vi.fn>> {
  const calls = {
    setDiscs: vi.fn(),
    setState: vi.fn(),
    press: vi.fn(),
    setKeyboardAttention: vi.fn(),
    setPointer: vi.fn(),
    approach: vi.fn(),
    reveal: vi.fn(),
    conceal: vi.fn(),
    intent: vi.fn(),
    relayout: vi.fn(),
    pick: vi.fn(() => null),
    pointerDown: vi.fn(() => false),
    pointerMove: vi.fn(),
    pointerUp: vi.fn(),
    activate: vi.fn(),
    hover: vi.fn(),
    dispose: vi.fn(),
    lidDegrees: vi.fn(() => 42),
  };
  return { ...calls, texturePixels: 7, ambient: false, moving: false, root: {} } as never;
}

function host(view: 'room' | 'radio' = 'room'): RadioHost {
  const size = { width: 1440, height: 900, pixelRatio: 1 };
  return {
    model: { ...RADIO_FIXTURE, root: {}, meshes: [], cabinet: null } as never,
    rig: {
      viewpoint: () => radioViewpoint(RADIO_FIXTURE, discSlots(5, 1.6), size, { top: 0, right: 0, bottom: 0, left: 0 }),
      setRadioFraming: vi.fn(),
    },
    stage: {
      renderer: {} as never,
      scene: {} as never,
      camera: {} as never,
      loop: {} as never,
      visible: true,
      size,
      softwareGpu: false,
    },
    views: { view, moving: false, request: vi.fn() },
    background: { add: () => () => {} },
    loader: {} as never,
    assetBaseUrl: 'http://localhost/room/',
    anisotropy: 4,
  };
}

function handle(loader: DeviceLoader, reduced = false) {
  const layer = new ControlsLayer(document.body);
  return { layer, deck: new RadioDeckHandle(layer, motion(reduced), loader) };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('RadioDeckHandle', () => {
  it('starts with five plain discs and an empty, switched-off player', () => {
    const { deck } = handle(vi.fn());
    expect(deck.available).toBe(true);
    expect(deck.live).toBe(false);
    expect(deck.controls.dataset.radioControls).toBe('');
    expect(DEFAULT_DISCS.map((disc) => disc.label)).toEqual([null, null, null, null, null]);
    expect(deck.layout.discs).toEqual([]);
    expect(deck.layout.keys.stop).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it('frames the discs as soon as the room is there, and fixes the label size on its first read', () => {
    const loader = vi.fn();
    const { deck } = handle(loader);
    const room = host();
    const viewpoint = vi.spyOn(room.rig, 'viewpoint');
    expect(deck.labelSize).toBe(384);
    deck.attach(room);
    expect(room.rig.setRadioFraming).toHaveBeenCalledWith(5, { top: 0, right: 0, bottom: 0, left: 0 });
    // Attaching runs before the room's first frame: it solves nothing.
    expect(viewpoint).not.toHaveBeenCalled();
    // About 210 px discs at 1440 × 900 @1: the 256 px prints are sharp enough.
    expect(deck.labelSize).toBe(256);
    expect(viewpoint).toHaveBeenCalledTimes(1);
    expect(deck.labelSize).toBe(256);
    expect(viewpoint).toHaveBeenCalledTimes(1);
    expect(loader).not.toHaveBeenCalled();
    deck.setControlInsets({ top: 0, right: 0, bottom: 64, left: 0 });
    expect(room.rig.setRadioFraming).toHaveBeenLastCalledWith(5, { top: 0, right: 0, bottom: 64, left: 0 });
    deck.setDiscs([{ id: 'a', label: null }]);
    expect(room.rig.setRadioFraming).toHaveBeenLastCalledWith(1, { top: 0, right: 0, bottom: 64, left: 0 });
  });

  it('publishes the layout the device lays out', async () => {
    let events = null as RadioDeviceEvents | null;
    const { deck } = handle(async (_host, link) => {
      events = link.events;
      return fakeDevice();
    });
    const layouts = vi.fn();
    deck.onLayoutChange(layouts);
    deck.attach(host());
    deck.prefetch('idle');
    await vi.waitFor(() => expect(events).not.toBeNull());
    const layout = { discs: [{ disc: 'a', x: 1, y: 2, radius: 3, inPlayer: false }], keys: deck.layout.keys };
    events?.layout(layout);
    expect(deck.layout).toBe(layout);
    expect(layouts).toHaveBeenCalledWith(layout);
  });

  it('remembers discs, state and attention and hands them to the device once it has loaded', async () => {
    const device = fakeDevice();
    let resolve: (device: RadioDevice) => void = () => {};
    const loader = vi.fn(() => new Promise<RadioDevice>((done) => (resolve = done)));
    const { deck } = handle(loader);
    const discs = [
      { id: 'a', label: null },
      { id: 'b', label: null },
    ];
    deck.setDiscs(discs);
    deck.setState({ ...PLAYING, loaded: 'b' });
    deck.setAttention('a');
    deck.attach(host());
    deck.prefetch('idle');
    deck.prefetch('intent');
    expect(loader).toHaveBeenCalledTimes(1);
    resolve(device);
    await Promise.resolve();
    await Promise.resolve();
    expect(device.setDiscs).toHaveBeenCalledWith(discs);
    expect(device.setState).toHaveBeenCalledWith({ ...PLAYING, loaded: 'b' });
    expect(device.setKeyboardAttention).toHaveBeenCalledWith('a');
    expect(device.intent).toHaveBeenCalled();
    expect(deck.prepared).toBe(device);
    expect(deck.prepared?.lidDegrees(0)).toBe(42);
  });

  it('starts the device on the approach and passes the approach on once it is ready', async () => {
    const device = fakeDevice();
    const loader = vi.fn(async () => device);
    const { deck } = handle(loader);
    deck.attach(host('radio'));
    deck.approach(1234);
    await vi.waitFor(() => expect(device.approach).toHaveBeenCalledWith(1234));
    deck.reveal();
    expect(device.reveal).toHaveBeenCalled();
    expect(deck.live).toBe(true);
    deck.conceal();
    expect(deck.live).toBe(false);
    expect(device.conceal).toHaveBeenCalled();
  });

  it('seats a disc in a microtask when there is no device to animate it', async () => {
    const { deck } = handle(vi.fn());
    const seated = vi.fn();
    deck.onSeated(seated);
    deck.setState(PLAYING);
    expect(seated).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(seated).toHaveBeenCalledWith('disc-2');
    // Already loaded: no second insert.
    deck.setState({ ...PLAYING, transport: 'paused' });
    await Promise.resolve();
    expect(seated).toHaveBeenCalledTimes(1);
  });

  it('becomes scenery when the device fails: warned once, unavailable, back to the room', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = vi.fn(() => Promise.reject(new Error('404 radio-closeup.glb')));
    const { deck } = handle(loader);
    const room = host('radio');
    const availability = vi.fn();
    deck.onAvailableChange(availability);
    deck.attach(room);
    deck.approach(0);
    await vi.waitFor(() => expect(deck.available).toBe(false));
    expect(availability).toHaveBeenCalledWith(false);
    expect(room.views.request).toHaveBeenCalledWith('room');
    expect(warn).toHaveBeenCalledTimes(1);
    deck.prefetch('intent');
    expect(loader).toHaveBeenCalledTimes(1);
    // An unavailable radio still answers the app: the sound may start at once.
    const seated = vi.fn();
    deck.onSeated(seated);
    deck.setState(PLAYING);
    await Promise.resolve();
    expect(seated).toHaveBeenCalledWith('disc-2');
  });

  it('reports the pointer disc before the keyboard one, once per change', async () => {
    let events = null as RadioDeviceEvents | null;
    const loader = vi.fn(async (_host, link) => {
      events = link.events;
      return fakeDevice();
    });
    const { deck } = handle(loader);
    const attention = vi.fn();
    deck.onAttentionChange(attention);
    deck.attach(host());
    deck.prefetch('idle');
    await vi.waitFor(() => expect(events).not.toBeNull());
    deck.setAttention('a');
    events?.pointerAttention('b');
    events?.pointerAttention(null);
    deck.setAttention('a');
    expect(attention.mock.calls).toEqual([['a'], ['b'], ['a']]);
  });

  it('passes intents, cues and seated moments from the device to every listener', async () => {
    let events = null as RadioDeviceEvents | null;
    const { deck } = handle(async (_host, link) => {
      events = link.events;
      return fakeDevice();
    });
    const intents = vi.fn();
    const cues = vi.fn();
    const seated = vi.fn();
    deck.onIntent(intents);
    deck.onCue(cues);
    const stop = deck.onSeated(seated);
    deck.attach(host());
    deck.prefetch('idle');
    await vi.waitFor(() => expect(events).not.toBeNull());
    events?.intent({ type: 'pick', disc: 'a' });
    events?.cue({ cue: 'disc-seat', pan: 0.2 });
    events?.seated('a');
    stop();
    events?.seated('a');
    expect(intents).toHaveBeenCalledWith({ type: 'pick', disc: 'a' });
    expect(cues).toHaveBeenCalledWith({ cue: 'disc-seat', pan: 0.2 });
    expect(seated).toHaveBeenCalledTimes(1);
  });

  it('skips the idle prefetch under Save-Data but not an intent', () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    const loader = vi.fn(() => new Promise<RadioDevice>(() => {}));
    const { deck } = handle(loader);
    deck.attach(host());
    deck.prefetch('idle');
    expect(loader).not.toHaveBeenCalled();
    deck.prefetch('intent');
    expect(loader).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('refuses an empty or oversized collection', () => {
    const { deck } = handle(vi.fn());
    expect(() => deck.setDiscs([])).toThrow(RangeError);
    expect(() => deck.setDiscs(Array.from({ length: 13 }, (_, i) => ({ id: `${i}`, label: null })))).toThrow(
      RangeError,
    );
  });
});
