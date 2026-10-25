import { describe, expect, it } from 'vitest';
import { BOSS_BAR_TOP, bossBarTop } from './BossBar';

describe('bossBarTop', () => {
  it('rises from the bottom edge, bounces up past its place and settles there', () => {
    const tops = Array.from({ length: 31 }, (_, frame) => bossBarTop(frame / 60));
    expect(tops[0]).toBeGreaterThan(BOSS_BAR_TOP + 20);
    expect(Math.min(...tops)).toBeLessThan(BOSS_BAR_TOP);
    expect(tops.at(-1)).toBe(BOSS_BAR_TOP);
  });
});
