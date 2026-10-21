import { describe, expect, it } from 'vitest';
import type { Patch } from '../synth/patch';
import { compileSong, loopDuration, type Song, SongError, songDuration } from './song';

const tone: Patch = { wave: { type: 'pulse', duty: 0.5 }, env: { attack: 0, decay: 0.1, sustain: 0.5, release: 0.2 } };
const drum: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0, decay: 0.15, sustain: 0, release: 0.05 },
};

const base: Song = {
  bpm: 120,
  channels: {
    lead: { patch: tone },
    pad: { patch: tone, play: 'chord' },
    drums: {
      kit: {
        k: { patch: drum, note: 'C2' },
        s: [
          { patch: drum, note: 'D3' },
          { patch: tone, note: 'G3' },
        ],
      },
    },
  },
  patterns: {
    intro: { drums: 'k k k k' },
    A: { lead: 'C4 . E4 - | G4 . ~A4 .', pad: 'C3[47] | .', drums: 'k s k s | k s k s:4' },
  },
  sequence: ['intro', 'A', 'A+2'],
  loopFrom: 1,
};

describe('compileSong', () => {
  const compiled = compileSong(base, 'test');

  it('lays patterns end to end and records the loop point', () => {
    expect(compiled.ticksPerBar).toBe(96);
    expect(compiled.totalTicks).toBe(5 * 96);
    expect(compiled.loopTick).toBe(96);
    expect(songDuration(compiled)).toBeCloseTo(10);
    expect(loopDuration(compiled)).toBeCloseTo(8);
  });

  it('holds notes until the next note or note-off, and slides legato', () => {
    const lead = compiled.events.filter((event) => event.channel === 'lead');
    expect(lead.map((event) => [event.tick, event.midi, event.endTick])).toEqual([
      [96, 60, 144],
      [144, 64, 168],
      [192, 67, 288],
      [288, 62, 336],
      [336, 66, 360],
      [384, 69, 480],
    ]);
    expect(lead[2]?.slides).toEqual([{ tick: 240, midi: 69 }]);
  });

  it('transposes melodic channels but never drums', () => {
    const drumsIn = (from: number) =>
      compiled.events
        .filter((event) => event.channel === 'drums' && event.tick >= from && event.tick < from + 192)
        .map((event) => event.midi);
    expect(drumsIn(288)).toEqual(drumsIn(96));
    const pads = compiled.events.filter((event) => event.channel === 'pad');
    expect(pads.map((event) => event.midi)).toEqual([48, 50]);
    expect(pads[0]?.chord).toEqual([0, 4, 7]);
    expect(pads[0]?.arpeggio).toEqual([]);
  });

  it('layers kit pieces and keeps hits as one-shots', () => {
    const snares = compiled.events.filter((event) => event.channel === 'drums' && event.tick === 96 + 24);
    expect(snares).toHaveLength(2);
    expect(snares.every((event) => event.oneShot)).toBe(true);
    expect(compiled.events.find((event) => event.tick === 2 * 96 + 72 && event.channel === 'drums')?.velocity).toBe(
      0.5,
    );
  });

  it('releases a held note when the next pattern has no lane for its channel', () => {
    const held = compileSong({ ...base, sequence: ['A', 'intro'], loopFrom: undefined });
    const pad = held.events.find((event) => event.channel === 'pad');
    expect(pad?.endTick).toBe(192);
  });

  it('keeps the events sorted and accounts for release tails', () => {
    const ticks = compiled.events.map((event) => event.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    // The snare's tonal layer is a one-shot: decay 0.1 + release 0.2.
    expect(compiled.tail).toBeCloseTo(0.3);
  });

  it('reports authoring mistakes precisely', () => {
    const song = { ...base, loopFrom: undefined };
    expect(() => compileSong({ ...song, sequence: ['B'] }, 'demo')).toThrow(
      'demo: sequence entry "B" names no pattern',
    );
    expect(() => compileSong({ ...song, patterns: { A: { lead: 'C4', drums: 'k | k' } }, sequence: ['A'] })).toThrow(
      SongError,
    );
    expect(() => compileSong({ ...song, patterns: { A: { bass: 'C4' } }, sequence: ['A'] })).toThrow(
      /unknown channel "bass"/,
    );
    expect(() => compileSong({ ...song, patterns: { A: { drums: 'x' } }, sequence: ['A'] })).toThrow(
      /no kit piece "x"/,
    );
    expect(() => compileSong({ ...base, loopFrom: 3 })).toThrow(/loopFrom 3/);
  });
});
