import { describe, expect, it } from 'vitest';
import { centsToRatio, midiToHz, note, noteName, parseNote, transpose } from './pitch';

describe('pitch', () => {
  it('parses scientific pitch notation', () => {
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('F#3')).toBe(54);
    expect(parseNote('Bb2')).toBe(46);
    expect(parseNote('B#3')).toBe(60);
    expect(parseNote('Cb4')).toBe(59);
    expect(parseNote('C-1')).toBe(0);
  });

  it('rejects anything that is not a note', () => {
    for (const bad of ['', 'H4', 'c4', 'C', 'C##4', 'C44', 'k', '.']) expect(parseNote(bad)).toBeNull();
    expect(() => note('X9')).toThrow(/"X9"/);
  });

  it('names notes and transposes them in either spelling', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(61, 'flat')).toBe('Db4');
    expect(noteName(0)).toBe('C-1');
    expect(transpose('A2', 12)).toBe('A3');
    expect(transpose('F2', 3, 'flat')).toBe('Ab2');
    for (let midi = 0; midi < 128; midi++) expect(parseNote(noteName(midi, 'flat'))).toBe(midi);
  });

  it('converts to frequency in equal temperament', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.626, 3);
    expect(centsToRatio(1200)).toBe(2);
    expect(centsToRatio(-1200)).toBe(0.5);
  });
});
