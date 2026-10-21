import { describe, expect, it } from 'vitest';
import { SfxLimiter } from './SfxLimiter';

const limits = { cooldown: 0.05, maxInstances: 2 };

function trigger(limiter: SfxLimiter<string>, id: string, now: number, length = 1): string[] | null {
  const evicted = limiter.request(id, now, limits);
  if (evicted) limiter.add(id, now, now + length, `${id}@${now}`);
  return evicted;
}

describe('SfxLimiter', () => {
  it('drops a retrigger inside the cooldown but not after it', () => {
    const limiter = new SfxLimiter<string>(8);
    expect(trigger(limiter, 'hit', 0)).toEqual([]);
    expect(trigger(limiter, 'hit', 0.02)).toBeNull();
    expect(trigger(limiter, 'hit', 0.06)).toEqual([]);
    expect(trigger(limiter, 'coin', 0.06)).toEqual([]);
  });

  it('cuts the oldest instance of an effect at its cap', () => {
    const limiter = new SfxLimiter<string>(8);
    trigger(limiter, 'hit', 0);
    trigger(limiter, 'hit', 0.1);
    expect(trigger(limiter, 'hit', 0.2)).toEqual(['hit@0']);
    expect(limiter.active).toBe(2);
  });

  it('cuts the oldest instance overall at the polyphony cap', () => {
    const limiter = new SfxLimiter<string>(2);
    trigger(limiter, 'a', 0);
    trigger(limiter, 'b', 0.1);
    expect(trigger(limiter, 'c', 0.2)).toEqual(['a@0']);
  });

  it('releases finished instances', () => {
    const limiter = new SfxLimiter<string>(4);
    trigger(limiter, 'a', 0, 0.5);
    trigger(limiter, 'b', 0, 2);
    expect(limiter.prune(1)).toEqual(['a@0']);
    expect(limiter.active).toBe(1);
  });
});
