import type { IdleWork } from '../stage/IdleWork';
import type { RoomView } from '../viewState';
import type { RainSound } from './RainSound';

/**
 * Audio is off the entry/room chunks and begins preparing only after the TV has powered on. The sound is made in a
 * unit of the room's idle work, not as its code arrives: making it makes the page's first audio context, which holds
 * Chromium's main thread for a tenth of a second (118 ms measured on an Apple M4; 3 ms in WebKit), and idle work
 * never runs while the camera flies (docs/ROOM.md › Flights). Arriving as it came, it stood in the first flight of a
 * visitor who left the TV as the code came in.
 */
export class RainSoundSlot {
  private sound: RainSound | null = null;
  private view: RoomView = 'tv';
  private muted = true;
  private started = false;
  private disposed = false;
  private cancel: (() => void) | null = null;

  prepare(background: IdleWork): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.cancel = background.add(this.load(background));
  }

  private *load(background: IdleWork): Generator<void> {
    void import('./RainSound')
      .then(({ RainSound }) => {
        // `apart`: the tenth of a second it takes says nothing about what any other task's unit will.
        if (!this.disposed) this.cancel = background.add(this.make(RainSound), { apart: true });
      })
      .catch(() => {});
  }

  // biome-ignore lint/correctness/useYield: a single unit: the whole body is the unit's work.
  private *make(Sound: typeof RainSound): Generator<void> {
    try {
      this.sound = new Sound();
      this.sync();
    } catch (error) {
      console.warn('Rain ambience unavailable:', error);
    }
  }

  setView(view: RoomView): void {
    this.view = view;
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.sync();
  }

  private sync(): void {
    this.sound?.setActive(this.view !== 'tv' && !this.muted);
  }

  get ready(): boolean {
    return this.sound?.ready ?? false;
  }
  get playing(): boolean {
    return this.sound?.playing ?? false;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel?.();
    this.sound?.dispose();
  }
}
