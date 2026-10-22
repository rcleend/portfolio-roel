import { describe, expect, it } from 'vitest';
import { skillIcons } from '../art/looks/Looks';
import { sizedLooks } from '../art/looks/testing';
import { iconSlotSize } from './iconSlot';

const icons = (size: number) => skillIcons(sizedLooks({ hero: 40, customer: 40, icon: size }));

describe('iconSlotSize', () => {
  it('keeps the slot each screen was laid out with for classic icons', () => {
    expect(iconSlotSize(24, icons(16))).toBe(24);
    expect(iconSlotSize(22, icons(16))).toBe(22);
  });

  it("grows for a look's bigger icons, keeping each screen's margin around them", () => {
    expect(iconSlotSize(24, icons(24))).toBe(32);
    expect(iconSlotSize(22, icons(24))).toBe(30);
  });

  it('sizes a row that mixes looks from its largest icon', () => {
    expect(iconSlotSize(22, [...icons(16), ...icons(24)])).toBe(30);
  });
});
