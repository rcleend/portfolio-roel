import { describe, expect, it } from 'vitest';
import type { Patch } from './patch';
import { pitchPoints } from './voiceNote';

const square: Patch = { wave: { type: 'pulse', duty: 0.5 }, env: { attack: 0, decay: 0, sustain: 1, release: 0.1 } };

describe('pitchPoints', () => {
  it('holds the note pitch, including detune, when nothing moves it', () => {
    expect(pitchPoints({ ...square, detune: 5 }, { time: 1, hold: 0.5, midi: 60, detune: -2 })).toEqual([
      { kind: 'set', value: 3, time: 1 },
    ]);
  });

  it('sweeps from an offset to the note', () => {
    const kick: Patch = { ...square, sweep: { from: 24, time: 0.05 } };
    expect(pitchPoints(kick, { time: 0, hold: 0.1, midi: 36 })).toEqual([
      { kind: 'set', value: 2400, time: 0 },
      { kind: 'linear', value: 0, time: 0.05 },
    ]);
  });

  it('cycles arpeggio offsets at the patch speed until the release ends', () => {
    const points = pitchPoints({ ...square, arpSpeed: 0.05 }, { time: 2, hold: 0.2, midi: 60, arpeggio: [0, 4, 7] });
    expect(points.map((point) => point.value)).toEqual([0, 400, 700, 0, 400, 700]);
    expect(points[5]?.time).toBeCloseTo(2.25);
    expect(points.every((point) => point.kind === 'set')).toBe(true);
  });

  it('glides legato between slide targets', () => {
    const points = pitchPoints(
      { ...square, glide: 0.1 },
      { time: 0, hold: 1, midi: 60, slides: [{ after: 0.5, midi: 67 }] },
    );
    expect(points).toEqual([
      { kind: 'set', value: 0, time: 0 },
      { kind: 'set', value: 0, time: 0.5 },
      { kind: 'linear', value: 700, time: 0.6 },
    ]);
  });
});
