import { describe, expect, it } from 'vitest';
import {
  GUIDE_STORAGE_KEY,
  type GuideProgress,
  loadGuideProgress,
  recordTour,
  saveGuideProgress,
} from './guideProgress';

const fresh: GuideProgress = { toured: false };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    data,
  };
}

describe('the room guide', () => {
  it('remembers the tour once', () => {
    const toured = recordTour(fresh);
    expect(toured).toEqual({ toured: true });
    expect(recordTour(toured)).toBe(toured);
  });

  it('persists the tour, keeps it from records the earlier hints wrote, and tolerates garbage', () => {
    expect(loadGuideProgress(memoryStorage({ [GUIDE_STORAGE_KEY]: '{"toured":"yes"' }))).toEqual(fresh);
    const earlier = memoryStorage({ [GUIDE_STORAGE_KEY]: '{"lookedAround":true,"returned":true,"toured":true}' });
    expect(loadGuideProgress(earlier)).toEqual({ toured: true });
    const storage = memoryStorage();
    saveGuideProgress(storage, { toured: true });
    expect(loadGuideProgress(storage)).toEqual({ toured: true });
    expect(loadGuideProgress(null)).toEqual(fresh);
  });
});
