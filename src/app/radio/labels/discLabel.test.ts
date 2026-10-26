import { describe, expect, it } from 'vitest';
import { fallbackColour, type LabelArt, paintDiscLabel, rimText } from './discLabel';

type Call = readonly [string, ...unknown[]];

/** A 2D context that records what it is asked to do; text is 0.6 em per character. */
function recorder(): { context: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif' };
  const fontSize = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  const context = new Proxy(
    {},
    {
      get(_target, key: string) {
        if (key === 'measureText') return (text: string) => ({ width: text.length * fontSize() * 0.6 });
        if (key in state) return state[key];
        return (...args: unknown[]) => calls.push([key, ...args.map(round)]);
      },
      set(_target, key: string, value: unknown) {
        state[key] = value;
        calls.push([`set ${key}`, round(value)]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { context, calls };
}

const round = (value: unknown): unknown => (typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);
const ALBUM = { id: 'night-shift', title: 'Night Shift', artist: 'Studio Attic', placeholder: true };
const IMAGE = { width: 512, height: 512 } as unknown as CanvasImageSource;

function paint(art: LabelArt, album = ALBUM, size = 384): Call[] {
  const { context, calls } = recorder();
  paintDiscLabel(context, size, art, album);
  return calls;
}

describe('paintDiscLabel', () => {
  it('is deterministic: the same album and art paint the same calls', () => {
    expect(paint({ kind: 'print', image: IMAGE })).toEqual(paint({ kind: 'print', image: IMAGE }));
  });

  it('draws a print as it is, transparency and all', () => {
    const calls = paint({ kind: 'print', image: IMAGE });
    expect(calls).toContainEqual(['drawImage', IMAGE, 0, 0, 384, 384]);
    expect(calls.some(([name]) => name === 'clip')).toBe(false);
  });

  it('fills the disc with a cover, clipped to the circle', () => {
    const calls = paint({ kind: 'cover', image: IMAGE });
    const clip = calls.findIndex(([name]) => name === 'clip');
    expect(calls).toContainEqual(['arc', 192, 192, 192, 0, round(Math.PI * 2)]);
    expect(calls.findIndex(([name]) => name === 'drawImage')).toBeGreaterThan(clip);
  });

  it('paints a disc without art in its own colour, with its text', () => {
    const calls = paint(null);
    expect(calls).toContainEqual(['set fillStyle', fallbackColour('night-shift')]);
    expect(
      calls
        .filter(([name]) => name === 'fillText')
        .map((call) => call[1])
        .join(''),
    ).toBe(rimText(ALBUM));
  });

  it('sets the rim text at 54.5 mm in 3.2 mm capitals, stroked, centred on the top', () => {
    const calls = paint(null, ALBUM, 120);
    // 120 px for 120 mm: 1 px per mm.
    const texts = calls.filter(([name]) => name === 'fillText');
    expect(texts.every((call) => call[2] === 0 && call[3] === -54.5)).toBe(true);
    expect(calls).toContainEqual([
      'set font',
      `bold ${3.2 / 0.72}px "Trebuchet MS", "Helvetica Neue", Arial, sans-serif`,
    ]);
    expect(calls).toContainEqual(['set lineWidth', 0.4]);
    expect(calls.filter(([name]) => name === 'strokeText')).toHaveLength(texts.length);
    // The rotations are symmetric about the top: the first and last letters mirror each other.
    const turns = calls.filter(([name]) => name === 'rotate').map((call) => Number(call[1]));
    expect((turns[0] ?? 0) + (turns.at(-1) ?? 0)).toBeCloseTo(0, 2);
  });

  it('shrinks a title too long for the rim instead of closing the ring', () => {
    const long = {
      ...ALBUM,
      title: 'An Album Title So Long It Would Wrap All The Way Round The Disc And Then Some More',
    };
    const turns = paint(null, long, 120)
      .filter(([name]) => name === 'rotate')
      .map((call) => Number(call[1]));
    expect((turns.at(-1) ?? 0) - (turns[0] ?? 0)).toBeLessThan(Math.PI * 2 * 0.8);
  });
});

describe('rimText', () => {
  it('names the album and the artist', () => {
    // A placeholder is tagged in its caption; its print carries only its title and artist, as a real CD's would.
    expect(rimText(ALBUM)).toBe('NIGHT SHIFT · STUDIO ATTIC');
    expect(rimText({ ...ALBUM, placeholder: false })).toBe('NIGHT SHIFT · STUDIO ATTIC');
  });
});

describe('fallbackColour', () => {
  it('is stable per id and differs between ids', () => {
    expect(fallbackColour('a')).toBe(fallbackColour('a'));
    expect(fallbackColour('night-shift')).not.toBe(fallbackColour('low-tide'));
    expect(fallbackColour('a')).toMatch(/^hsl\(\d+ 42% 34%\)$/);
  });
});
