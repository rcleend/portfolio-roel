import { describe, expect, it } from 'vitest';
import type { FlagStorage } from '../../storage/localFlag';
import {
  learn,
  loadRadioHints,
  RADIO_HINT_STORAGE_KEY,
  radioHintFor,
  radioHintText,
  saveRadioHints,
} from './radioHints';

function memory(initial: Record<string, string> = {}): FlagStorage & { readonly data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('radio hints', () => {
  it('teach choosing a CD first, then (with a mouse) leaving, then nothing', () => {
    let progress = loadRadioHints(memory());
    expect(radioHintFor(progress, false)).toBe('pick');
    progress = learn(progress, 'pickedCd');
    expect(radioHintFor(progress, false)).toBe('leave');
    expect(radioHintFor(progress, true)).toBeNull();
    progress = learn(progress, 'leftRadio');
    expect(radioHintFor(progress, false)).toBeNull();
  });

  it('a visitor who left before choosing never needs the leave line', () => {
    const progress = learn(learn(loadRadioHints(null), 'leftRadio'), 'pickedCd');
    expect(radioHintFor(progress, false)).toBeNull();
  });

  it('words them for the input in use, a heading and a line', () => {
    expect(radioHintText('pick', 'mouse')).toEqual({ title: 'Pick a CD', body: 'Click one to play' });
    expect(radioHintText('pick', 'touch')).toEqual({ title: 'Pick a CD', body: 'Tap one to play' });
    expect(radioHintText('pick', 'keyboard')).toEqual({ title: 'Pick a CD', body: 'Press Enter to play' });
    expect(radioHintText('leave', 'mouse')).toEqual({ title: 'Look around', body: 'Click anywhere outside the radio' });
    expect(radioHintText('leave', 'keyboard')).toEqual({ title: 'Look around', body: 'Press Escape to get up' });
  });

  it('persists, ignores unknown or wrong fields and survives broken storage', () => {
    const storage = memory({ [RADIO_HINT_STORAGE_KEY]: '{"pickedCd":true,"future":1,"leftRadio":"yes"}' });
    expect(loadRadioHints(storage)).toEqual({ pickedCd: true, leftRadio: false });
    saveRadioHints(storage, { pickedCd: true, leftRadio: true });
    expect(JSON.parse(storage.data[RADIO_HINT_STORAGE_KEY] ?? '')).toEqual({ pickedCd: true, leftRadio: true });
    expect(loadRadioHints(memory({ [RADIO_HINT_STORAGE_KEY]: 'not json' }))).toEqual({
      pickedCd: false,
      leftRadio: false,
    });
  });

  it('learning something known returns the same progress', () => {
    const progress = { pickedCd: true, leftRadio: false };
    expect(learn(progress, 'pickedCd')).toBe(progress);
  });
});
