import { describe, expect, it } from 'vitest';
import { restoredScrollTop } from './memory';

describe('restoredScrollTop', () => {
  it('starts at the top the first time', () => {
    expect(restoredScrollTop(null, 'pages:1', 1500)).toBe(0);
  });

  it('restores the exact position in the same layout', () => {
    expect(restoredScrollTop({ top: 640, range: 1500, layout: 'pages:1' }, 'pages:1', 1500)).toBe(640);
  });

  it('keeps the same share of the document in another layout', () => {
    expect(restoredScrollTop({ top: 750, range: 1500, layout: 'pages:1' }, 'reflow', 3000)).toBe(1500);
  });

  it('stays inside the scroll range', () => {
    expect(restoredScrollTop({ top: 900, range: 1500, layout: 'pages:1' }, 'pages:1', 800)).toBe(800);
    expect(restoredScrollTop({ top: 900, range: 0, layout: 'pages:1' }, 'reflow', 800)).toBe(0);
    expect(restoredScrollTop({ top: 900, range: 1500, layout: 'pages:1' }, 'reflow', 0)).toBe(0);
  });
});
