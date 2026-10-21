/** The subset of `Storage` app preferences need, so tests can pass a plain object. */
export type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Small app-only preferences (e.g. which hints the visitor has outgrown) that
 * do not belong in the game's versioned session. Storage failures (private
 * mode, disabled cookies) degrade to "not remembered" instead of throwing.
 */
export function readJson(storage: FlagStorage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: FlagStorage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered across visits; the current visit still behaves correctly.
  }
}

export function browserStorage(): FlagStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
