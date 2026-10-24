import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Album } from '@/content/radio/types';
import type { RoomView } from '../deck';
import type { FoleyCue } from './foley';
import { MusicElement } from './MusicElement';
import { MediaSessionBridge, type MediaSessionLike } from './mediaSession';
import { type Foley, RadioPlayer } from './RadioPlayer';
import { FakeAudio, FakeFrames, FakeTimers, RecordingDeck } from './testing';

const ALBUMS: readonly Album[] = [
  {
    id: 'night-shift',
    title: 'Night Shift',
    artist: 'Studio Attic',
    cover: 'cover.webp',
    placeholder: true,
    tracks: [
      { title: 'Kettle On', file: '01.m4a', seconds: 52 },
      { title: 'Window Seat', file: '02.m4a', seconds: 46 },
      { title: 'Last Bus', file: '03.m4a', seconds: 40 },
    ],
  },
  {
    id: 'low-tide',
    title: 'Low Tide',
    artist: 'Harbour Lights',
    cover: 'cover.webp',
    gainDb: -6,
    tracks: [{ title: 'Slow Water', file: '01.m4a', seconds: 55 }],
  },
];

class RecordingFoley implements Foley {
  readonly played: FoleyCue[] = [];
  readonly log: string[] = [];
  muted = false;
  prepare(): void {
    this.log.push('prepare');
  }
  wake(): void {
    this.log.push('wake');
  }
  sleepSoon(ms: number): void {
    this.log.push(`sleep ${ms}`);
  }
  play(cue: FoleyCue): void {
    this.played.push(cue);
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
  }
  dispose(): void {
    this.log.push('dispose');
  }
}

function fakeSession() {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const session: MediaSessionLike = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (action, handler) => void handlers.set(action, handler),
    setPositionState: () => undefined,
  };
  return { session, handlers };
}

function setup(
  options: { readonly view?: RoomView; readonly muted?: boolean; readonly writableVolume?: boolean } = {},
) {
  const deck = new RecordingDeck();
  const audio = new FakeAudio({ writableVolume: options.writableVolume ?? true });
  const frames = new FakeFrames();
  const timers = new FakeTimers();
  const foley = new RecordingFoley();
  const { session, handlers } = fakeSession();
  const create = vi.fn(() => audio);
  const idle: (() => void)[] = [];
  const player = new RadioPlayer({
    deck,
    albums: ALBUMS,
    fileUrl: (album, name) => `/albums/${album.id}/${name}`,
    music: (listener) => new MusicElement(listener, create, frames),
    foley,
    session: new MediaSessionBridge(session, (init) => ({ ...init }) as unknown as MediaMetadata),
    view: options.view ?? 'radio',
    muted: options.muted ?? false,
    timers,
    now: () => timers.time,
    whenIdle: (task) => {
      idle.push(task);
      return () => idle.splice(idle.indexOf(task), 1);
    },
  });
  const words: string[] = [];
  player.onAnnounce((text) => words.push(text));
  const disconnect = player.connect();
  /** Time passes for frames and timers alike. */
  const wait = (ms: number): void => {
    frames.tick(ms);
    timers.advance(ms);
  };
  /** The main thread goes idle: what waited for it runs. */
  const goIdle = (): void => {
    for (const task of idle.splice(0)) task();
  };
  return { deck, audio, frames, timers, foley, session, handlers, create, player, words, disconnect, wait, goIdle };
}

/** Picks a disc on the model, seats it and lets it fade in. */
function playDisc(world: ReturnType<typeof setup>, disc = 'night-shift'): void {
  world.deck.intent({ type: 'pick', disc });
  world.deck.seat(disc);
  world.wait(150);
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { href: 'https://roel.dev/' } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a pick', () => {
  it('starts the track silently and answers the room with setState, both inside the gesture', () => {
    const { deck, audio, words } = setup();
    deck.intent({ type: 'pick', disc: 'night-shift' });
    expect(audio.log).toEqual(['play /albums/night-shift/01.m4a']);
    expect(audio.volume).toBe(0);
    expect(deck.log.slice(-2)).toEqual(['intent pick', 'setState night-shift playing reading']);
    expect(words).toEqual(['Playing Kettle On, track 1 of 3, from Night Shift by Studio Attic.']);
  });

  it('opens the sound on the seat: rewound, fading in to full at the radio', () => {
    const world = setup();
    world.deck.intent({ type: 'pick', disc: 'night-shift' });
    world.audio.currentTime = 0.9;
    world.deck.seat('night-shift');
    expect(world.audio.currentTime).toBe(0);
    world.wait(150);
    expect(world.audio.volume).toBe(1);
    world.audio.advanceTo(0.3);
    expect(world.deck.state?.lcd).toEqual({ kind: 'track', track: 1, seconds: 0, transport: 'playing' });
  });

  it('plays an album at its own gain', () => {
    const world = setup();
    playDisc(world, 'low-tide');
    expect(world.audio.volume).toBeCloseTo(0.501, 3);
  });

  it('a CD’s button picks like the model, and wakes the foley inside the gesture', () => {
    const { player, audio, foley } = setup({ view: 'room' });
    player.pick('night-shift');
    expect(audio.log).toEqual(['play /albums/night-shift/01.m4a']);
    expect(foley.log).toContain('wake');
  });

  it('says the sound is off when the site is muted', () => {
    const { deck, words, audio } = setup({ muted: true });
    deck.intent({ type: 'pick', disc: 'night-shift' });
    deck.seat('night-shift');
    expect(audio.muted).toBe(true);
    expect(words[0]).toMatch(/Sound is off\.$/);
  });
});

describe('a swap', () => {
  it('fades the playing disc out before the source changes, then starts the new one silently', () => {
    const world = setup();
    playDisc(world);
    world.deck.intent({ type: 'pick', disc: 'low-tide' });
    expect(world.deck.state).toMatchObject({ loaded: 'low-tide', transport: 'playing' });
    world.wait(120);
    expect(world.audio.src).toBe('/albums/night-shift/01.m4a');
    world.wait(150);
    expect(world.audio.src).toBe('/albums/low-tide/01.m4a');
    expect(world.audio.volume).toBe(0);
    world.deck.seat('low-tide');
    world.wait(150);
    expect(world.audio.volume).toBeCloseTo(0.501, 3);
  });

  it('the latest pick wins: a disc picked mid-fade replaces it at once', () => {
    const world = setup();
    playDisc(world);
    world.deck.intent({ type: 'pick', disc: 'low-tide' });
    world.wait(50);
    world.deck.intent({ type: 'pick', disc: 'night-shift' });
    world.wait(400);
    expect(world.audio.src).toBe('/albums/night-shift/01.m4a');
    expect(world.audio.log.filter((entry) => entry.startsWith('play'))).toEqual([
      'play /albums/night-shift/01.m4a',
      'play /albums/night-shift/01.m4a',
    ]);
  });
});

describe('the keys', () => {
  it('a DOM key presses the 3D key, then answers with setState; a model key only answers', () => {
    const world = setup();
    playDisc(world);
    world.player.press('play-pause');
    expect(world.deck.log.slice(-2)).toEqual(['press play-pause', 'setState night-shift paused track']);
    world.deck.intent({ type: 'press', key: 'play-pause' });
    expect(world.deck.presses).toEqual(['play-pause']);
    expect(world.deck.state?.transport).toBe('playing');
  });

  it('pause fades out and pauses; play is sound first; the words follow', () => {
    const world = setup();
    playDisc(world);
    world.audio.advanceTo(12.4);
    world.player.press('play-pause');
    world.wait(130);
    expect(world.audio.paused).toBe(true);
    world.player.press('play-pause');
    expect(world.audio.paused).toBe(false);
    expect(world.audio.currentTime).toBe(12.4);
    expect(world.words.slice(1)).toEqual(['Paused.', 'Playing.']);
  });

  it('stop goes back to track 1 and shows the disc’s totals', () => {
    const world = setup();
    playDisc(world);
    world.player.press('next');
    world.wait(300);
    world.player.press('stop');
    world.wait(130);
    expect(world.audio.paused).toBe(true);
    expect(world.deck.state?.lcd).toEqual({ kind: 'total', tracks: 3, seconds: 138 });
    world.player.press('play-pause');
    expect(world.audio.src).toBe('/albums/night-shift/01.m4a');
    expect(world.audio.currentTime).toBe(0);
  });

  it('three quick skips fetch only the last track, 250 ms after the last press, with a seek tick', () => {
    const world = setup();
    playDisc(world);
    world.player.press('next');
    world.wait(100);
    world.player.press('next');
    expect(world.deck.state?.lcd).toMatchObject({ kind: 'track', track: 3, seconds: 0 });
    expect(world.audio.paused).toBe(true);
    world.wait(240);
    expect(world.audio.src).toBe('/albums/night-shift/01.m4a');
    world.wait(20);
    expect(world.audio.src).toBe('/albums/night-shift/03.m4a');
    expect(world.foley.played).toEqual(['seek']);
  });

  it('a stale tick of the old track never shows under the new number', () => {
    const world = setup();
    playDisc(world);
    world.audio.advanceTo(30);
    world.player.press('next');
    world.audio.advanceTo(30.2);
    expect(world.deck.state?.lcd).toMatchObject({ track: 2, seconds: 0 });
  });

  it('keys on an empty player ask for a CD', () => {
    const world = setup();
    world.player.press('next');
    expect(world.deck.presses).toEqual(['next']);
    expect(world.words).toEqual(['Choose a CD first.']);
  });
});

describe('the end of a track and of the disc', () => {
  it('plays on into the next track, then stops after the last', () => {
    const world = setup();
    playDisc(world);
    world.audio.emit('ended');
    expect(world.audio.src).toBe('/albums/night-shift/02.m4a');
    expect(world.foley.played).toEqual(['seek']);
    world.player.press('next');
    world.wait(300);
    world.audio.ended = true;
    world.audio.emit('ended');
    expect(world.deck.state).toMatchObject({ transport: 'stopped', lcd: { kind: 'total' } });
    expect(world.words.at(-1)).toBe('End of the CD.');
  });
});

describe('errors and refusals', () => {
  it('a track that fails shows the error, says so and moves on after two seconds', () => {
    const world = setup();
    playDisc(world);
    world.audio.emit('error');
    expect(world.deck.state?.lcd).toEqual({ kind: 'error' });
    expect(world.words.at(-1)).toBe('This track could not be played.');
    world.wait(1990);
    expect(world.audio.src).toBe('/albums/night-shift/01.m4a');
    world.wait(20);
    expect(world.audio.src).toBe('/albums/night-shift/02.m4a');
  });

  it('a refused play pauses and asks for a press, which plays', async () => {
    const world = setup();
    world.audio.refuse = 'NotAllowedError';
    world.deck.intent({ type: 'pick', disc: 'night-shift' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(world.deck.state).toMatchObject({ transport: 'paused' });
    expect(world.words.at(-1)).toBe('Press play to start the music.');
    world.deck.seat('night-shift');
    world.player.press('play-pause');
    expect(world.audio.paused).toBe(false);
    expect(world.audio.currentTime).toBe(0);
  });
});

describe('the camera', () => {
  it('softens the radio in the room and at the computer', () => {
    const world = setup();
    playDisc(world);
    world.player.setView('room');
    world.wait(320);
    expect(world.audio.volume).toBeCloseTo(0.79, 5);
    world.player.setView('pc');
    world.wait(320);
    expect(world.audio.volume).toBeCloseTo(0.56, 5);
  });

  it('yields to the game at the TV and comes back after, unless the visitor paused it', () => {
    const world = setup();
    playDisc(world);
    world.player.setView('room');
    world.player.setView('tv');
    world.wait(360);
    expect(world.audio.paused).toBe(true);
    world.player.setView('room');
    expect(world.audio.paused).toBe(false);
    world.wait(520);
    expect(world.audio.volume).toBeCloseTo(0.79, 5);
    world.player.press('play-pause');
    world.player.setView('tv');
    world.player.setView('room');
    expect(world.deck.state?.transport).toBe('paused');
  });

  it('keeps the display lit away from the radio only while a disc plays or is paused', () => {
    const world = setup();
    world.player.setView('room');
    expect(world.deck.state?.lcd).toEqual({ kind: 'off' });
    world.player.setView('radio');
    expect(world.deck.state?.lcd).toEqual({ kind: 'no-disc' });
  });

  it('makes the foley in an idle moment of its own, wakes it at the radio and lets it sleep after leaving', () => {
    const world = setup({ view: 'room' });
    // Not in the player's own start: the AudioContext is its dearest part.
    expect(world.foley.log).toEqual([]);
    world.goIdle();
    expect(world.foley.log).toEqual(['prepare']);
    world.player.setView('radio');
    world.player.setView('room');
    expect(world.foley.log).toEqual(['prepare', 'wake', 'sleep 2000']);
  });

  it('plays the room’s cues as foley', () => {
    const world = setup();
    world.deck.cue({ cue: 'lid-unlatch', pan: -0.2 });
    expect(world.foley.played).toEqual(['lid-unlatch']);
  });
});

describe('the media session', () => {
  it('names the track with the cover, and routes the OS’s controls to the player', () => {
    const world = setup();
    playDisc(world);
    expect(world.session.metadata).toMatchObject({
      title: 'Kettle On',
      artist: 'Studio Attic',
      album: 'Night Shift',
      artwork: [{ src: 'https://roel.dev/albums/night-shift/cover.webp', sizes: '512x512' }],
    });
    world.deck.live = true;
    world.handlers.get('pause')?.({ action: 'pause' });
    expect(world.deck.state?.transport).toBe('paused');
    expect(world.deck.presses).toEqual(['play-pause']);
    world.handlers.get('nexttrack')?.({ action: 'nexttrack' });
    expect(world.deck.state?.lcd).toMatchObject({ track: 2 });
  });

  it('at the TV, play only asks to resume on leaving; nothing is pressed out of sight', () => {
    const world = setup();
    playDisc(world);
    world.player.setView('tv');
    world.wait(360);
    world.handlers.get('pause')?.({ action: 'pause' });
    world.handlers.get('play')?.({ action: 'play' });
    expect(world.audio.paused).toBe(true);
    world.player.setView('room');
    expect(world.audio.paused).toBe(false);
    expect(world.deck.presses).toEqual([]);
  });

  it('tells the room and the OS everything again when it reconnects', () => {
    const world = setup();
    playDisc(world);
    world.disconnect();
    const before = world.deck.states.length;
    world.player.connect();
    expect(world.deck.states.length).toBe(before + 1);
    expect(world.session.metadata).toMatchObject({ title: 'Kettle On' });
  });

  it('clears the session when the player goes away', () => {
    const world = setup();
    playDisc(world);
    world.disconnect();
    expect(world.session.metadata).toBeNull();
    expect(world.audio.paused).toBe(true);
    expect(world.foley.log).toContain('dispose');
  });
});

describe('the deck and the controls', () => {
  it('tells the room only what changed: the clock once a second', () => {
    const world = setup();
    playDisc(world);
    const before = world.deck.states.length;
    for (const seconds of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) world.audio.advanceTo(seconds);
    expect(world.deck.states.slice(before).map((state) => state.lcd)).toEqual([
      { kind: 'track', track: 1, seconds: 0, transport: 'playing' },
      { kind: 'track', track: 1, seconds: 1, transport: 'playing' },
      { kind: 'track', track: 1, seconds: 2, transport: 'playing' },
    ]);
  });

  it('renders the controls only when something they show changes', () => {
    const world = setup();
    const renders = vi.fn();
    world.player.subscribe(renders);
    playDisc(world);
    const after = renders.mock.calls.length;
    world.audio.advanceTo(5);
    world.audio.advanceTo(9);
    expect(renders.mock.calls.length).toBe(after);
    expect(world.player.getSnapshot()).toMatchObject({
      disc: 'night-shift',
      trackTitle: 'Kettle On',
      inserting: false,
    });
  });

  it('uses one media element for every disc and track', () => {
    const world = setup();
    playDisc(world);
    world.deck.intent({ type: 'pick', disc: 'low-tide' });
    world.wait(300);
    world.player.press('stop');
    expect(world.create).toHaveBeenCalledTimes(1);
  });
});
