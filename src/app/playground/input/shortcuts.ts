/** What a key does on the playground. */
export type Shortcut =
  | { readonly type: 'replay' }
  | { readonly type: 'togglePlay' }
  | { readonly type: 'step'; readonly delta: -1 | 1 }
  /** Opens the nth numbered tile, counting from 0. */
  | { readonly type: 'focusTile'; readonly index: number }
  | { readonly type: 'close' };

/** How the element with keyboard focus uses keys itself: typing, sliding, or pressing. */
export type KeyOwner = 'text' | 'slider' | 'button' | null;

/** The parts of a key press a shortcut depends on. */
export interface KeyPress {
  readonly key: string;
  /** Ctrl, Cmd or Alt held: the browser's or the OS's key, not ours. */
  readonly modified: boolean;
  /** Held down and auto-repeating. */
  readonly repeat: boolean;
  readonly owner: KeyOwner;
}

const KEYS: Readonly<Record<string, Shortcut>> = {
  r: { type: 'replay' },
  R: { type: 'replay' },
  ' ': { type: 'togglePlay' },
  ArrowLeft: { type: 'step', delta: -1 },
  ArrowRight: { type: 'step', delta: 1 },
  Escape: { type: 'close' },
};

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * The shortcut a key press means: R replays, Space plays or pauses, ←/→
 * step a frame, 1–9 open a numbered tile and Esc closes it. Keys the focused
 * control uses itself stay with it (typing in a field, Space on a button,
 * arrows on the scrubber); Esc always closes. Only stepping auto-repeats.
 */
export function shortcutFor(press: KeyPress): Shortcut | null {
  const shortcut = KEYS[press.key] ?? digit(press.key);
  if (!shortcut) return null;
  if (shortcut.type === 'close') return shortcut;
  if (press.modified || (press.repeat && shortcut.type !== 'step')) return null;
  return ownsKey(press.owner, press.key) ? null : shortcut;
}

function digit(key: string): Shortcut | null {
  return /^[1-9]$/.test(key) ? { type: 'focusTile', index: Number(key) - 1 } : null;
}

function ownsKey(owner: KeyOwner, key: string): boolean {
  switch (owner) {
    case 'text':
      return true;
    case 'slider':
      return SLIDER_KEYS.has(key);
    case 'button':
      return key === ' ' || key === 'Enter';
    case null:
      return false;
  }
}

/** How `target`, usually the focused element, uses keys itself. */
export function keyOwnerOf(target: EventTarget | null): KeyOwner {
  if (!(target instanceof HTMLElement)) return null;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return 'text';
  }
  if (target instanceof HTMLInputElement) {
    if (target.type === 'range') return 'slider';
    return ['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type) ? 'button' : 'text';
  }
  return target instanceof HTMLButtonElement || target.tagName === 'SUMMARY' ? 'button' : null;
}
