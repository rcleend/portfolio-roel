import { describe, expect, it, vi } from 'vitest';
import { MEDIA_ACTIONS, MediaSessionBridge, type MediaSessionLike, type NowPlaying } from './mediaSession';

function fakeSession(options: { readonly rejectStop?: boolean } = {}) {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const positions: (MediaPositionState | undefined)[] = [];
  const session: MediaSessionLike = {
    metadata: null,
    playbackState: 'none',
    setActionHandler(action, handler) {
      if (options.rejectStop && action === 'stop') throw new TypeError('not supported');
      handlers.set(action, handler);
    },
    setPositionState(state) {
      positions.push(state);
    },
  };
  return { session, handlers, positions };
}

const metadata = (init: MediaMetadataInit): MediaMetadata => ({ ...init }) as unknown as MediaMetadata;
const NOW: NowPlaying = {
  title: 'Kettle On',
  artist: 'Studio Attic',
  album: 'Night Shift',
  artwork: 'https://roel.dev/assets/cover-abc.webp',
  transport: 'playing',
  duration: 51.9,
  position: 3.2,
};

describe('MediaSessionBridge', () => {
  it('names what is playing, with the cover as artwork, and reports the position', () => {
    const { session, positions } = fakeSession();
    new MediaSessionBridge(session, metadata).update(NOW);
    expect(session.metadata).toEqual({
      title: 'Kettle On',
      artist: 'Studio Attic',
      album: 'Night Shift',
      artwork: [{ src: 'https://roel.dev/assets/cover-abc.webp', sizes: '512x512', type: 'image/webp' }],
    });
    expect(session.playbackState).toBe('playing');
    expect(positions).toEqual([{ duration: 51.9, position: 3.2, playbackRate: 1 }]);
  });

  it('routes every control to the player while a disc is loaded', () => {
    const { session, handlers } = fakeSession();
    const bridge = new MediaSessionBridge(session, metadata);
    const actions: string[] = [];
    bridge.onAction((action) => actions.push(action));
    bridge.update(NOW);
    for (const action of MEDIA_ACTIONS) handlers.get(action)?.({ action });
    expect(actions).toEqual([...MEDIA_ACTIONS]);
  });

  it('follows the transport and rebuilds the metadata only when it changes', () => {
    const { session } = fakeSession();
    const factory = vi.fn(metadata);
    const bridge = new MediaSessionBridge(session, factory);
    bridge.update(NOW);
    bridge.update({ ...NOW, transport: 'paused', position: 9 });
    expect(session.playbackState).toBe('paused');
    expect(factory).toHaveBeenCalledTimes(1);
    bridge.update({ ...NOW, title: 'Window Seat' });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('never sends a position it cannot know', () => {
    const { session, positions } = fakeSession();
    new MediaSessionBridge(session, metadata).update({ ...NOW, duration: Number.NaN });
    expect(positions).toEqual([]);
    new MediaSessionBridge(session, metadata).update({ ...NOW, position: 80 });
    expect(positions).toEqual([{ duration: 51.9, position: 51.9, playbackRate: 1 }]);
  });

  it('clears everything when no disc is loaded', () => {
    const { session, handlers } = fakeSession();
    const bridge = new MediaSessionBridge(session, metadata);
    bridge.update(NOW);
    bridge.update(null);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    for (const action of MEDIA_ACTIONS) expect(handlers.get(action)).toBeNull();
  });

  it('survives a browser that refuses an action, and one without the API', () => {
    const { session, handlers } = fakeSession({ rejectStop: true });
    new MediaSessionBridge(session, metadata).update(NOW);
    expect(handlers.has('play')).toBe(true);
    expect(() => new MediaSessionBridge(null, metadata).update(NOW)).not.toThrow();
  });

  it('types the artwork by its extension', () => {
    const { session } = fakeSession();
    new MediaSessionBridge(session, metadata).update({ ...NOW, artwork: 'https://x.test/c.png?v=2' });
    expect((session.metadata as unknown as MediaMetadataInit).artwork?.[0]?.type).toBe('image/png');
  });
});
