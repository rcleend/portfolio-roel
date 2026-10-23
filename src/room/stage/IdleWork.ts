/**
 * A background job in units: every `yield` ends one unit of work, small enough that running it
 * between two frames goes unnoticed.
 */
export type IdleTask = Generator<void, void, void>;

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
/** Without `requestIdleCallback` (Safari): a short delay, and a unit budget that fits in a frame. */
const FALLBACK_DELAY_MS = 50;
const FALLBACK_BUDGET_MS = 8;
/** How soon to look again while something on screen is moving. */
const BUSY_RETRY_MS = 250;

const browserScheduler: IdleScheduler = {
  request(run) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    }
    return window.setTimeout(() => {
      const start = performance.now();
      run({ timeRemaining: () => Math.max(0, FALLBACK_BUDGET_MS - (performance.now() - start)) });
    }, FALLBACK_DELAY_MS);
  },
  cancel(handle) {
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  },
};

/**
 * Work the room does ahead of need (cutting large meshes for picking, uploading textures,
 * painting the monitor's still) on idle time, never on a frame in motion.
 *
 * Tasks run first queued, first served, from `start()` on. One idle callback runs units until
 * its idle period is spent, and always at least one, so a unit that cannot be split (a 30 ms
 * texture upload) still gets its turn. While `isBusy()` (a camera flight, the TV powering on or
 * off) nothing runs: a unit that is invisible on a still frame is a dropped frame in motion.
 */
export class IdleWork {
  private readonly queue: IdleTask[] = [];
  private handle: number | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;

  constructor(
    private readonly isBusy: () => boolean,
    private readonly scheduler: IdleScheduler = browserScheduler,
  ) {}

  /** True while queued work is left. */
  get pending(): boolean {
    return this.queue.length > 0;
  }

  /** Queues `task`; the returned function drops it, finished or not. */
  add(task: IdleTask): () => void {
    if (this.disposed) return () => {};
    this.queue.push(task);
    this.schedule();
    return () => this.remove(task);
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

  private schedule(): void {
    if (!this.started || this.disposed || this.queue.length === 0) return;
    if (this.handle !== null || this.retry !== null) return;
    this.handle = this.scheduler.request(this.run);
  }

  private readonly run = (budget: IdleBudget): void => {
    this.handle = null;
    if (this.isBusy()) {
      this.retry = setTimeout(() => {
        this.retry = null;
        this.schedule();
      }, BUSY_RETRY_MS);
      return;
    }
    try {
      do {
        const task = this.queue[0];
        if (!task) break;
        let finished = true;
        try {
          finished = task.next().done === true;
        } finally {
          // A task that throws is finished too: it must not block the ones behind it.
          if (finished) this.remove(task);
        }
      } while (budget.timeRemaining() > 0 && !this.isBusy());
    } finally {
      this.schedule();
    }
  };

  private remove(task: IdleTask): void {
    const at = this.queue.indexOf(task);
    if (at >= 0) this.queue.splice(at, 1);
  }
}
