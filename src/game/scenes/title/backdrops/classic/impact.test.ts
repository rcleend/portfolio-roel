import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import { craterVisible, FIREBALL_RADIUS, fireballGlow, fireballRadius, IMPACT_TIMES } from './impact';

describe('impact', () => {
  it('collapses the fireball to nothing just as the crater appears', () => {
    expect(fireballRadius(0)).toBe(FIREBALL_RADIUS);
    expect(fireballRadius(IMPACT_TIMES.fireballEnd / 2)).toBeLessThan(FIREBALL_RADIUS);
    expect(fireballRadius(IMPACT_TIMES.fireballEnd)).toBe(0);
    expect(craterVisible(IMPACT_TIMES.fireballEnd - frames(1))).toBe(false);
    expect(craterVisible(IMPACT_TIMES.crater)).toBe(true);
  });

  it('lights the card with the fireball in flat steps', () => {
    expect(fireballGlow(0)).toBe(1);
    expect(fireballGlow(IMPACT_TIMES.fireballEnd)).toBe(0);
    const levels = new Set(Array.from({ length: 20 }, (_, i) => fireballGlow(i / 60)));
    expect(levels.size).toBeLessThanOrEqual(4);
  });
});
