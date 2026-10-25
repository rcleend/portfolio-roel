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
 * - `moving`: the camera flies or the TV turns on or off. Nothing runs: a unit invisible on a
 *   still frame is a dropped frame in motion.
 * - `playing`: the game runs on the TV, the visitor uses the computer's live screen, or the radio's
 *   discs float. A CPU
 *   unit runs only when the idle period left can hold it, judged by how long its task's previous
 *   unit took (a task's units are alike) or, for a task's first, the longest unit run so far; so
 *   no frame is late. On a device too slow for that, the work waits for a quiet moment or for the
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
  /** Calls `run` once the page is idle. */
  request(run: (budget: IdleBudget) => void): number;
  cancel(handle: number): void;
}

/** Longest a queued unit waits for an idle moment on a main thread that is never idle. */
const IDLE_TIMEOUT_MS = 1000;
/** Without `requestIdleCallback` (Safari): the rest of a 60 Hz frame, after the frame. */
const FALLBACK_FRAME_MS = 16;
/** How soon to look again while the camera flies, or while only units kept for a quiet moment wait. */
const RETRY_MS = 250;
/** What a unit is assumed to cost before one has been timed: none starts in a sliver of idle time. */
const FIRST_UNIT_ESTIMATE_MS = 4;

const browserScheduler: IdleScheduler = {
  request(run) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    }
    // A task queued from a frame callback runs once that frame is done: the rest of it is idle.
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
   * waiting for, such as the radio's device, its prints and its skin on the way to the radio and there, small
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
}

interface Queued {
  readonly task: IdleTask;
  readonly urgent: (() => boolean) | undefined;
  readonly patienceMs: number | undefined;
  /** Since when its next unit has waited (queued, or its last unit ran). */
  since: number;
  /** The task's next unit waits for a quiet moment. */
  quiet: boolean;
  /** How long the task's last CPU unit took, in ms; null before its first. */
  lastUnit: number | null;
}

/**
 * Work the room does ahead of need (cutting large meshes for picking, painting the monitor's
 * still, uploading textures before the flights that draw them) on idle time, never on a frame in
 * motion and never making a frame late while something plays (see `IdleMoment`).
 *
 * Tasks run first queued, first served, from `start()` on, except that urgent work goes ahead of the
 * rest: a task the visitor waits on never waits behind one nobody does (the room's own uploads, which
 * may not fit between the radio's frames for as long as its discs float). While something plays, the
 * tasks whose next unit waits for a quiet moment step aside for the ones behind them.
 */
export class IdleWork {
  private readonly queue: Queued[] = [];
  private handle: number | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;
  /** The longest CPU unit timed so far, in ms: a measure of this device's speed. */
  private longestUnit = FIRST_UNIT_ESTIMATE_MS;

  constructor(
    private readonly moment: () => IdleMoment,
    private readonly scheduler: IdleScheduler = browserScheduler,
  ) {}

  /** True while queued work is left. */
  get pending(): boolean {
    return this.queue.length > 0;
  }

  /** Queues `task`; the returned function drops it, finished or not. */
  add(task: IdleTask, options: IdleTaskOptions = {}): () => void {
    if (this.disposed) return () => {};
    const queued: Queued = {
      task,
      urgent: options.urgent,
      patienceMs: options.patienceMs,
      since: performance.now(),
      quiet: false,
      lastUnit: null,
    };
    this.queue.push(queued);
    this.schedule();
    return () => this.remove(queued);
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
      this.handle = this.scheduler.request(this.run);
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
        const next = this.next(moving, playing);
        if (!next) {
          later = this.queue.length > 0;
          break;
        }
        const left = budget.timeRemaining();
        if (playing ? left < (next.lastUnit ?? this.longestUnit) : ran && left <= 0) {
          if (moving || ranPatient || !this.outOfPatience(next) || left < FIRST_UNIT_ESTIMATE_MS) break;
          ranPatient = true;
        }
        this.step(next, playing);
        ran = true;
      }
    } finally {
      this.schedule(later);
    }
  };

  /**
   * The first task whose next unit may run in this moment, urgent ones first: while something plays or moves, a unit
   * kept for a quiet moment waits unless its task is urgent, and in motion only urgent work runs.
   */
  private next(moving: boolean, playing: boolean): Queued | undefined {
    let first: Queued | undefined;
    for (const queued of this.queue) {
      const urgent = queued.urgent?.() === true;
      if (urgent) return queued;
      if (!first && !moving && (!playing || !queued.quiet)) first = queued;
    }
    return first;
  }

  private outOfPatience(queued: Queued): boolean {
    const { patienceMs } = queued;
    return patienceMs !== undefined && queued.urgent?.() === true && performance.now() - queued.since >= patienceMs;
  }

  /** Runs `queued`'s next unit and times it. */
  private step(queued: Queued, playing: boolean): void {
    // Only units that may run while something plays need timing: their cost is what must fit.
    const timed = !queued.quiet || playing;
    const start = performance.now();
    let done = true;
    try {
      const result = queued.task.next();
      done = result.done === true;
      queued.quiet = result.value === QUIET;
    } finally {
      // A task that throws is finished too: it must not block the ones behind it.
      if (done) this.remove(queued);
      if (timed) {
        queued.lastUnit = performance.now() - start;
        this.longestUnit = Math.max(this.longestUnit, queued.lastUnit);
      }
      queued.since = performance.now();
    }
  }

  private remove(queued: Queued): void {
    const at = this.queue.indexOf(queued);
    if (at >= 0) this.queue.splice(at, 1);
  }
}
