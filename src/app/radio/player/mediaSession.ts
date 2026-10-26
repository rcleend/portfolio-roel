import type { Transport } from '../deck';
import type { MediaAction } from './playerState';

/**
 * The OS's media controls (SPEC §8.10): lock screen, notification, hardware media keys.
 * While a disc is loaded the session names what is playing and routes the controls to
 * the player; with no disc it says nothing. A browser without the API gets nothing.
 */

/** The parts of `navigator.mediaSession` the radio uses. */
export interface MediaSessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
  setPositionState?(state?: MediaPositionState): void;
}

export interface NowPlaying {
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  /** Absolute URL of the 512² cover. */
  readonly artwork: string;
  readonly transport: Transport;
  /** Seconds; non-finite while unknown. */
  readonly duration: number;
  readonly position: number;
}

export const MEDIA_ACTIONS: readonly MediaAction[] = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack'];

export type MetadataFactory = (init: MediaMetadataInit) => MediaMetadata;

export class MediaSessionBridge {
  readonly #session: MediaSessionLike | null;
  readonly #metadata: MetadataFactory;
  #metadataKey = '';
  #bound = false;
  #onAction: ((action: MediaAction) => void) | null = null;

  constructor(session: MediaSessionLike | null, metadata: MetadataFactory) {
    this.#session = session;
    this.#metadata = metadata;
  }

  /** The browser's session, or a bridge that does nothing where the API is missing. */
  static forPage(): MediaSessionBridge {
    const session = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
    const factory: MetadataFactory = (init) => new MediaMetadata(init);
    return new MediaSessionBridge(typeof MediaMetadata === 'function' ? session : null, factory);
  }

  /** Who receives the controls (the player); set once. */
  onAction(listener: (action: MediaAction) => void): void {
    this.#onAction = listener;
  }

  /** Brings the session up to date; cheap to call on every change (metadata is rebuilt only when it differs). */
  update(now: NowPlaying | null): void {
    const session = this.#session;
    if (!session) return;
    if (!now) {
      this.clear();
      return;
    }
    const key = `${now.title}\u0000${now.artist}\u0000${now.album}\u0000${now.artwork}`;
    if (key !== this.#metadataKey) {
      this.#metadataKey = key;
      session.metadata = this.#metadata({
        title: now.title,
        artist: now.artist,
        album: now.album,
        artwork: [{ src: now.artwork, sizes: '512x512', type: imageType(now.artwork) }],
      });
    }
    session.playbackState = now.transport === 'playing' ? 'playing' : 'paused';
    this.#bind();
    if (Number.isFinite(now.duration) && now.duration > 0) {
      const position = Math.min(Math.max(0, now.position), now.duration);
      try {
        session.setPositionState?.({ duration: now.duration, position, playbackRate: 1 });
      } catch {
        // An older implementation's stricter checks: the controls work without a position.
      }
    }
  }

  /** No disc: no metadata, no handlers, nothing for the OS to show. */
  clear(): void {
    const session = this.#session;
    if (!session || (!this.#bound && this.#metadataKey === '')) return;
    session.metadata = null;
    session.playbackState = 'none';
    try {
      session.setPositionState?.();
    } catch {
      // Nothing to reset.
    }
    for (const action of MEDIA_ACTIONS) setHandler(session, action, null);
    this.#metadataKey = '';
    this.#bound = false;
  }

  #bind(): void {
    const session = this.#session;
    if (!session || this.#bound) return;
    this.#bound = true;
    for (const action of MEDIA_ACTIONS) setHandler(session, action, () => this.#onAction?.(action));
  }
}

/** Some browsers throw for actions they do not support (older Safari and `stop`). */
function setHandler(session: MediaSessionLike, action: MediaAction, handler: MediaSessionActionHandler | null): void {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // Unsupported here: the other controls still work.
  }
}

function imageType(url: string): string {
  const extension = url.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return 'image/webp';
}
