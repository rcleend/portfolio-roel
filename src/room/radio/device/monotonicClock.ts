/**
 * The device's one clock, which never runs backwards. Events are stamped with performance.now() as they arrive, but a
 * frame's requestAnimationFrame timestamp is the frame's start, which can be earlier than an event handled just before
 * it. Drawn at that time, the storyboard would show the moment before the event under the plan made after it: the shelf
 * gone for a frame at a leave, the new disc seated for a frame at a swap. Every time the device acts or draws at goes
 * through `at`, so a frame never draws earlier than an event the device has already handled.
 */
export class MonotonicClock {
  #latest = Number.NEGATIVE_INFINITY;

  /** `time`, or the latest time seen if that is later. */
  at(time: number): number {
    this.#latest = Math.max(this.#latest, time);
    return this.#latest;
  }
}
