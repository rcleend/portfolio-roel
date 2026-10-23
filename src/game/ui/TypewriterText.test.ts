import { describe, expect, it } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { smallFont } from '../art/fonts/small';
import { TypewriterText } from './TypewriterText';

const style = { font: BitmapFont.fromGlyphData(smallFont), fill: '#ffffff' };

describe('TypewriterText', () => {
  it('reveals one character every N frames and ticks for non-space characters', () => {
    const ticks: string[] = [];
    const typewriter = new TypewriterText('A LEENDERS', style, {
      maxWidth: 200,
      framesPerChar: 4,
      onChar: (c) => ticks.push(c),
    });
    for (let i = 0; i < 8; i++) typewriter.update();
    expect(typewriter.visibleChars).toBe(2);
    expect(ticks).toEqual(['A']);
    for (let i = 0; i < 400; i++) typewriter.update();
    expect(typewriter.done).toBe(true);
    expect(ticks.join('')).toBe('ALEENDERS');
  });

  it('wraps once up front so lines never reflow while typing', () => {
    const typewriter = new TypewriterText('one two three four five six seven', style, { maxWidth: 60 });
    expect(typewriter.paragraph.block.lines.length).toBeGreaterThan(1);
    typewriter.skip();
    expect(typewriter.done).toBe(true);
  });
});
