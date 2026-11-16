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

/** An event is taken to have happened no longer ago than this (ms): a frame of a 60 Hz display. */
const EVENT_REACH_MS = 1000 / 60;

/**
 * The time an event handled at `now` (performance.now()) is stamped with: that of the last frame drawn (`lastFrame`, a
 * requestAnimationFrame timestamp), or `EVENT_REACH_MS` ago when no frame was drawn that recently. Never `now` itself:
 * the browser hands pointer moves over at the start of a frame, a millisecond or so after the frame's own timestamp,
 * and stamped with that the clock above would hold that frame to the event's time and the next one, with no event
 * before it, to its own. Every frame under a moving pointer was then drawn a little late or on time, and whatever
 * moved under it (a disc turning towards the pointer, the shelf's parallax, a flight) stepped unevenly: by 7–9 % at
 * the median on a 120 Hz display. A frame's time is always later than the frame before it, so an event stamped with
 * that one never holds the next.
 */
export function eventTime(now: number, lastFrame: number): number {
  return Math.min(now, Math.max(lastFrame, now - EVENT_REACH_MS));
}
