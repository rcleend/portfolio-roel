import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdleBudget, type IdleScheduler, type IdleTask, IdleWork } from './IdleWork';

/** Idle callbacks run by hand, each with as many milliseconds as the test gives it. */
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

  /** Runs the pending callback with a budget of `units` units of work. */
  idle(units = 1): void {
    const [handle, run] = [...this.callbacks][0] ?? [];
    if (handle === undefined || !run) throw new Error('No idle callback is waiting');
    this.callbacks.delete(handle);
    let left = units;
    run({ timeRemaining: () => (--left > 0 ? 10 : 0) });
  }
}

/** A task that logs `name:unit` for each of its `units` units. */
function* logging(log: string[], name: string, units: number): IdleTask {
  for (let unit = 1; unit <= units; unit++) {
    log.push(`${name}:${unit}`);
    if (unit < units) yield;
  }
}

describe('IdleWork', () => {
  let idle: ManualIdle;
  let busy: boolean;
  let work: IdleWork;
  const log: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    idle = new ManualIdle();
    busy = false;
    work = new IdleWork(() => busy, idle);
    log.length = 0;
  });

  afterEach(() => {
    work.dispose();
    vi.useRealTimers();
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

  it('runs tasks in order, as many units as an idle period has room for and at least one', () => {
    work.start();
    work.add(logging(log, 'a', 2));
    work.add(logging(log, 'b', 2));
    idle.idle(0);
    expect(log).toEqual(['a:1']);
    idle.idle(2);
    expect(log).toEqual(['a:1', 'a:2', 'b:1']);
    idle.idle(5);
    expect(log).toEqual(['a:1', 'a:2', 'b:1', 'b:2']);
    expect(idle.waiting).toBe(0);
  });

  it('waits while something is moving, then carries on', () => {
    work.start();
    work.add(logging(log, 'a', 2));
    busy = true;
    idle.idle();
    expect(log).toEqual([]);
    expect(idle.waiting).toBe(0);
    vi.advanceTimersByTime(250);
    busy = false;
    idle.idle();
    expect(log).toEqual(['a:1']);
  });

  it('stops within an idle period as soon as something starts moving', () => {
    work.start();
    work.add(
      (function* () {
        log.push('a:1');
        busy = true;
        yield;
        log.push('a:2');
      })(),
    );
    idle.idle(5);
    expect(log).toEqual(['a:1']);
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
