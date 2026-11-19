/**
 * The keyboard's 104 keys: where each stands on the board and what is printed on it. Data only, shared by the worker
 * that builds the keys (keyboard.ts) and the page that paints their legends (deskArt.ts), so a key's print is found by
 * its place in this list.
 */
export interface Key {
  /** Its middle, across from the board's own middle and back from the board's front edge (metres). */
  readonly x: number;
  readonly d: number;
  /** Its foot: width across and depth back. */
  readonly w: number;
  readonly h: number;
  /** Its row, 0 at the front to 5 for the function keys: each row's caps lean their own way. */
  readonly row: number;
  /** What it prints; `upper` is the shifted sign above it. */
  readonly label: string;
  readonly upper?: string;
  /** A modifier or an editing key: moulded in the darker plastic. */
  readonly alt: boolean;
}

/** A key's pitch, both ways, and the gap between two caps. */
export const UNIT = 0.019;
const GAP = 0.0016;
/** The front of the lowest row's feet, and the six rows' middles, back from the board's front edge. */
const ROWS = [0.0335, 0.0525, 0.0715, 0.0905, 0.1095, 0.138] as const;
/** The left edge of the main block, of the editing keys and of the number pad, from the board's middle. */
const LEFT = -0.2225;
const NAV = LEFT + 0.3;
const PAD = LEFT + 0.369;

/** Where the keys' well lies in the board: across, and from front to back. */
export const WELL = {
  x0: LEFT - 0.004,
  x1: -LEFT + 0.004,
  d0: ROWS[0] - UNIT / 2 - 0.003,
  d1: ROWS[5] + UNIT / 2 + 0.003,
};

const SHIFTED: Readonly<Record<string, string>> = {
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
};

export function keyboardKeys(): Key[] {
  const keys: Key[] = [];
  const key = (x: number, row: number, label: string, alt: boolean, units = 1, rows = 1, shifted = true): void => {
    const d = rows === 1 ? ROWS[row] : ((ROWS[row] as number) + (ROWS[row - 1] as number)) / 2;
    keys.push({
      x,
      d: d as number,
      w: units * UNIT - GAP,
      h: rows * UNIT - GAP,
      row,
      label,
      ...(SHIFTED[label] && !alt && shifted ? { upper: SHIFTED[label] } : {}),
      alt,
    });
  };
  const run = (row: number, entries: readonly (readonly [number, string, boolean])[]): void => {
    let cursor = 0;
    for (const [units, label, alt] of entries) {
      key(LEFT + (cursor + units / 2) * UNIT, row, label, alt, units);
      cursor += units;
    }
  };
  const letters = (text: string): [number, string, boolean][] => [...text].map((c) => [1, c, false]);
  run(0, [
    [1.25, 'Ctrl', true],
    [1.25, 'Win', true],
    [1.25, 'Alt', true],
    [6.25, '', false],
    [1.25, 'Alt', true],
    [1.25, 'Win', true],
    [1.25, 'Menu', true],
    [1.25, 'Ctrl', true],
  ]);
  run(1, [[2.25, 'Shift', true], ...letters('ZXCVBNM,./'), [2.75, 'Shift', true]]);
  run(2, [[1.75, 'Caps', true], ...letters("ASDFGHJKL;'"), [2.25, 'Enter', true]]);
  run(3, [[1.5, 'Tab', true], ...letters('QWERTYUIOP[]'), [1.5, '\\', false]]);
  run(4, [...letters('`1234567890-='), [2, 'Back', true]]);
  key(LEFT + UNIT / 2, 5, 'Esc', true);
  for (let i = 0; i < 12; i++)
    key(LEFT + 0.048 + i * UNIT + Math.floor(i / 4) * 0.0075, 5, `F${i + 1}`, Math.floor(i / 4) !== 1);
  const three = (row: number, labels: readonly string[]): void =>
    labels.forEach((label, i) => void key(NAV + (i + 0.5) * UNIT, row, label, true));
  three(5, ['PrtSc', 'ScrLk', 'Pause']);
  three(4, ['Ins', 'Home', 'PgUp']);
  three(3, ['Del', 'End', 'PgDn']);
  three(0, ['←', '↓', '→']);
  key(NAV + 1.5 * UNIT, 1, '↑', true);
  const pad = (row: number, labels: readonly (string | null)[]): void =>
    labels.forEach((label, i) => {
      if (label === null) return;
      const tall = label === '+' || label === 'Enter';
      key(PAD + (i + 0.5) * UNIT, row, label, row === 4 || i === 3, 1, tall ? 2 : 1, false);
    });
  pad(4, ['Num', '/', '*', '-']);
  pad(3, ['7', '8', '9', '+']);
  pad(2, ['4', '5', '6', null]);
  pad(1, ['1', '2', '3', 'Enter']);
  key(PAD + UNIT, 0, '0', false, 2, 1, false);
  key(PAD + 2.5 * UNIT, 0, '.', false, 1, 1, false);
  return keys;
}
