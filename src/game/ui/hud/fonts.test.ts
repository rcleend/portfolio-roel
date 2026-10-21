import { describe, expect, it } from 'vitest';
import { experience } from '@/content';
import { bannerFont } from './bannerFont';
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
