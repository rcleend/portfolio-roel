import { describe, expect, it } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { parseHex, shade } from '@/engine/gfx/color';
import { arcadeFont } from '../../art/fonts/arcade';
import { smallFont } from '../../art/fonts/small';
import { createTextStyles } from '../../fonts';
import { palette } from '../../palette';
import { BUTTON_LIT } from '../../ui/Button';
import { LIT_WINDOW, RAMP } from '../title/backdrops/blueprint/inks';
import { blueprintPostcards, blueprintPrompt, MISSION_INK } from './blueprint';

const ramp = new Set<string>(RAMP);
const small = BitmapFont.fromGlyphData(smallFont);
const { prompt } = createTextStyles({ small, label: small, arcade: BitmapFont.fromGlyphData(arcadeFont) });

function luminance(hex: string): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('mission select inks', () => {
  it('are all steps of the blueprint ramp', () => {
    const { mark, ...postcards } = blueprintPostcards(prompt);
    for (const [name, ink] of Object.entries({ ...MISSION_INK, ...postcards })) {
      for (const color of [ink].flat()) expect(ramp.has(color), `${name} ${color}`).toBe(true);
    }
  });

  it('band the prompt face white down the line inks, outlined and shadowed in the paper', () => {
    const style = blueprintPrompt(prompt);

    expect(style.font).toBe(prompt.font);
    expect([style.fill].flat()).toHaveLength(5);
    for (const color of [style.fill, style.outline, style.shadow?.color].flat()) {
      expect(ramp.has(color as string), String(color)).toBe(true);
    }
    expect(style.shadow).toMatchObject({ x: prompt.shadow?.x, y: prompt.shadow?.y });
  });

  it("letter the postcards' question marks in the blueprint prompt face", () => {
    expect(blueprintPostcards(prompt).mark).toEqual(blueprintPrompt(prompt));
  });

  it('keep the gold CONTACT label over 5:1 on every band of its key, at rest and focused', () => {
    for (const stop of LIT_WINDOW.fill.stops) {
      expect(contrast(palette.gold, stop), stop).toBeGreaterThan(5);
      expect(contrast(palette.gold, shade(stop, BUTTON_LIT)), `${stop} lit`).toBeGreaterThan(5);
    }
  });
});
