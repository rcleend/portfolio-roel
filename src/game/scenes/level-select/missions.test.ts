import { describe, expect, it } from 'vitest';
import { levels } from '@/content';
import { defaultSession, type SessionState } from '../../session';
import {
  allMissionsCleared,
  buildSlots,
  firstOpenLevel,
  formatYears,
  initialFocus,
  missionProgress,
  nextLevel,
  stampName,
} from './missions';

const session = (overrides: Partial<SessionState> = {}): SessionState => ({ ...defaultSession(), ...overrides });

describe('buildSlots', () => {
  it('lists every mission in career order, then the locked teaser', () => {
    const slots = buildSlots(session());
    expect(slots.map((slot) => (slot.kind === 'mission' ? slot.level.id : 'teaser'))).toEqual([
      ...levels.map((level) => level.id),
      'teaser',
    ]);
  });

  it('pairs each mission with its employer', () => {
    const [luna] = buildSlots(session());
    expect(luna?.kind === 'mission' && luna.experience.id).toBe('luna');
  });

  it('numbers the slots as companies in career order, the visitor’s team last', () => {
    expect(buildSlots(session()).map((slot) => slot.label)).toEqual(['COMPANY 1', 'COMPANY 2', 'COMPANY 3']);
  });
});

describe('missionProgress', () => {
  it('counts distinct known highlights against the total', () => {
    const progress = missionProgress(
      session({ completed: ['luna'], highlights: { luna: ['luna-agent', 'luna-agent', 'luna-exit'] } }),
      'luna',
    );
    expect(progress).toEqual({ cleared: true, collected: 2, total: 3 });
  });

  it('reports an untouched mission as not cleared with nothing collected', () => {
    expect(missionProgress(session(), 'scripe')).toEqual({ cleared: false, collected: 0, total: 4 });
  });
});

describe('initialFocus', () => {
  it('honours the requested mission', () => {
    expect(initialFocus(buildSlots(session()), 'scripe')).toBe(1);
  });

  it('defaults to the first mission not yet cleared', () => {
    expect(initialFocus(buildSlots(session()), undefined)).toBe(0);
    expect(initialFocus(buildSlots(session({ completed: ['luna'] })), undefined)).toBe(1);
  });

  it('points at the visitor’s team once every mission is cleared', () => {
    expect(initialFocus(buildSlots(session({ completed: ['luna', 'scripe'] })), undefined)).toBe(2);
  });
});

describe('mission order helpers', () => {
  it('finds the next mission in career order', () => {
    expect(nextLevel('luna')?.id).toBe('scripe');
    expect(nextLevel('scripe')).toBeNull();
  });

  it('knows when every mission is cleared and which one is still open', () => {
    expect(allMissionsCleared(session({ completed: ['scripe'] }))).toBe(false);
    expect(firstOpenLevel(session({ completed: ['scripe'] }))).toBe('luna');
    expect(allMissionsCleared(session({ completed: ['scripe', 'luna'] }))).toBe(true);
    expect(firstOpenLevel(session({ completed: ['scripe', 'luna'] }))).toBeUndefined();
  });
});

describe('postcard copy', () => {
  it('formats a closed and an ongoing role as years', () => {
    expect(formatYears({ start: '2022-04', end: '2024-10' })).toBe('2022–2024');
    expect(formatYears({ start: '2024-10', end: null })).toBe('2024–NOW');
  });

  it('shortens a company name to fit a stamp', () => {
    expect(stampName('Luna (Utopian Labs)')).toBe('LUNA');
    expect(stampName('Scripe')).toBe('SCRIPE');
  });
});
