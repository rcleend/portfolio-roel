import type { ScenePreview } from '@/game/preview';
import { PreviewClock, type Speed } from '../transport/PreviewClock';

/** A preview on the page, as the loop drives it. */
export interface LivePreview {
  /** Takes the preview off the page: the loop stops driving it. */
  remove(): void;
}

/** Where a preview sits: board tiles are covered while focus mode is open; the focused view never is. */
export type PreviewLayer = 'board' | 'focus';

interface Entry {
  readonly preview: ScenePreview;
  readonly layer: PreviewLayer;
  readonly onFailure: (error: unknown) => void;
  inView: boolean;
  /** Its canvas no longer shows its frame. */
  stale: boolean;
}

/**
 * Drives every preview on the page from one clock and one animation-frame
 * loop, so all of them show the same frame. Previews out of view keep
 * stepping, so they never fall out of step, but only those on screen are
 * drawn. A preview that throws (a variant with a bug, say) is dropped and
 * reported, and the rest play on.
 */
export class PreviewLoop {
  readonly clock = new PreviewClock();
  readonly #entries = new Map<Element, Entry>();
  readonly #observer: IntersectionObserver;
  #covered = false;
  #handle: number | null = null;
  #lastTime: number | null = null;

  constructor() {
    this.#observer = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = this.#entries.get(record.target);
        if (!entry) continue;
        entry.inView = record.isIntersecting;
        entry.stale ||= entry.inView;
      }
    });
  }

  /** Shows `preview` in `element`, moved to the clock's frame, until removed. */
  add(preview: ScenePreview, element: Element, layer: PreviewLayer, onFailure: (error: unknown) => void): LivePreview {
    const entry: Entry = { preview, layer, onFailure, inView: false, stale: true };
    this.#entries.set(element, entry);
    this.#observer.observe(element);
    this.#run(element, entry, () => preview.seek(this.clock.state.frame));
    return {
      remove: () => {
        if (this.#entries.get(element) !== entry) return;
        this.#observer.unobserve(element);
        this.#entries.delete(element);
      },
    };
  }

  /** Board tiles stop drawing while focus mode covers them, and catch up the moment it closes. */
  setCovered(covered: boolean): void {
    this.#covered = covered;
    if (!covered) for (const entry of this.#entries.values()) entry.stale = true;
  }

  start(): void {
    if (this.#handle !== null) return;
    this.#lastTime = null;
    this.#handle = requestAnimationFrame(this.#tick);
  }

  stop(): void {
    if (this.#handle !== null) cancelAnimationFrame(this.#handle);
    this.#handle = null;
  }

  /** Every preview back to its opening frame, playing, as if just entered. */
  replay(): void {
    this.clock.replay();
    this.#forEach((preview) => preview.restart());
  }

  togglePlay(): void {
    this.clock.toggle();
  }

  setSpeed(speed: Speed): void {
    this.clock.setSpeed(speed);
  }

  /** Pauses every preview on exactly `frame`, to look at it. */
  seek(frame: number): void {
    this.clock.pause();
    this.clock.seek(frame);
    this.#forEach((preview) => preview.seek(this.clock.state.frame));
  }

  /** Pauses and moves every preview `delta` frames. */
  step(delta: number): void {
    this.clock.step(delta);
    this.#forEach((preview) => preview.seek(this.clock.state.frame));
  }

  readonly #tick = (time: number): void => {
    this.#handle = requestAnimationFrame(this.#tick);
    const elapsed = this.#lastTime === null ? 0 : time - this.#lastTime;
    this.#lastTime = time;
    const moved = this.clock.tick(elapsed) > 0;
    const frame = this.clock.state.frame;
    for (const [element, entry] of this.#entries) {
      if (moved) {
        if (!this.#run(element, entry, () => entry.preview.advanceTo(frame))) continue;
        entry.stale = true;
      }
      if (entry.stale && this.#showing(entry) && this.#run(element, entry, () => entry.preview.render())) {
        entry.stale = false;
      }
    }
  };

  #showing(entry: Entry): boolean {
    return entry.inView && !(this.#covered && entry.layer === 'board');
  }

  #forEach(change: (preview: ScenePreview) => void): void {
    for (const [element, entry] of this.#entries) {
      this.#run(element, entry, () => change(entry.preview));
      entry.stale = true;
    }
  }

  /** Runs `work` on one preview; if it throws, that preview leaves the loop and its owner hears why. */
  #run(element: Element, entry: Entry, work: () => void): boolean {
    try {
      work();
      return true;
    } catch (error) {
      this.#observer.unobserve(element);
      this.#entries.delete(element);
      entry.onFailure(error);
      return false;
    }
  }
}
