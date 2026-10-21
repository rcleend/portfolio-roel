import { describe, expect, it } from 'vitest';
import type { Patch } from '../synth/patch';
import { SongCursor } from './SongCursor';
import { compileSong, type Song } from './song';

const tone: Patch = { wave: { type: 'sine' }, env: { attack: 0, decay: 0, sustain: 1, release: 0.1 } };
const hit: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.05 },
};

// 120 bpm: a bar is 2 s, a beat 0.5 s.
const song = compileSong({
  bpm: 120,
  channels: { lead: { patch: tone }, drums: { kit: { k: { patch: hit, note: 'A4' } } } },
  patterns: { intro: { lead: 'C4 . . -' }, loop: { lead: 'E4 ~G4 . .', drums: 'k . k .' } },
  sequence: ['intro', 'loop'],
  loopFrom: 1,
} satisfies Song);

const times = (notes: ReturnType<SongCursor['take']>): number[] => notes.map((n) => Number(n.note.time.toFixed(3)));

describe('SongCursor', () => {
  it('returns each event once, window by window, on the audio clock', () => {
    const cursor = new SongCursor(song, { startTime: 10 });
    expect(times(cursor.take(10.5))).toEqual([10]);
    expect(times(cursor.take(12))).toEqual([]);
    expect(times(cursor.take(12.01))).toEqual([12, 12]);
    expect(times(cursor.take(13.5))).toEqual([13]);
  });

  it('loops back to the loop point, not to the top', () => {
    const cursor = new SongCursor(song, { startTime: 0 });
    const notes = cursor.take(8.01);
    expect(times(notes)).toEqual([0, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 8]);
    expect(notes.filter((n) => n.channel === 'lead').map((n) => n.note.midi)).toEqual([60, 64, 64, 64, 64]);
    expect(cursor.endTime).toBeNull();
  });

  it('plays one pass and reports its end when not looping', () => {
    const cursor = new SongCursor(song, { startTime: 1, loop: false });
    expect(times(cursor.take(100))).toEqual([1, 3, 3, 4]);
    expect(cursor.endTime).toBe(5);
    expect(cursor.take(200)).toEqual([]);
  });

  it('converts holds, slides and one-shot lengths to seconds', () => {
    const notes = new SongCursor(song, { startTime: 0 }).take(2.01);
    expect(notes[0]?.note.hold).toBeCloseTo(1.5);
    const slide = notes.find((n) => n.channel === 'lead' && n.note.time === 2);
    expect(slide?.note.hold).toBeCloseTo(2);
    expect(slide?.note.slides).toEqual([{ after: 0.5, midi: 67 }]);
    expect(notes.find((n) => n.channel === 'drums')?.note.hold).toBeCloseTo(0.21);
  });

  it('can join part-way through, skipping what already passed', () => {
    const cursor = new SongCursor(song, { startTime: 0, notBefore: 2.5 });
    expect(times(cursor.take(4.01))).toEqual([3, 4, 4]);
  });
});
