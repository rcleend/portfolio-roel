import { describe, expect, it } from 'vitest';
import {
  GUIDE_STORAGE_KEY,
  type GuideProgress,
  hintFor,
  loadGuideProgress,
  recordTour,
  recordView,
  saveGuideProgress,
} from './guideProgress';

const fresh: GuideProgress = { lookedAround: false, visitedComputer: false, leftComputer: false, toured: false };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    data,
  };
}

describe('the room guide', () => {
  it('teaches looking around until the visitor has left the TV once', () => {
    expect(hintFor(fresh, 'tv', false)).toBe('look-around');
    expect(hintFor(fresh, 'tv', true)).toBe('look-around');
    const lookedAround = recordView(fresh, 'room');
    expect(lookedAround).toEqual({ ...fresh, lookedAround: true });
    expect(hintFor(lookedAround, 'tv', false)).toBeNull();
  });

  it('leaves the room view to the overview', () => {
    expect(hintFor(fresh, 'room', false)).toBeNull();
    expect(hintFor(recordView(fresh, 'room'), 'room', true)).toBeNull();
  });

  it('does not count the opening TV view as having looked around', () => {
    expect(recordView(fresh, 'tv')).toBe(fresh);
  });

  it('teaches getting up from the computer until the visitor has done it once', () => {
    const seated = recordView(recordView(fresh, 'room'), 'pc');
    expect(seated).toMatchObject({ lookedAround: true, visitedComputer: true, leftComputer: false });
    expect(hintFor(seated, 'pc', false)).toBe('leave-computer');
    const up = recordView(seated, 'room');
    expect(up.leftComputer).toBe(true);
    expect(hintFor(up, 'pc', false)).toBeNull();
  });

  it('never shows the computer hint on touch screens', () => {
    expect(hintFor(recordView(fresh, 'pc'), 'pc', true)).toBeNull();
  });

  it('learns everything a single move teaches at once', () => {
    expect(recordView(fresh, 'pc')).toEqual({ ...fresh, lookedAround: true, visitedComputer: true });
    const seated = recordView(recordView(fresh, 'room'), 'pc');
    expect(recordView(seated, 'tv')).toEqual({
      ...fresh,
      lookedAround: true,
      visitedComputer: true,
      leftComputer: true,
    });
  });

  it('remembers the tour once', () => {
    const toured = recordTour(fresh);
    expect(toured).toEqual({ ...fresh, toured: true });
    expect(recordTour(toured)).toBe(toured);
  });

  it('persists progress, keeps what the earlier hints learnt and tolerates garbage', () => {
    expect(loadGuideProgress(memoryStorage({ [GUIDE_STORAGE_KEY]: '{"lookedAround":"yes"' }))).toEqual(fresh);
    // A record the view hints wrote, with the field they had for coming back to the TV.
    const earlier = memoryStorage({ [GUIDE_STORAGE_KEY]: '{"lookedAround":true,"returned":true,"leftComputer":true}' });
    expect(loadGuideProgress(earlier)).toEqual({ ...fresh, lookedAround: true, leftComputer: true });
    const storage = memoryStorage();
    saveGuideProgress(storage, { ...fresh, lookedAround: true, toured: true });
    expect(loadGuideProgress(storage)).toEqual({ ...fresh, lookedAround: true, toured: true });
    expect(loadGuideProgress(null)).toEqual(fresh);
  });

  it('leaves the radio to its own hints', () => {
    for (const progress of [fresh, recordView(fresh, 'radio')]) {
      expect(hintFor(progress, 'radio', false)).toBeNull();
      expect(hintFor(progress, 'radio', true)).toBeNull();
    }
    // Sitting at the radio is looking around: the TV's hint retires.
    expect(recordView(fresh, 'radio')).toEqual({ ...fresh, lookedAround: true });
  });
});
