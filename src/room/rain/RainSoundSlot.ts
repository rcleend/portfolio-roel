import type { IdleWork } from '../stage/IdleWork';
import type { RoomView } from '../viewState';
import type { RainSound } from './RainSound';

/** Audio is off the entry/room chunks and begins preparing only after the TV has powered on. */
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
    this.cancel = background.add(this.load());
  }

  private *load(): Generator<void> {
    void import('./RainSound')
      .then(({ RainSound }) => {
        if (this.disposed) return;
        try {
          this.sound = new RainSound();
          this.sync();
        } catch (error) {
          console.warn('Rain ambience unavailable:', error);
        }
      })
      .catch(() => {});
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
