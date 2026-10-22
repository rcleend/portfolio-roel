import { type Board, sharedPickers } from '../boards/board';
import { subjectsOf } from '../boards/catalog';
import type { Picker } from '../boards/subject';
import {
  defaultState,
  type Focus,
  type PlaygroundState,
  TILE_ZOOMS,
  type TileZoom,
  type Toggle,
} from './playgroundState';

/** Each toggle's URL key, short enough to type by hand. */
const TOGGLE_KEYS: readonly (readonly [Toggle, string])[] = [
  ['crt', 'crt'],
  ['reducedMotion', 'reduced'],
  ['sound', 'sound'],
];
const FOCUS_KEY = 'focus';
const ZOOM_KEY = 'zoom';

export interface UrlState {
  readonly state: PlaygroundState;
  /** What the query asked for that the page cannot show, in plain words. */
  readonly problems: readonly string[];
}

/**
 * The page a query describes:
 *
 *   ?lockups.backdrop=classic                                  a board's shared picks
 *   &focus=title&focus.lockup=classic&focus.backdrop=classic   the combination shown large
 *   &crt=1&reduced=1&sound=1&zoom=2                            toggles and tile zoom
 *
 * A link may name a variant this checkout does not have yet, so anything
 * unknown falls back to what the game shows today and is reported instead
 * of failing the page.
 */
export function readUrlState(search: string, boards: readonly Board[]): UrlState {
  const query = new URLSearchParams(search);
  const problems: string[] = [];
  const understood = new Set<string>();
  const take = (key: string): string | null => {
    understood.add(key);
    return query.get(key);
  };
  const pick = (key: string, picker: Picker): string => {
    const value = take(key);
    if (value === null) return picker.current;
    if (picker.choices.some((choice) => choice.id === value)) return value;
    const registered = picker.choices.map((choice) => choice.id).join(', ');
    problems.push(`${key}=${value}: no ${picker.label.toLowerCase()} by that id (registered: ${registered})`);
    return picker.current;
  };

  const shared = Object.fromEntries(
    boards.map((board) => [
      board.id,
      Object.fromEntries(sharedPickers(board).map((picker) => [picker.id, pick(`${board.id}.${picker.id}`, picker)])),
    ]),
  );

  let focus: Focus | null = null;
  const focused = take(FOCUS_KEY);
  if (focused !== null) {
    const subjects = subjectsOf(boards);
    const subject = subjects.find((candidate) => candidate.id === focused);
    if (subject) {
      const picks = subject.pickers.map((picker) => [picker.id, pick(`${FOCUS_KEY}.${picker.id}`, picker)]);
      focus = { subject, picks: Object.fromEntries(picks) };
    } else {
      const focusable = subjects.map((candidate) => candidate.id).join(', ');
      problems.push(`${FOCUS_KEY}=${focused}: nothing by that id to focus (${focusable})`);
    }
  }

  const toggles: Record<Toggle, boolean> = { crt: false, reducedMotion: false, sound: false };
  for (const [toggle, key] of TOGGLE_KEYS) {
    const value = take(key);
    if (value !== null && value !== '1' && value !== '0') problems.push(`${key}=${value}: expected 1 or 0`);
    toggles[toggle] = value === '1';
  }

  let zoom: TileZoom = 'auto';
  const zoomValue = take(ZOOM_KEY);
  if (zoomValue !== null) {
    const known = TILE_ZOOMS.find((factor) => String(factor) === zoomValue);
    if (known) zoom = known;
    else problems.push(`${ZOOM_KEY}=${zoomValue}: expected ${TILE_ZOOMS.join(', ')}`);
  }

  for (const key of new Set(query.keys())) {
    if (!understood.has(key)) problems.push(`${key}: not a playground setting`);
  }
  return { state: { ...defaultState(boards), shared, focus, ...toggles, zoom }, problems };
}

/** The query for `state`, without the `?`; empty for the page as it opens. */
export function writeUrlState(state: PlaygroundState, boards: readonly Board[]): string {
  const query = new URLSearchParams();
  for (const board of boards) {
    for (const picker of sharedPickers(board)) {
      const choice = state.shared[board.id]?.[picker.id];
      if (choice !== undefined && choice !== picker.current) query.set(`${board.id}.${picker.id}`, choice);
    }
  }
  if (state.focus) {
    const { subject, picks } = state.focus;
    query.set(FOCUS_KEY, subject.id);
    // Every pick is spelled out, so a shared combination still means the same once a winner becomes the default.
    for (const picker of subject.pickers) query.set(`${FOCUS_KEY}.${picker.id}`, picks[picker.id] ?? picker.current);
  }
  for (const [toggle, key] of TOGGLE_KEYS) if (state[toggle]) query.set(key, '1');
  if (state.zoom !== 'auto') query.set(ZOOM_KEY, String(state.zoom));
  return query.toString();
}
