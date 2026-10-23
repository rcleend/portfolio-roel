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

const fresh: ViewHintProgress = { lookedAround: false, returned: false };

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
    expect(hintFor(fresh, 'tv')).toBe('look-around');
    const lookedAround = recordView(fresh, 'room');
    expect(hintFor(lookedAround, 'room')).toBe('return');
    expect(hintFor(lookedAround, 'tv')).toBeNull();
    const returned = recordView(lookedAround, 'tv');
    expect(returned).toEqual({ lookedAround: true, returned: true });
    expect(hintFor(returned, 'room')).toBeNull();
  });

  it('does not count the opening TV view as having come back', () => {
    expect(recordView(fresh, 'tv')).toBe(fresh);
  });

  it('persists progress and tolerates garbage', () => {
    const storage = memoryStorage({ [VIEW_HINT_STORAGE_KEY]: '{"lookedAround":"yes"' });
    expect(loadViewHintProgress(storage)).toEqual(fresh);
    saveViewHintProgress(storage, { lookedAround: true, returned: false });
    expect(loadViewHintProgress(storage)).toEqual({ lookedAround: true, returned: false });
    expect(loadViewHintProgress(null)).toEqual(fresh);
  });

  it('speaks the right verb for the device', () => {
    expect(hintText('look-around', false)).toBe('Click outside the TV to look around');
    expect(hintText('return', true)).toBe('Tap the TV to keep playing');
  });
});
