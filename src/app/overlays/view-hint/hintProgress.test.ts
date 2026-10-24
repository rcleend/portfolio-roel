import { describe, expect, it } from 'vitest';
import {
  hintFor,
  hintText,
  loadViewHintProgress,
  recordView,
  saveViewHintProgress,
  VIEW_HINT_STORAGE_KEY,
  type ViewHintProgress,
} from './hintProgress';

const fresh: ViewHintProgress = { lookedAround: false, returned: false, visitedComputer: false, leftComputer: false };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    data,
  };
}

describe('view hints', () => {
  it('teaches looking around first, then coming back, then retires', () => {
    expect(hintFor(fresh, 'tv', false)).toBe('look-around');
    const lookedAround = recordView(fresh, 'room');
    expect(hintFor(lookedAround, 'room', false)).toBe('return');
    expect(hintFor(lookedAround, 'tv', false)).toBeNull();
    const returned = recordView(lookedAround, 'tv');
    expect(returned).toEqual({ ...fresh, lookedAround: true, returned: true });
    expect(hintFor(returned, 'room', false)).toBeNull();
  });

  it('does not count the opening TV view as having come back', () => {
    expect(recordView(fresh, 'tv')).toBe(fresh);
  });

  it('teaches getting up from the computer until the visitor has done it once', () => {
    const seated = recordView(recordView(fresh, 'room'), 'pc');
    expect(seated).toMatchObject({ lookedAround: true, visitedComputer: true, leftComputer: false });
    expect(hintFor(seated, 'pc', false)).toBe('leave-computer');
    const up = recordView(seated, 'room');
    expect(up.leftComputer).toBe(true);
    expect(hintFor(up, 'pc', false)).toBeNull();
    // Still learning the way back to the TV.
    expect(hintFor(up, 'room', false)).toBe('return');
  });

  it('never shows the computer hint on touch screens', () => {
    expect(hintFor(recordView(fresh, 'pc'), 'pc', true)).toBeNull();
  });

  it('learns everything a single move teaches at once', () => {
    expect(recordView(fresh, 'pc')).toEqual({ ...fresh, lookedAround: true, visitedComputer: true });
    const seated = recordView(recordView(fresh, 'room'), 'pc');
    expect(recordView(seated, 'tv')).toEqual({
      lookedAround: true,
      returned: true,
      visitedComputer: true,
      leftComputer: true,
    });
  });

  it('persists progress and tolerates garbage', () => {
    const storage = memoryStorage({ [VIEW_HINT_STORAGE_KEY]: '{"lookedAround":"yes"' });
    expect(loadViewHintProgress(storage)).toEqual(fresh);
    saveViewHintProgress(storage, { ...fresh, lookedAround: true, leftComputer: true });
    expect(loadViewHintProgress(storage)).toEqual({ ...fresh, lookedAround: true, leftComputer: true });
    expect(loadViewHintProgress(null)).toEqual(fresh);
  });

  it('leaves the radio to its own hints', () => {
    for (const progress of [fresh, recordView(fresh, 'radio')]) {
      expect(hintFor(progress, 'radio', false)).toBeNull();
      expect(hintFor(progress, 'radio', true)).toBeNull();
    }
    // Sitting at the radio is looking around: the TV's hint retires, the way back is still taught.
    expect(recordView(fresh, 'radio')).toEqual({ ...fresh, lookedAround: true });
  });

  it('loads a record saved before the computer existed', () => {
    const storage = memoryStorage({ [VIEW_HINT_STORAGE_KEY]: '{"lookedAround":true,"returned":true}' });
    expect(loadViewHintProgress(storage)).toEqual({ ...fresh, lookedAround: true, returned: true });
  });

  it('speaks the right verb for the device', () => {
    expect(hintText('look-around', false)).toBe('Click outside the TV to look around');
    expect(hintText('return', false)).toBe('Click the computer, the radio or the TV to look closer');
    expect(hintText('return', true)).toBe('Tap the computer, the radio or the TV to look closer');
    expect(hintText('leave-computer', false)).toBe('Click outside the computer to look around');
  });
});
