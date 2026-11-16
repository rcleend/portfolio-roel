/**
 * A background job in units: every `yield` ends one unit of work, small enough that running it
 * between two frames goes unnoticed. Yielding `QUIET` keeps the next unit for a quiet moment.
 */
export type IdleTask = Generator<IdleUnit, void, void>;

/** What a task yields: nothing (its next unit may go between a playing game's frames) or `QUIET`. */
export type IdleUnit = void | typeof QUIET;

/**
 * The next unit waits until nothing plays: an upload to the GPU, whose cost the main thread cannot
 * time (a weak or software GPU can take a whole frame to mipmap one texture), or work that is only
 * needed where nothing plays anyway.
 */
export const QUIET = 'quiet';

/**
 * What the screen is doing, as far as work ahead of need goes:
 * - `moving`: the camera flies or the TV turns on or off. Nothing runs but urgent work
 *   (`IdleTaskOptions`): a unit invisible on a still frame is a dropped frame in motion.
 * - `playing`: the game runs on the TV, the visitor uses the computer's live screen, or the radio's
 *   discs float. A CPU unit (or a small upload, `IdleTaskOptions.smallUploads`) runs only when the
 *   idle period left can hold it, judged by how long its task's previous unit took (a task's units
 *   are alike) or, for a task's first, its own estimate or else the longest unit run so far; so no
 *   frame is late. On a device too slow for that, the work waits for a quiet moment or for the
 *   flight that needs it.
 * - `quiet`: nothing plays (the TV still dark, a paused game, the room view). Any unit runs,
 *   until the idle period is spent and always at least one.
 */
export type IdleMoment = 'moving' | 'playing' | 'quiet';

/** What a unit may know about the idle period it runs in (the browser's `IdleDeadline`). */
export interface IdleBudget {
  timeRemaining(): number;
}

export interface IdleScheduler {
  /** Calls `run` once the page is idle, or as an ordinary task once `timeoutMs` has passed without an idle period. */
  request(run: (budget: IdleBudget) => void, timeoutMs: number): number;
  cancel(handle: number): void;
}

/** Longest a queued unit waits for an idle moment on a main thread that is never idle. */
const IDLE_TIMEOUT_MS = 1000;
/** How long a sliced task (`IdleTaskOptions.sliceMs`) waits for an idle period in motion: a 60 Hz frame. */
const SLICE_WAIT_MS = 16;
/** Without `requestIdleCallback` (Safari): the rest of a 60 Hz frame, after the frame. */
const FALLBACK_FRAME_MS = 16;
/** How soon to look again while the camera flies, or while only units kept for a quiet moment wait. */
const RETRY_MS = 250;
/** What a unit is assumed to cost before one has been timed: none starts in a sliver of idle time. */
const FIRST_UNIT_ESTIMATE_MS = 4;
/**
 * A sliced task's units are judged by the median of this many of its last of the same kind (CPU work or uploads), and
 * not before this many have been timed: one long one (a GC pause, the first copy out of a fresh bitmap) is not its
 * cost, and a set-up unit is not what its uploads cost.
 */
const SLICE_SAMPLE = 3;

const browserScheduler: IdleScheduler = {
  request(run, timeoutMs) {
    if (typeof window.requestIdleCallback === 'function')
      return window.requestIdleCallback(run, { timeout: timeoutMs });
    // A task queued from a frame callback runs once that frame is done: the rest of it is idle (and there is one each
    // frame, so no timeout is needed).
    return window.requestAnimationFrame((frame) =>
      setTimeout(() => run({ timeRemaining: () => FALLBACK_FRAME_MS - (performance.now() - frame) })),
    );
  },
  cancel(handle) {
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle);
    else window.cancelAnimationFrame(handle);
  },
};

export interface IdleTaskOptions {
  /**
   * While this says so the task may also run while something moves, as it may while something plays (only units
   * that fit the idle period), and its units kept for a quiet moment are not kept: work a flight or a visit is
   * waiting for, such as the radio's device and its discs' prints on the way to the radio and there, small
   * uploads that then go between the frames of the flight or of the discs' float rather than after them.
   */
  readonly urgent?: () => boolean;
  /**
   * While it is urgent and something plays (never while something moves), a unit that has waited this long (ms) for
   * an idle period that can hold it runs in the next one with a little time left, one such unit per idle period: work
   * the visitor is waiting on (the radio's prints, at the radio) is worth one late frame of an ambient animation, and
   * judged by the longest unit run so far it could otherwise wait for the animation to rest.
   */
  readonly patienceMs?: number;
  /**
   * While it is urgent and something moves, a frame that leaves no idle period, or one too short for this task's unit,
   * still gives the task one unit right after it, if its units take at most this long (ms; its first is taken at its
   * word): a slow CPU drawing a large canvas spends whole frames on the flight, the browser grants no idle period or
   * slivers of one, and work the flight itself is waiting for (the posters, before the first piece enters its frame)
   * would otherwise land after it. One such unit per frame keeps the frame inside a 60 Hz budget when the flight's
   * frame and the unit together fit one. Such a task also cuts short a wait the queue is already in (a request with
   * the long timeout, or a look again later) when it is added.
   */
  readonly sliceMs?: number;
  /**
   * What this task's next unit is expected to cost (ms) until one has been timed. Without it an untimed unit is judged
   * by the longest unit any task has run so far, so a sub-millisecond unit queued behind heavier work (the posters'
   * first steps at a TV whose game leaves a slow CPU short idle periods) waits for the game to rest.
   */
  readonly estimateMs?: number;
  /**
   * Its uploads (`QUIET`) are small enough to go between a playing game's frames: while something plays they are not
   * kept for a quiet moment but run like CPU units, when the idle period left can hold the task's previous unit, and
   * each with an idle period to itself, as an upload has in motion, so no frame's GPU work carries more than one. The
   * posters' 1 MB strips go up at the TV this way, so the first flight has nothing left to upload.
   */
  readonly smallUploads?: boolean;
  /**
   * Its units are unlike any other task's (the room's bake: a burst of WebGL calls, queued a unit at a time): how long
   * they take says nothing about what another task's untimed unit will, so they do not count as the longest unit run
   * so far, by which those are judged.
   */
  readonly apart?: boolean;
}

interface Queued {
  readonly task: IdleTask;
  readonly urgent: (() => boolean) | undefined;
  readonly patienceMs: number | undefined;
  readonly estimateMs: number | undefined;
  readonly sliceMs: number | undefined;
  readonly smallUploads: boolean;
  /** Since when its next unit has waited (queued, or its last unit ran). */
  since: number;
  /** The task's next unit waits for a quiet moment. */
  quiet: boolean;
  /** How long the task's last CPU unit took, in ms; null before its first. */
  lastUnit: number | null;
  /** Its last SLICE_SAMPLE timed units of each kind, in ms, oldest first: CPU work, and uploads (`QUIET`). */
  readonly recent: { readonly cpu: number[]; readonly upload: number[] };
  /** Its units do not count as the longest unit run so far (IdleTaskOptions.apart). */
  readonly apart: boolean;
  /** Its unit is running now. */
  running: boolean;
  /** Dropped while its unit ran: it is ended once that unit returns. */
  dropped: boolean;
}

/**
 * Work the room does ahead of need (cutting large meshes for picking, painting the monitor's
 * still, uploading textures before the flights that draw them) on idle time, never on a frame in
 * motion and never making a frame late while something plays (see `IdleMoment`).
 *
 * Tasks run first queued, first served, from `start()` on, except that urgent work goes ahead of the
 * rest: a task the visitor waits on never waits behind one nobody does (the room's own uploads, which
 * may not fit between the radio's frames for as long as its discs float). While something plays, the
 * tasks whose next unit waits for a quiet moment (and is not a small upload) step aside for the ones
 * behind them, and so does a
 * task whose next unit does not fit the idle period left for one behind it whose unit does: a slow
 * CPU's ten-millisecond unit at the head of the queue never holds a one-millisecond unit behind it
 * for as long as the game plays.
 */
export class IdleWork {
  private readonly queue: Queued[] = [];
  private handle: number | null = null;
  /** The pending request's timeout. */
  private handleTimeout = IDLE_TIMEOUT_MS;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;
  /** The longest CPU unit timed so far, in ms: a measure of this device's speed. */
  private longestUnit = FIRST_UNIT_ESTIMATE_MS;

  constructor(
    /** What the screen is doing now. */
    readonly moment: () => IdleMoment,
    private readonly scheduler: IdleScheduler = browserScheduler,
  ) {}

  /** True while queued work is left. */
  get pending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Queues `task`; the returned function drops it, finished or not, and ends it: a task that has started runs its
   * `finally` blocks, one that has not never runs at all (a generator's `return()` before its first `next()`), so
   * whatever its `finally` would release is the dropper's to release.
   */
  add(task: IdleTask, options: IdleTaskOptions = {}): () => void {
    if (this.disposed) return () => {};
    const queued: Queued = {
      task,
      urgent: options.urgent,
      patienceMs: options.patienceMs,
      estimateMs: options.estimateMs,
      sliceMs: options.sliceMs,
      smallUploads: options.smallUploads === true,
      apart: options.apart === true,
      since: performance.now(),
      quiet: false,
      lastUnit: null,
      recent: { cpu: [], upload: [] },
      running: false,
      dropped: false,
    };
    this.queue.push(queued);
    // A look again later was for the tasks queued then (all kept for a quiet moment, or the camera flying): this one
    // may run in the next idle period, and a task queued a unit at a time (the room's bake) would otherwise wait out
    // that timer before each of its units.
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    this.hurry();
    return () => this.drop(queued);
  }

  /**
   * Looks at the queue again now that a queued task's `urgent` may have turned true (the caller changed what it
   * reads): a sliced task that is urgent now does not wait out a request made with the long timeout, nor a look again
   * later. `add` does this for the task it queues.
   */
  hurry(): void {
    if (this.timeout() === SLICE_WAIT_MS) {
      if (this.handle !== null && this.handleTimeout > SLICE_WAIT_MS) {
        this.scheduler.cancel(this.handle);
        this.handle = null;
      }
      if (this.retry !== null) {
        clearTimeout(this.retry);
        this.retry = null;
      }
    }
    this.schedule();
  }

  /** Lets the queue run; until then tasks only collect (the room's first frame comes first). */
  start(): void {
    this.started = true;
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    if (this.retry !== null) clearTimeout(this.retry);
    this.handle = null;
    this.retry = null;
  }

  private schedule(later = false): void {
    if (!this.started || this.disposed || this.queue.length === 0) return;
    if (this.handle !== null || this.retry !== null) return;
    if (!later) {
      this.handleTimeout = this.timeout();
      this.handle = this.scheduler.request(this.run, this.handleTimeout);
      return;
    }
    this.retry = setTimeout(() => {
      this.retry = null;
      this.schedule();
    }, RETRY_MS);
  }

  private readonly run = (budget: IdleBudget): void => {
    this.handle = null;
    let ran = false;
    let ranPatient = false;
    // Nothing for this moment, as opposed to nothing that fits this idle period: look again later.
    let later = false;
    try {
      for (;;) {
        const moment = this.moment();
        // In motion only urgent work runs, and only as it may while something plays.
        const moving = moment === 'moving';
        const playing = moment !== 'quiet';
        const left = budget.timeRemaining();
        const next = this.next(moving, playing, left);
        if (!next) {
          later = this.queue.length > 0;
          break;
        }
        // A unit kept for a quiet moment is an upload whose cost lands on the GPU, after the main thread has timed it:
        // in motion, and for small uploads while something plays, one such unit has an idle period to itself, so a
        // fast CPU does not put a whole texture on one frame's GPU work.
        const upload = next.quiet && (moving || (playing && next.smallUploads));
        if (upload && ran) break;
        if (playing ? left < this.expected(next) : ran && left <= 0) {
          if (moving) {
            if (ran || !fitsSlice(next)) break;
          } else {
            if (ranPatient || !this.outOfPatience(next) || left < FIRST_UNIT_ESTIMATE_MS) break;
            ranPatient = true;
          }
        }
        this.step(next, playing);
        ran = true;
        if (upload) break;
      }
    } finally {
      this.schedule(later);
    }
  };

  /** A sliced task's request waits one frame for an idle period; every other request waits up to a second. */
  private timeout(): number {
    const sliced = this.queue.some((queued) => queued.sliceMs !== undefined && queued.urgent?.() === true);
    return sliced ? SLICE_WAIT_MS : IDLE_TIMEOUT_MS;
  }

  /**
   * The first task whose next unit may run in this moment, urgent ones first: while something plays or moves, a unit
   * kept for a quiet moment waits unless its task is urgent (or, while something plays, its uploads are small), and in
   * motion only urgent work runs. Behind no urgent work
   * while something plays, the first whose unit fits the `left` ms of idle time goes, else the first that may run.
   */
  private next(moving: boolean, playing: boolean, left: number): Queued | undefined {
    const urgent = this.queue.find((queued) => queued.urgent?.() === true);
    if (urgent || moving) return urgent;
    let first: Queued | undefined;
    for (const queued of this.queue) {
      if (playing && queued.quiet && !queued.smallUploads) continue;
      if (!playing || left >= this.expected(queued)) return queued;
      first ??= queued;
    }
    return first;
  }

  /** What `queued`'s next unit is expected to cost: its previous one, else its own estimate, else the longest so far. */
  private expected(queued: Queued): number {
    return queued.lastUnit ?? queued.estimateMs ?? this.longestUnit;
  }

  private outOfPatience(queued: Queued): boolean {
    const { patienceMs } = queued;
    return patienceMs !== undefined && queued.urgent?.() === true && performance.now() - queued.since >= patienceMs;
  }

  /** Runs `queued`'s next unit and times it. */
  private step(queued: Queued, playing: boolean): void {
    // Only units that may run while something plays need timing: their cost is what must fit.
    const timed = !queued.quiet || playing;
    const sample = queued.quiet ? queued.recent.upload : queued.recent.cpu;
    const start = performance.now();
    let done = true;
    queued.running = true;
    try {
      const result = queued.task.next();
      done = result.done === true;
      queued.quiet = result.value === QUIET;
    } finally {
      queued.running = false;
      // A task that throws is finished too: it must not block the ones behind it.
      if (done) this.remove(queued);
      else if (queued.dropped) queued.task.return();
      if (timed) {
        queued.lastUnit = performance.now() - start;
        if (!queued.apart) this.longestUnit = Math.max(this.longestUnit, queued.lastUnit);
        sample.push(queued.lastUnit);
        if (sample.length > SLICE_SAMPLE) sample.shift();
      }
      queued.since = performance.now();
    }
  }

  /** Takes `queued` off the queue and ends its task, at once or, from inside its own unit, once that unit returns. */
  private drop(queued: Queued): void {
    this.remove(queued);
    if (queued.running) queued.dropped = true;
    else queued.task.return();
  }

  private remove(queued: Queued): void {
    const at = this.queue.indexOf(queued);
    if (at >= 0) this.queue.splice(at, 1);
  }
}

/**
 * A sliced task's next unit may follow a frame that left no idle period (see `IdleTaskOptions.sliceMs`) while its
 * units of that kind typically fit the slice: the median of its last SLICE_SAMPLE, and until that many have been
 * timed they are taken at their word, since one sample cannot tell a one-off from the rule (a slow phone's first copy
 * out of a fresh bitmap measured 7.6-20.9 ms at 6x CPU, the strips after it 0.3-5 ms). The posters' upload sets up its
 * storage in one CPU unit that a slow CPU may take longer than a slice over, then copies strips that fit one: the
 * strips are judged by the strips.
 */
function fitsSlice(queued: Queued): boolean {
  if (queued.sliceMs === undefined) return false;
  const sample = queued.quiet ? queued.recent.upload : queued.recent.cpu;
  if (sample.length < SLICE_SAMPLE) return true;
  const sorted = [...sample].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] ?? 0) <= queued.sliceMs;
}
