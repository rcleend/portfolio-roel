import { describe, expect, it } from 'vitest';
import { type Cue, hasMotion, readableAt, type Storyboard, storyboard } from './storyboard';

const boards: readonly Storyboard[] = (['first', 'warm'] as const).flatMap((visit) =>
  [false, true].flatMap((reducedMotion) =>
    (['in-glass', 'pop-out'] as const).map((mode) => storyboard({ visit, reducedMotion, mode })),
  ),
);

const kinds = (cues: readonly Cue[]): string[] => cues.map((cue) => cue.kind);

describe('storyboard', () => {
  it.each(boards.map((board, index) => [index, board] as const))('keeps its cues in time order (%i)', (_, board) => {
    for (const cues of [board.intro, board.afterOpen]) {
      for (let index = 1; index < cues.length; index++) {
        expect(cues[index]?.at).toBeGreaterThanOrEqual(cues[index - 1]?.at ?? 0);
      }
    }
    for (const cue of board.intro) expect(cue.at).toBeLessThanOrEqual(board.openAt);
    expect(board.afterOpen.at(-1)?.kind).toBe('read');
  });

  it('makes the first visit readable within 1.9 s of landing', () => {
    const board = storyboard({ visit: 'first', reducedMotion: false, mode: 'in-glass' });
    expect(readableAt(board)).toBe(1850);
    expect(kinds(board.intro)).toEqual(['cursor', 'glide', 'select', 'launch', 'splash', 'status', 'status']);
    expect(board.openAt).toBe(1640);
  });

  it('makes a warm visit readable within 0.65 s, without the splash', () => {
    const board = storyboard({ visit: 'warm', reducedMotion: false, mode: 'in-glass' });
    expect(readableAt(board)).toBe(580);
    expect(kinds(board.intro)).toEqual(['cursor', 'select', 'launch']);
    expect(board.intro[0]).toMatchObject({ onIcon: true });
  });

  it('opens the double-click 140 ms apart', () => {
    const board = storyboard({ visit: 'first', reducedMotion: false, mode: 'in-glass' });
    const select = board.intro.find((cue) => cue.kind === 'select');
    const launch = board.intro.find((cue) => cue.kind === 'launch');
    expect((launch?.at ?? 0) - (select?.at ?? 0)).toBe(140);
  });

  it('moves nothing under reduced motion and reads within 0.5 s', () => {
    for (const visit of ['first', 'warm'] as const) {
      for (const mode of ['in-glass', 'pop-out'] as const) {
        const board = storyboard({ visit, reducedMotion: true, mode });
        expect([...board.intro, ...board.afterOpen].filter(hasMotion)).toEqual([]);
        expect(kinds(board.intro)).not.toContain('cursor');
        expect(readableAt(board)).toBeLessThanOrEqual(500);
      }
    }
    const first = storyboard({ visit: 'first', reducedMotion: true, mode: 'in-glass' });
    expect(first.intro).toContainEqual({ at: 0, kind: 'splash', status: 'opening', duration: 0 });
    expect(first.openAt).toBe(400);
    expect(storyboard({ visit: 'warm', reducedMotion: true, mode: 'in-glass' }).openAt).toBe(0);
  });

  it('adds the breakout 150 ms after the window opens in the pop-out', () => {
    const glass = storyboard({ visit: 'first', reducedMotion: false, mode: 'in-glass' });
    const popOut = storyboard({ visit: 'first', reducedMotion: false, mode: 'pop-out' });
    expect(popOut.intro).toEqual(glass.intro);
    expect(popOut.afterOpen).toEqual([
      { at: 150, kind: 'breakout', duration: 280 },
      { at: 430, kind: 'read' },
    ]);
    expect(kinds(glass.afterOpen)).not.toContain('breakout');
    expect(readableAt(popOut)).toBe(2070);
  });

  it('tells motion cues apart', () => {
    expect(hasMotion({ at: 0, kind: 'glide', duration: 520 })).toBe(true);
    expect(hasMotion({ at: 0, kind: 'launch', dip: 60 })).toBe(true);
    expect(hasMotion({ at: 0, kind: 'launch', dip: 0 })).toBe(false);
    expect(hasMotion({ at: 0, kind: 'status', status: 'opening' })).toBe(false);
    expect(hasMotion({ at: 0, kind: 'read' })).toBe(false);
  });
});
