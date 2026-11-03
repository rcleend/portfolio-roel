import { type CharacterId, characters, getExperience, getLevel, type LevelId, levels } from '@/content';

/** Persisted progress. Bump `version` and extend `migrate` when the shape changes. */
export interface SessionState {
  readonly version: 1;
  /**
   * The character picked on this visit: the mission select and the levels play as them, and the character select
   * comes back to them. Never stored: every visit starts the character select on the first of the roster, ENGINEER.
   */
  readonly characterId: CharacterId | null;
  readonly completed: readonly LevelId[];
  /** Collected highlight ids per level. */
  readonly highlights: Readonly<Partial<Record<LevelId, readonly string[]>>>;
  readonly bestScore: Readonly<Partial<Record<LevelId, number>>>;
  readonly bootSeen: boolean;
  readonly muted: boolean;
}

export const SESSION_STORAGE_KEY = 'reo-leo:session';

/** The subset of `Storage` the session needs, so tests can pass a plain object. */
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A first visit starts with the sound off (round six, item 36): turning it on is the visitor's choice, and is kept. */
export function defaultSession(): SessionState {
  return { version: 1, characterId: null, completed: [], highlights: {}, bestScore: {}, bootSeen: false, muted: true };
}

/**
 * Turns whatever was stored into a valid session. Never throws: unknown ids
 * are dropped, wrong types fall back to defaults, and data from an unknown
 * future version is discarded rather than trusted.
 */
export function migrate(raw: unknown): SessionState {
  if (!isRecord(raw)) return defaultSession();
  const version = raw.version ?? 0;
  if (version !== 0 && version !== 1) return defaultSession();
  // Version 0 (pre-release) had the same fields without a version tag; sanitising covers both.
  return sanitize(raw);
}

function sanitize(raw: Record<string, unknown>): SessionState {
  const fallback = defaultSession();
  const characterIds = new Set<string>(characters.map((character) => character.id));
  const levelIds = new Set<string>(levels.map((level) => level.id));
  const isLevelId = (value: unknown): value is LevelId => typeof value === 'string' && levelIds.has(value);

  const characterId =
    typeof raw.characterId === 'string' && characterIds.has(raw.characterId) ? (raw.characterId as CharacterId) : null;
  const completed = Array.isArray(raw.completed) ? [...new Set(raw.completed.filter(isLevelId))] : fallback.completed;

  const highlights: Partial<Record<LevelId, string[]>> = {};
  if (isRecord(raw.highlights)) {
    for (const [levelId, ids] of Object.entries(raw.highlights)) {
      if (!isLevelId(levelId) || !Array.isArray(ids)) continue;
      const known = new Set(getExperience(getLevel(levelId).experienceId).highlights.map((highlight) => highlight.id));
      highlights[levelId] = [...new Set(ids.filter((id): id is string => typeof id === 'string' && known.has(id)))];
    }
  }

  const bestScore: Partial<Record<LevelId, number>> = {};
  if (isRecord(raw.bestScore)) {
    for (const [levelId, score] of Object.entries(raw.bestScore)) {
      if (isLevelId(levelId) && typeof score === 'number' && Number.isFinite(score) && score >= 0) {
        bestScore[levelId] = Math.floor(score);
      }
    }
  }

  return {
    version: 1,
    characterId,
    completed,
    highlights,
    bestScore,
    bootSeen: typeof raw.bootSeen === 'boolean' ? raw.bootSeen : fallback.bootSeen,
    muted: typeof raw.muted === 'boolean' ? raw.muted : fallback.muted,
  };
}

/**
 * Session persistence. Storage failures (private mode, quota, disabled
 * cookies) degrade to an in-memory session instead of breaking the game.
 */
export class SessionStore {
  #state: SessionState;
  readonly #storage: SessionStorage | null;

  constructor(storage: SessionStorage | null) {
    this.#storage = storage;
    this.#state = this.#load();
  }

  get state(): SessionState {
    return this.#state;
  }

  /** Applies a change and persists it immediately; returns the new state. */
  update(change: (state: SessionState) => SessionState): SessionState {
    this.#state = migrate(change(this.#state));
    this.#save();
    return this.#state;
  }

  reset(): void {
    this.#state = defaultSession();
    try {
      this.#storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage unavailable: the in-memory reset is all we can do.
    }
  }

  #load(): SessionState {
    try {
      const stored = this.#storage?.getItem(SESSION_STORAGE_KEY);
      return stored ? { ...migrate(JSON.parse(stored)), characterId: null } : defaultSession();
    } catch {
      return defaultSession();
    }
  }

  #save(): void {
    try {
      this.#storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...this.#state, characterId: null }));
    } catch {
      // Keep playing with the in-memory state.
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
