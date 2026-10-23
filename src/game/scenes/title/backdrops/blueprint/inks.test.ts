import { describe, expect, it } from 'vitest';
import { bandColors, type Rgba } from '@/engine/gfx/color';
import { windowThemes } from '../../../../ui/theme';
import { MENU_FIELD, MENU_PINSTRIPE } from '../../../character-select/backdrop';
import { GLOW_STEP, GRID_FLOOR, INK, PAPER_STEPS, RAMP, RAMP_RGBA, shadeOf } from './inks';

/** Relative luminance, as WCAG defines it. */
function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

describe('blueprint ramp', () => {
  it('climbs in brightness at every step, so exposures, cooling and erasing read as light', () => {
    const levels = RAMP_RGBA.map(luminance);
    for (let i = 1; i < levels.length; i++) expect(levels[i], RAMP[i]).toBeGreaterThan(levels[i - 1] as number);
  });

  it("prints the paper in character select's field, a step per band", () => {
    const paper = RAMP.slice(PAPER_STEPS.first, PAPER_STEPS.first + PAPER_STEPS.count);
    expect(paper).toEqual(bandColors(MENU_FIELD.stops, MENU_FIELD.bands).toReversed());
  });

  it("draws in the menus' own colours: the pinstripe, the indigo window's rims and white", () => {
    expect(shadeOf(GRID_FLOOR.minor)).toBe(MENU_PINSTRIPE);
    expect(shadeOf(GLOW_STEP)).toBe(windowThemes.indigo.dark);
    expect(shadeOf(INK.white)).toBe(windowThemes.indigo.light);
    expect(shadeOf(INK.hot)).toBe('#ffffff');
  });

  it('keeps the depth cues in order: paper, faint grid, heavy grid, glow, then the line inks up to the pen tip', () => {
    const order = [
      PAPER_STEPS.first + PAPER_STEPS.count - 1,
      GRID_FLOOR.minor,
      GRID_FLOOR.major,
      GLOW_STEP,
      INK.ghost,
      INK.mid,
      INK.pale,
      INK.white,
      INK.hot,
    ];
    expect(order).toEqual(order.toSorted((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });
});
