import { describe, expect, it } from 'vitest';
import { enemyPage, heroRows } from './layout';

describe('specimen layout', () => {
  it('keeps the original layout for classic-sized art', () => {
    expect(heroRows(40)).toEqual({ firstFeet: 72, pitch: 56 });
    expect(enemyPage(40, 26)).toEqual({ customerFeet: [78, 128], captionY: 132, iconsTop: 146, iconPitch: 30 });
  });

  it('spreads three rows of 64 px heroes over the screen, names included', () => {
    const rows = heroRows(64);
    const lastName = rows.firstFeet + 2 * rows.pitch + 4 + 8;
    expect(lastName).toBeLessThanOrEqual(240);
    expect(rows.firstFeet - 64).toBeGreaterThanOrEqual(18);
  });

  it('keeps every icon on screen under a 64 px customer, with one alternating row', () => {
    const page = enemyPage(64, 30);
    expect(page.customerFeet).toHaveLength(1);
    expect(page.iconsTop + 3 * page.iconPitch - 4).toBeLessThanOrEqual(240);
  });
});
