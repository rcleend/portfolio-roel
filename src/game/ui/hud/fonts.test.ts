import { describe, expect, it } from 'vitest';
import { experience, levels } from '@/content';
import { bannerFont } from './bannerFont';
import { cardFont } from './cardFont';
import { scoreFont } from './scoreFont';

describe('level fonts', () => {
  it('has a banner glyph for every character the announcer says', () => {
    for (const char of 'MISSION 12 START! CUSTOMER RETAINED! ACQUIRED! PRODUCT-MARKET FIT ESCALATION! PAUSED TRY AGAIN') {
      expect(bannerFont.has(char), char).toBe(true);
    }
    expect(bannerFont.cellHeight).toBe(22);
  });

  it('can set every MRR figure and highlight metric', () => {
    const metrics = experience.flatMap((entry) =>
      entry.highlights.flatMap((highlight) => [highlight.metric?.from ?? '', highlight.metric?.to ?? '']),
    );
    for (const text of ['€1,234,567', '+€99', '3/4', '→', ...metrics]) {
      for (const char of text) expect(scoreFont.has(char), `${char} in ${text}`).toBe(true);
    }
  });
});

describe('card font', () => {
  it('sets every highlight description and complaint without a fallback glyph', () => {
    const copy = [
      ...experience.flatMap((entry) => entry.highlights.map((highlight) => highlight.description)),
      ...levels.flatMap((level) => level.complaints),
    ];
    for (const text of copy) {
      for (const char of text) if (char !== ' ') expect(cardFont.has(char), `"${char}" in "${text}"`).toBe(true);
    }
  });
});
