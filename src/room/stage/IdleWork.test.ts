import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdleBudget, type IdleMoment, type IdleScheduler, type IdleTask, IdleWork, QUIET } from './IdleWork';

/** The page's clock, moved on only by the work the tests pretend to do. */
let now = 0;

/** Idle callbacks run by hand, each with as many milliseconds of idle time as the test gives it. */
class ManualIdle implements IdleScheduler {
  private readonly callbacks = new Map<number, (budget: IdleBudget) => void>();
  private next = 1;

  /** The timeout of every request so far. */
  readonly timeouts: number[] = [];

  request(run: (budget: IdleBudget) => void, timeoutMs: number): number {
    this.callbacks.set(this.next, run);
    this.timeouts.push(timeoutMs);
    return this.next++;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  get waiting(): number {
    return this.callbacks.size;
  }

  /** Runs the pending callback in an idle period of `ms` milliseconds. */
  idle(ms = 10): void {
    const [handle, run] = [...this.callbacks][0] ?? [];
    if (handle === undefined || !run) throw new Error('No idle callback is waiting');
    this.callbacks.delete(handle);
    const end = now + ms;
    run({ timeRemaining: () => Math.max(0, end - now) });
  }

  /** Runs the pending callback as the browser does once its timeout passes without an idle period. */
  timeOut(): void {
    const [handle, run] = [...this.callbacks][0] ?? [];
    if (handle === undefined || !run) throw new Error('No idle callback is waiting');
    this.callbacks.delete(handle);
    run({ timeRemaining: () => 0 });
  }
}

/** A task that logs `name:unit` for each of its units, each taking `ms` milliseconds. */
function* logging(log: string[], name: string, units: number, ms = 1): IdleTask {
  for (let unit = 1; unit <= units; unit++) {
    now += ms;
    log.push(`${name}:${unit}`);
    if (unit < units) yield;
  }
}

/** A task whose second unit waits for a quiet moment (an upload, say). */
function* uploading(log: string[], name: string): IdleTask {
  log.push(`${name}:cpu`);
  yield QUIET;
  log.push(`${name}:quiet`);
}

describe('IdleWork', () => {
  let idle: ManualIdle;
  let moment: IdleMoment;
  let work: IdleWork;
  const log: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    idle = new ManualIdle();
    moment = 'quiet';
    work = new IdleWork(() => moment, idle);
    log.length = 0;
  });

  afterEach(() => {
    work.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only collects tasks until it is started', () => {
    work.add(logging(log, 'a', 1));
    expect(idle.waiting).toBe(0);
    work.start();
    expect(idle.waiting).toBe(1);
    idle.idle();
    expect(log).toEqual(['a:1']);
    expect(work.pending).toBe(false);
  });

  describe('while nothing plays', () => {
    it('runs tasks in order, as many units as an idle period has room for and at least one', () => {
      work.start();
      work.add(logging(log, 'a', 2, 3));
      work.add(logging(log, 'b', 2, 3));
      idle.idle(0);
      expect(log).toEqual(['a:1']);
      idle.idle(5);
      expect(log).toEqual(['a:1', 'a:2', 'b:1']);
      idle.idle(50);
      expect(log).toEqual(['a:1', 'a:2', 'b:1', 'b:2']);
      expect(idle.waiting).toBe(0);
    });

    it('runs the units kept for a quiet moment too', () => {
      work.start();
      work.add(uploading(log, 'a'));
      idle.idle();
      expect(log).toEqual(['a:cpu', 'a:quiet']);
    });
  });

  describe('while something moves', () => {
    it('waits, then carries on', () => {
      work.start();
      work.add(logging(log, 'a', 2));
      moment = 'moving';
      idle.idle();
      expect(log).toEqual([]);
      expect(idle.waiting).toBe(0);
      vi.advanceTimersByTime(250);
      moment = 'quiet';
      idle.idle();
      expect(log).toEqual(['a:1', 'a:2']);
    });

    it('runs urgent work only as it runs while something plays, and only while it is urgent', () => {
      work.start();
      let urgent = true;
      work.add(logging(log, 'a', 3, 4), { urgent: () => urgent });
      work.add(logging(log, 'b', 1));
      moment = 'moving';
      // Its first unit is judged by the longest unit so far (4 ms before any): a 3 ms idle period cannot hold it.
      idle.idle(3);
      expect(log).toEqual([]);
      vi.advanceTimersByTime(250);
      idle.idle(9);
      expect(log).toEqual(['a:1', 'a:2']);
      urgent = false;
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:1', 'a:2']);
      moment = 'quiet';
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:1', 'a:2', 'a:3', 'b:1']);
    });

    it('never lets patience run a unit that does not fit while something moves', () => {
      work.start();
      work.add(logging(log, 'big', 1, 14));
      idle.idle(50);
      work.add(logging(log, 'a', 1, 3), { urgent: () => true, patienceMs: 400 });
      moment = 'moving';
      now += 1000;
      idle.idle(6);
      expect(log).toEqual(['big:1']);
    });

    it('never runs a unit kept for a quiet moment in motion unless urgent, and then only what fits', () => {
      work.start();
      let urgent = false;
      moment = 'playing';
      work.add(
        (function* (): IdleTask {
          now += 6;
          log.push('a:cpu');
          yield QUIET;
          log.push('a:quiet');
        })(),
        { urgent: () => urgent },
      );
      idle.idle(50);
      expect(log).toEqual(['a:cpu']);
      moment = 'moving';
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:cpu']);
      urgent = true;
      vi.advanceTimersByTime(250);
      // Judged by its task's previous unit, 6 ms.
      idle.idle(3);
      expect(log).toEqual(['a:cpu']);
      vi.advanceTimersByTime(250);
      idle.idle(9);
      expect(log).toEqual(['a:cpu', 'a:quiet']);
    });

    it('gives a sliced urgent task one unit after each frame that leaves no idle period or too short a one, while its units fit', () => {
      work.start();
      work.add(logging(log, 'big', 1, 14));
      idle.idle(50);
      moment = 'moving';
      let urgent = true;
      work.add(logging(log, 'a', 4, 5), { urgent: () => urgent, sliceMs: 6 });
      work.add(logging(log, 'b', 1, 1), { urgent: () => true });
      // While it is urgent its request waits one frame for an idle period, not a second.
      expect(idle.timeouts.at(-1)).toBe(16);
      idle.timeOut();
      expect(log).toEqual(['big:1', 'a:1']);
      idle.timeOut();
      expect(log).toEqual(['big:1', 'a:1', 'a:2']);
      // An idle period too short for a 5 ms unit still takes one, and only one.
      idle.idle(3);
      expect(log).toEqual(['big:1', 'a:1', 'a:2', 'a:3']);
      urgent = false;
      idle.timeOut();
      expect(log).toEqual(['big:1', 'a:1', 'a:2', 'a:3']);
      expect(idle.timeouts.at(-1)).toBe(1000);
    });

    it('runs no slice for a task whose units outgrow it, once three have shown it, nor for a task without one', () => {
      work.start();
      moment = 'moving';
      work.add(logging(log, 'a', 5, 8), { urgent: () => true, sliceMs: 6 });
      for (let frame = 0; frame < 3; frame++) idle.timeOut();
      expect(log).toEqual(['a:1', 'a:2', 'a:3']);
      idle.timeOut();
      expect(log).toEqual(['a:1', 'a:2', 'a:3']);
      work.dispose();
      const other = new IdleWork(() => 'moving', idle);
      other.start();
      other.add(logging(log, 'b', 1, 1), { urgent: () => true });
      expect(idle.timeouts.at(-1)).toBe(1000);
      idle.timeOut();
      expect(log).toEqual(['a:1', 'a:2', 'a:3']);
    });

    it('lets no single long first unit of a kind end the slices: a slow first strip is not what the strips cost', () => {
      work.start();
      moment = 'moving';
      // Measured on a phone at 6x CPU: the first copy out of a fresh bitmap 7.6 ms, the strips after it 1-2 ms.
      const costs = [7.6, 1, 2, 1, 1, 2, 1, 1];
      work.add(
        (function* (): IdleTask {
          now += 3;
          log.push('a:setup');
          for (const [strip, ms] of costs.entries()) {
            yield QUIET;
            now += ms;
            log.push(`a:s${strip + 1}`);
          }
        })(),
        { urgent: () => true, sliceMs: 6.5 },
      );
      // Frames that leave no idle period: one unit after each.
      for (let frame = 0; frame <= costs.length; frame++) idle.timeOut();
      expect(log).toEqual(['a:setup', ...costs.map((_, strip) => `a:s${strip + 1}`)]);
      expect(work.pending).toBe(false);
    });

    it('judges a sliced task by its typical unit, so one long unit (a GC pause) does not end its slices', () => {
      work.start();
      moment = 'moving';
      const costs = [1, 30, 1, 1, 1];
      work.add(
        (function* (): IdleTask {
          for (const [unit, ms] of costs.entries()) {
            now += ms;
            log.push(`a:${unit + 1}`);
            if (unit < costs.length - 1) yield;
          }
        })(),
        { urgent: () => true, sliceMs: 6 },
      );
      for (let frame = 0; frame < costs.length; frame++) idle.timeOut();
      expect(log).toEqual(['a:1', 'a:2', 'a:3', 'a:4', 'a:5']);
    });

    it("judges a sliced task's uploads by its uploads, not by a set-up unit longer than a slice", () => {
      work.start();
      moment = 'moving';
      work.add(
        (function* (): IdleTask {
          // A slow CPU sets up the posters' program and storage in 10 ms, then copies 1 ms strips.
          now += 10;
          log.push('a:setup');
          for (let strip = 1; strip <= 3; strip++) {
            yield QUIET;
            now += 1;
            log.push(`a:strip${strip}`);
          }
        })(),
        { urgent: () => true, sliceMs: 6 },
      );
      idle.timeOut();
      expect(log).toEqual(['a:setup']);
      // An idle period shorter than the set-up unit still takes a strip, and so does a frame that leaves none.
      idle.idle(7);
      expect(log).toEqual(['a:setup', 'a:strip1']);
      idle.timeOut();
      idle.timeOut();
      expect(log).toEqual(['a:setup', 'a:strip1', 'a:strip2', 'a:strip3']);
      expect(work.pending).toBe(false);
    });

    it('gives an upload (a unit kept for a quiet moment) an idle period to itself while something moves', () => {
      work.start();
      moment = 'moving';
      work.add(
        (function* (): IdleTask {
          log.push('a:cpu');
          for (let strip = 1; strip <= 3; strip++) {
            yield QUIET;
            log.push(`a:strip${strip}`);
          }
        })(),
        { urgent: () => true },
      );
      // Its CPU unit does not take an upload along, however long the idle period.
      idle.idle(50);
      expect(log).toEqual(['a:cpu']);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'a:strip1']);
      idle.idle(50);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'a:strip1', 'a:strip2', 'a:strip3']);
      // At rest, uploads go together again.
      moment = 'quiet';
      work.add(
        (function* (): IdleTask {
          yield QUIET;
          log.push('b:strip1');
          yield QUIET;
          log.push('b:strip2');
        })(),
      );
      idle.idle(50);
      expect(log.slice(4)).toEqual(['b:strip1', 'b:strip2']);
    });

    it('cuts short a long wait once a sliced task is urgent', () => {
      work.start();
      work.add(logging(log, 'a', 1));
      expect(idle.waiting).toBe(1);
      work.add(logging(log, 'b', 1), { urgent: () => true, sliceMs: 6 });
      expect(idle.waiting).toBe(1);
      expect(idle.timeouts).toEqual([1000, 16]);
    });

    it('cuts short a look again later once a sliced task is urgent', () => {
      work.start();
      moment = 'moving';
      // Nothing may run in motion: the queue looks again in 250 ms.
      work.add(logging(log, 'a', 1));
      idle.idle(50);
      expect(idle.waiting).toBe(0);
      work.add(logging(log, 'b', 1), { urgent: () => true, sliceMs: 6 });
      expect(idle.timeouts.at(-1)).toBe(16);
      idle.timeOut();
      expect(log).toEqual(['b:1']);
    });

    it('stops within an idle period as soon as something starts moving', () => {
      work.start();
      work.add(
        (function* (): IdleTask {
          log.push('a:1');
          moment = 'moving';
          yield;
          log.push('a:2');
        })(),
      );
      idle.idle(50);
      expect(log).toEqual(['a:1']);
    });
  });

  describe('while something plays', () => {
    beforeEach(() => {
      moment = 'playing';
      work.start();
    });

    it("starts a unit only in an idle period that can hold it, judged by its task's previous unit", () => {
      work.add(logging(log, 'a', 4, 6));
      // Before any unit is timed, none starts in a sliver of idle time.
      idle.idle(3);
      expect(log).toEqual([]);
      idle.idle(5);
      expect(log).toEqual(['a:1']);
      // Its unit took 6 ms: 5 ms of idle time is no longer enough for the next.
      idle.idle(5);
      expect(log).toEqual(['a:1']);
      idle.idle(12);
      expect(log).toEqual(['a:1', 'a:2', 'a:3']);
    });

    it("judges a task's first unit by the longest unit timed so far", () => {
      work.add(logging(log, 'a', 1, 6));
      idle.idle(6);
      work.add(logging(log, 'b', 3, 2));
      idle.idle(5);
      expect(log).toEqual(['a:1']);
      // The first needs the 6 ms a's unit took; the rest only the 2 ms b's own took.
      idle.idle(6);
      expect(log).toEqual(['a:1', 'b:1', 'b:2', 'b:3']);
    });

    it("judges a task's first unit by its own estimate when it has one, then by what that unit took", () => {
      work.add(logging(log, 'heavy', 1, 14));
      idle.idle(50);
      work.add(logging(log, 'light', 3, 2), { estimateMs: 1 });
      // The 14 ms the heavy unit took does not hold back a unit expected to take 1 ms.
      idle.idle(1.5);
      expect(log).toEqual(['heavy:1', 'light:1']);
      // Its first unit took 2 ms: 1.5 ms of idle time is no longer enough for the next.
      idle.idle(1.5);
      expect(log).toEqual(['heavy:1', 'light:1']);
      idle.idle(4);
      expect(log).toEqual(['heavy:1', 'light:1', 'light:2', 'light:3']);
    });

    it('lets a unit that fits the idle period go ahead of one at the head of the queue that does not', () => {
      work.add(logging(log, 'heavy', 2, 10));
      idle.idle(12);
      expect(log).toEqual(['heavy:1']);
      work.add(logging(log, 'light', 2, 1), { estimateMs: 1 });
      // The heavy task's 10 ms unit does not fit 5 ms of idle time; the light one's units do, and go first.
      idle.idle(5);
      expect(log).toEqual(['heavy:1', 'light:1', 'light:2']);
      // The head of the queue still goes first in an idle period that can hold it.
      work.add(logging(log, 'after', 1, 1), { estimateMs: 1 });
      idle.idle(12);
      expect(log).toEqual(['heavy:1', 'light:1', 'light:2', 'heavy:2', 'after:1']);
    });

    it('never lets a unit that fits go ahead of urgent work', () => {
      work.add(logging(log, 'big', 1, 14));
      idle.idle(50);
      work.add(logging(log, 'light', 1, 1), { estimateMs: 1 });
      work.add(logging(log, 'urgent', 1, 1), { urgent: () => true });
      // The urgent task's first unit is judged by the 14 ms one: it waits, and so does the light one behind it.
      idle.idle(5);
      expect(log).toEqual(['big:1']);
      idle.idle(16);
      expect(log).toEqual(['big:1', 'urgent:1', 'light:1']);
    });

    it('runs urgent work that has waited out its patience, one unit per idle period, only while urgent', () => {
      work.add(logging(log, 'big', 1, 14));
      idle.idle(50);
      let urgent = true;
      // Prints at the radio: 3 ms each, but judged by the 14 ms unit before them none would fit a 6 ms idle period.
      work.add(logging(log, 'print', 2, 3), { urgent: () => urgent, patienceMs: 400 });
      work.add(logging(log, 'other', 1, 3), { urgent: () => urgent, patienceMs: 400 });
      idle.idle(6);
      expect(log).toEqual(['big:1']);
      now += 400;
      idle.idle(6);
      // One unit for its patience; then its own 3 ms measure fits what is left.
      expect(log).toEqual(['big:1', 'print:1', 'print:2']);
      // The next task's patience ran out too, but an idle period runs only one unit that may not fit.
      idle.idle(6);
      expect(log).toEqual(['big:1', 'print:1', 'print:2', 'other:1']);
      work.add(logging(log, 'late', 1, 3), { urgent: () => urgent, patienceMs: 400 });
      urgent = false;
      now += 1000;
      idle.idle(6);
      expect(log).toHaveLength(4);
      // Never in a sliver of idle time.
      urgent = true;
      idle.idle(2);
      expect(log).toHaveLength(4);
    });

    it('lets an urgent task run its units kept for a quiet moment, as long as it is urgent', () => {
      let urgent = true;
      work.add(uploading(log, 'a'), { urgent: () => urgent });
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'a:quiet']);
      urgent = false;
      work.add(uploading(log, 'b'), { urgent: () => urgent });
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'a:quiet', 'b:cpu']);
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'a:quiet', 'b:cpu']);
      urgent = true;
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'a:quiet', 'b:cpu', 'b:quiet']);
    });

    it('runs small uploads between the frames, one per idle period that can hold the previous unit', () => {
      const strips = (name: string, setupMs: number, stripMs: number): IdleTask =>
        (function* (): IdleTask {
          now += setupMs;
          log.push(`${name}:setup`);
          for (let strip = 1; strip <= 3; strip++) {
            yield QUIET;
            now += stripMs;
            log.push(`${name}:s${strip}`);
          }
        })();
      work.add(strips('small', 2, 1), { smallUploads: true, estimateMs: 2 });
      work.add(strips('kept', 2, 1), { estimateMs: 2 });
      // An upload has its idle period to itself: nothing follows the set-up unit into it but the next one.
      idle.idle(5);
      expect(log).toEqual(['small:setup']);
      // The first strip is judged by the 2 ms set-up unit, and each strip has an idle period to itself.
      idle.idle(1.5);
      expect(log).toEqual(['small:setup']);
      idle.idle(50);
      expect(log).toEqual(['small:setup', 'small:s1']);
      idle.idle(1);
      idle.idle(1);
      expect(log).toEqual(['small:setup', 'small:s1', 'small:s2', 'small:s3']);
      // A task without small uploads keeps its strips for a quiet moment.
      idle.idle(50);
      expect(log.slice(4)).toEqual(['kept:setup']);
      expect(work.pending).toBe(true);
      moment = 'quiet';
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log.slice(5)).toEqual(['kept:s1', 'kept:s2', 'kept:s3']);
    });

    it('hurries a sliced task whose urgency turned on after it was queued', () => {
      let urgent = false;
      work.add(logging(log, 'a', 2, 1), { urgent: () => urgent, sliceMs: 6 });
      expect(idle.timeouts.at(-1)).toBe(1000);
      urgent = true;
      moment = 'moving';
      work.hurry();
      // The long request is replaced by one that waits a frame.
      expect(idle.waiting).toBe(1);
      expect(idle.timeouts.at(-1)).toBe(16);
      idle.timeOut();
      expect(log).toEqual(['a:1']);
    });

    it('keeps a unit for a quiet moment: the tasks behind it go first', () => {
      work.add(uploading(log, 'a'));
      work.add(logging(log, 'b', 1));
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'b:1']);
      expect(idle.waiting).toBe(0);
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'b:1']);
      moment = 'quiet';
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'b:1', 'a:quiet']);
    });

    it('runs a task queued while it looks again later in the next idle period, not after that wait', () => {
      work.add(uploading(log, 'a'));
      idle.idle(50);
      // Only a's upload is left, kept for a quiet moment: the queue looks again in a while.
      expect(log).toEqual(['a:cpu']);
      expect(idle.waiting).toBe(0);
      // The room's bake queues its units one at a time, each as the GPU finishes the one before.
      work.add(logging(log, 'b', 1));
      expect(idle.waiting).toBe(1);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'b:1']);
      // And the look again later is back for what waits.
      expect(idle.waiting).toBe(0);
      moment = 'quiet';
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['a:cpu', 'b:1', 'a:quiet']);
    });

    it('does not let a unit kept for a quiet moment raise the bar for the others', () => {
      moment = 'quiet';
      work.add(
        (function* (): IdleTask {
          yield QUIET;
          now += 40;
        })(),
      );
      idle.idle();
      moment = 'playing';
      work.add(logging(log, 'b', 1, 2));
      idle.idle(5);
      expect(log).toEqual(['b:1']);
    });

    it('puts urgent work ahead of a task nobody waits on, even one that has not started', () => {
      // An atlas's last strip with its mipmaps, between the float's frames: the longest unit so far.
      work.add(logging(log, 'strip', 1, 13.5), { urgent: () => true });
      idle.idle(50);
      // The room's own uploads, queued as the camera left the TV: never stepped, so judged by that 13.5 ms.
      work.add(logging(log, 'room', 1, 1));
      // The radio's prints, at the radio: urgent and patient.
      for (const name of ['print1', 'print2', 'print3']) {
        work.add(logging(log, name, 1, 1), { urgent: () => true, patienceMs: 400 });
      }
      // The discs float: 8 ms between frames, for two seconds.
      for (let frame = 0; frame < 120; frame++) {
        now += 16;
        vi.advanceTimersByTime(16);
        if (idle.waiting > 0) idle.idle(8);
      }
      expect(log).toEqual(['strip:1', 'print1:1', 'print2:1', 'print3:1']);
      // The room's own work waits for a quiet moment that can hold it, as before.
      moment = 'quiet';
      vi.advanceTimersByTime(250);
      idle.idle(50);
      expect(log).toEqual(['strip:1', 'print1:1', 'print2:1', 'print3:1', 'room:1']);
    });
  });

  it('drops a cancelled task, and keeps going past one that throws', () => {
    work.start();
    const cancel = work.add(logging(log, 'a', 2));
    work.add(
      (function* (): IdleTask {
        log.push('b:1');
        yield;
        throw new Error('broken');
      })(),
    );
    work.add(logging(log, 'c', 1));
    cancel();
    expect(() => idle.idle(5)).toThrow('broken');
    idle.idle();
    expect(log).toEqual(['b:1', 'c:1']);
  });

  it('ends a dropped task, so its finally blocks run, also when it is dropped from inside its own unit', () => {
    work.start();
    const ended: string[] = [];
    function* holding(name: string, during?: () => void): IdleTask {
      try {
        now += 1;
        log.push(`${name}:1`);
        during?.();
        yield;
        log.push(`${name}:2`);
      } finally {
        ended.push(name);
      }
    }
    // Dropped between its units: the next never runs, the finally does.
    const dropA = work.add(holding('a'));
    idle.idle(1);
    dropA();
    expect(ended).toEqual(['a']);
    // Dropped from inside its own unit: ended once that unit returns.
    let dropB = (): void => {};
    dropB = work.add(holding('b', () => dropB()));
    idle.idle(50);
    expect(log).toEqual(['a:1', 'b:1']);
    expect(ended).toEqual(['a', 'b']);
  });

  it('does nothing once disposed', () => {
    work.start();
    work.add(logging(log, 'a', 1));
    work.dispose();
    expect(idle.waiting).toBe(0);
    work.add(logging(log, 'b', 1));
    expect(idle.waiting).toBe(0);
  });
  describe('while the camera flies', () => {
    it('runs nothing, urgent or not, and goes on at the landing', () => {
      moment = 'flying';
      work.add(logging(log, 'a', 2));
      work.add(logging(log, 'urgent', 1), { urgent: () => true, sliceMs: 5 });
      work.start();
      idle.idle();
      expect(log).toEqual([]);
      // It looks again later, by itself; the landing need not wait for that.
      expect(idle.waiting).toBe(0);
      moment = 'quiet';
      work.wake();
      idle.idle();
      expect(log).toEqual(['urgent:1', 'a:1', 'a:2']);
    });

    it('makes what a flight shows before it sets off, whatever plays, and leaves the rest queued', async () => {
      moment = 'playing';
      work.add(logging(log, 'other', 2));
      work.add(uploading(log, 'textures'), { flight: true });
      work.add(logging(log, 'discs', 1), { flight: (to) => to === 'radio' });
      work.start();
      expect(work.flightPending('room')).toBe(true);
      const drained = work.drain('room', 400);
      await vi.advanceTimersByTimeAsync(10);
      await drained;
      expect(log).toEqual(['textures:cpu', 'textures:quiet']);
      expect(work.flightPending('room')).toBe(false);
      // The radio's discs wait for a flight to the radio.
      expect(work.flightPending('radio')).toBe(true);
      const boarded = work.drain('radio', 400);
      await vi.advanceTimersByTimeAsync(10);
      await boarded;
      expect(log).toEqual(['textures:cpu', 'textures:quiet', 'discs:1']);
      expect(work.pending).toBe(true);
    });

    it('takes up a task queued by the last unit of another, a task later', async () => {
      function* chained(): IdleTask {
        log.push('first');
        void Promise.resolve().then(() => work.add(logging(log, 'second', 1), { flight: true }));
      }
      work.add(chained(), { flight: true });
      work.start();
      const drained = work.drain('room', 400);
      await vi.advanceTimersByTimeAsync(10);
      await drained;
      expect(log).toEqual(['first', 'second:1']);
    });

    it('stops making things ready when its time is up: the camera never waits longer', async () => {
      work.add(logging(log, 'slow', 10, 100), { flight: true });
      work.start();
      const drained = work.drain('room', 250);
      await vi.advanceTimersByTimeAsync(50);
      await drained;
      expect(log).toEqual(['slow:1', 'slow:2', 'slow:3']);
      expect(work.flightPending('room')).toBe(true);
    });
  });
});
