import { describe, expect, it } from 'vitest';
import { defaultSession, migrate, SESSION_STORAGE_KEY, type SessionStorage, SessionStore } from './session';

function memoryStorage(initial?: string): SessionStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === SESSION_STORAGE_KEY ? this.value : null;
    },
    setItem(_key, value) {
      this.value = value;
    },
    removeItem() {
      this.value = null;
    },
  };
}

describe('migrate', () => {
  it('returns defaults for anything that is not an object', () => {
    for (const raw of [null, 42, 'x', [], undefined]) expect(migrate(raw)).toEqual(defaultSession());
  });

  it('keeps a valid v1 session intact', () => {
    const valid = {
      version: 1,
      characterId: 'artsy',
      completed: ['luna'],
      highlights: { luna: ['luna-agent'] },
      bestScore: { luna: 1200 },
      bootSeen: true,
      muted: true,
    };
    expect(migrate(valid)).toEqual(valid);
  });

  it('upgrades an unversioned (v0) session', () => {
    expect(migrate({ characterId: 'hackerman', bootSeen: true })).toMatchObject({
      version: 1,
      characterId: 'hackerman',
      bootSeen: true,
    });
  });

  it('drops unknown ids, duplicates and wrongly typed fields', () => {
    const state = migrate({
      version: 1,
      characterId: 'wizard',
      completed: ['luna', 'luna', 'atlantis', 3],
      highlights: { luna: ['luna-agent', 'scripe-teams', 7], atlantis: ['x'], scripe: 'nope' },
      bestScore: { luna: -5, scripe: 99.9, atlantis: 1 },
      bootSeen: 'yes',
      muted: 1,
    });
    expect(state).toEqual({
      version: 1,
      characterId: null,
      completed: ['luna'],
      highlights: { luna: ['luna-agent'] },
      bestScore: { scripe: 99 },
      bootSeen: false,
      muted: true,
    });
  });

  it('starts a first visit with the sound off', () => {
    expect(defaultSession().muted).toBe(true);
  });

  it('discards data from an unknown future version', () => {
    expect(migrate({ version: 7, characterId: 'artsy' })).toEqual(defaultSession());
  });
});

describe('SessionStore', () => {
  it('loads, updates and persists', () => {
    const storage = memoryStorage(JSON.stringify({ version: 1, characterId: 'strategy' }));
    const store = new SessionStore(storage);
    expect(store.state.characterId).toBe('strategy');
    store.update((state) => ({ ...state, completed: [...state.completed, 'scripe'] }));
    expect(JSON.parse(storage.value ?? '{}').completed).toEqual(['scripe']);
  });

  it('survives corrupt JSON', () => {
    expect(new SessionStore(memoryStorage('{not json')).state).toEqual(defaultSession());
  });

  it('keeps working in memory when storage throws', () => {
    const broken: SessionStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const store = new SessionStore(broken);
    expect(store.update((state) => ({ ...state, muted: true })).muted).toBe(true);
    expect(() => store.reset()).not.toThrow();
  });

  it('works without storage at all', () => {
    const store = new SessionStore(null);
    store.update((state) => ({ ...state, bootSeen: true }));
    expect(store.state.bootSeen).toBe(true);
  });
});
