import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdleBudget, type IdleMoment, type IdleScheduler, type IdleTask, IdleWork, QUIET } from './IdleWork';

/** The page's clock, moved on only by the work the tests pretend to do. */
let now = 0;

/** Idle callbacks run by hand, each with as many milliseconds of idle time as the test gives it. */
class ManualIdle implements IdleScheduler {
  private readonly callbacks = new Map<number, (budget: IdleBudget) => void>();
  private next = 1;

  request(run: (budget: IdleBudget) => void): number {
    this.callbacks.set(this.next, run);
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

  it('does nothing once disposed', () => {
    work.start();
    work.add(logging(log, 'a', 1));
    work.dispose();
    expect(idle.waiting).toBe(0);
    work.add(logging(log, 'b', 1));
    expect(idle.waiting).toBe(0);
  });
});
