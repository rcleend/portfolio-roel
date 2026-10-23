import { describe, expect, it } from 'vitest';
import { defaultSession, type SessionState } from '../../session';
import { clearActions } from './outcome';

const withCompleted = (...completed: SessionState['completed']): SessionState => ({ ...defaultSession(), completed });

describe('clearActions', () => {
  it('offers the next mission after the first stage', () => {
    expect(clearActions(withCompleted('luna'), 'luna')).toEqual(['next', 'missionSelect']);
  });

  it('offers only the mission select after the last stage while an earlier one is still open', () => {
    expect(clearActions(withCompleted('scripe'), 'scripe')).toEqual(['missionSelect']);
  });

  it('continues to the finale once every mission is cleared, whichever stage was replayed', () => {
    expect(clearActions(withCompleted('luna', 'scripe'), 'scripe')).toEqual(['finale', 'missionSelect']);
    expect(clearActions(withCompleted('scripe', 'luna'), 'luna')).toEqual(['finale', 'missionSelect']);
  });
});
