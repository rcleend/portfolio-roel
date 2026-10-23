import { EdgeTracker } from './EdgeTracker';

/**
 * Programmatic buttons: the touch pad overlay presses actions through this,
 * and so does the development harness (`__arcade.press`).
 */
export class VirtualButtons<A extends string> {
  readonly tracker = new EdgeTracker<A>();

  press(action: A): void {
    this.tracker.press(action);
  }

  release(action: A): void {
    this.tracker.release(action);
  }

  releaseAll(): void {
    this.tracker.releaseAll();
  }
}
