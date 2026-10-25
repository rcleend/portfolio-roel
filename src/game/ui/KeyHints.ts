import type { Gfx } from '@/engine/gfx/Gfx';
import { pixels } from '@/engine/gfx/PixelArt';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import type { Action } from '../input/bindings';
import { palette } from '../palette';
import type { ButtonState } from './Button';

/** The menu keys a select screen offers; each one presses the action it is named after. */
export type HintKey = Extract<Action, 'confirm' | 'back'>;

/**
 * Colours of the control legends: lavender keys, quiet steel labels, and the
 * brighter pair a clickable key lights up in. The legends run along the foot
 * of the select screens, where the blueprint paper is banded at its
 * lightest, so quiet still has to clear 3:1 there.
 */
export const HINT_COLORS = {
  key: palette.lavender,
  label: palette.steel,
  litKey: palette.white,
  litLabel: palette.lavender,
} as const;

/**
 * Top row of a legend glyph `height` px tall beside a label drawn at `y`.
 * Glyphs stand on the label's shadow row, one below the baseline, which
 * centres a 7 px key on the label face's capitals (they sit low in its cell).
 */
export function legendGlyphTop(y: number, style: TextStyle, height: number): number {
  return y + style.font.ascent + 1 - height;
}

/** Where a legend sits: its right edge, and the top of its text row as `gfx.text` takes it. */
export interface KeyHintsAnchor {
  readonly right: number;
  readonly y: number;
}

export interface KeyHintsOptions extends KeyHintsAnchor {
  /** The label face; colours come from `HINT_COLORS`. */
  readonly style: TextStyle;
}

const ORDER: readonly HintKey[] = ['confirm', 'back'];
const LABELS: Readonly<Record<HintKey, string>> = { confirm: 'CONFIRM', back: 'BACK' };

/** ⏎ and ⌫ at the height of the d-pad triangles, so a legend that mixes them keeps one rhythm. */
const GLYPHS: Readonly<Record<HintKey, readonly string[]>> = {
  confirm: pixels(`
    ........##
    ..#.....##
    .##.....##
    ##########
    ##########
    .##.......
    ..#.......
  `),
  back: pixels(`
    ...#########
    ..###.###.##
    .#####.#.###
    #######.####
    .#####.#.###
    ..###.###.##
    ...#########
  `),
};
const GLYPH_HEIGHT = 7;

/** The d-pad legend's spacing: key to label, and hint to hint. */
const LABEL_GAP = 4;
const HINT_GAP = 12;
/** How far a hit area reaches above and below the row, so a fingertip need not land on 7 px of key. */
const REACH = 12;

interface Hint {
  readonly key: HintKey;
  readonly glyphX: number;
  readonly labelX: number;
  readonly area: Rect;
}

/**
 * The ⏎ CONFIRM and ⌫ BACK legend that closes a select screen's controls,
 * right-aligned on its anchor. Unlike the d-pad legend the keys are buttons:
 * pointing lights one up, pressing sinks it a pixel, and releasing on it
 * clicks. Holding the real key sinks its picture too, so the legend always
 * shows which key is down.
 */
export class KeyHints {
  readonly #hints: readonly Hint[];
  readonly #y: number;
  readonly #glyphY: number;
  readonly #label: TextStyle;
  readonly #litLabel: TextStyle;
  #hover: HintKey | null = null;
  #armed: HintKey | null = null;
  #held: ReadonlySet<HintKey> = new Set();

  constructor(options: KeyHintsOptions) {
    const { style, right, y } = options;
    this.#y = y;
    this.#glyphY = legendGlyphTop(y, style, GLYPH_HEIGHT);
    this.#label = { ...style, fill: HINT_COLORS.label };
    this.#litLabel = { ...style, fill: HINT_COLORS.litLabel };

    const top = Math.min(y, this.#glyphY);
    const bottom = Math.max(y + style.font.cellHeight, this.#glyphY + GLYPH_HEIGHT);
    const widths = ORDER.map((key) => glyphWidth(key) + LABEL_GAP + style.font.measure(LABELS[key]));
    let x = right - widths.reduce((sum, width) => sum + width, 0) - HINT_GAP * (widths.length - 1);
    this.#hints = ORDER.map((key, index) => {
      const width = widths[index] ?? 0;
      // Neighbouring areas split the gap between them, so every point of the row belongs to one key.
      const area = { x: x - HINT_GAP / 2, y: top - REACH, w: width + HINT_GAP, h: bottom - top + REACH * 2 };
      const hint = { key, glyphX: x, labelX: x + glyphWidth(key) + LABEL_GAP, area };
      x += width + HINT_GAP;
      return hint;
    });
  }

  /** The pointer area of `key`: the key and its label plus a finger-sized margin. */
  area(key: HintKey): Rect {
    const hint = this.#hints.find((candidate) => candidate.key === key);
    if (!hint) throw new Error(`No key hint for "${key}"`);
    return hint.area;
  }

  /** The key whose area contains (x, y), if any. */
  hitTest(x: number, y: number): HintKey | null {
    return this.#hints.find((hint) => containsPoint(hint.area, x, y))?.key ?? null;
  }

  /**
   * Advances one step and returns the key clicked on it, if any. Like a
   * `Button`, a key clicks on release and only while the pointer is still on
   * the key it pressed, so sliding off cancels.
   */
  update(input: InputSnapshot<Action>): HintKey | null {
    const { pointer } = input;
    this.#hover = pointer.over ? this.hitTest(pointer.x, pointer.y) : null;
    this.#held = new Set(ORDER.filter((key) => input.isDown(key)));
    if (pointer.pressed) this.#armed = this.#hover;
    const clicked = pointer.released && this.#armed === this.#hover ? this.#armed : null;
    if (!pointer.down) this.#armed = null;
    return clicked;
  }

  /** How `key` looks: pressed while the pointer holds it down or its real key is held, lit while pointed at. */
  state(key: HintKey): ButtonState {
    if (this.#held.has(key) || (this.#armed === key && this.#hover === key)) return 'pressed';
    return this.#hover === key ? 'hover' : 'normal';
  }

  render(gfx: Gfx): void {
    for (const hint of this.#hints) {
      const state = this.state(hint.key);
      const lit = state !== 'normal';
      // A pressed key sinks a pixel, the way a real key travels; its label stays put beside it.
      const sink = state === 'pressed' ? 1 : 0;
      drawGlyph(gfx, GLYPHS[hint.key], hint.glyphX, this.#glyphY + sink, lit ? HINT_COLORS.litKey : HINT_COLORS.key);
      gfx.text(LABELS[hint.key], hint.labelX, this.#y, lit ? this.#litLabel : this.#label);
    }
  }
}

function glyphWidth(key: HintKey): number {
  return GLYPHS[key][0]?.length ?? 0;
}

/** Paints a one-colour mask (`#` ink, `.` clear) with its top-left at (x, y), one rectangle per run. */
function drawGlyph(gfx: Gfx, rows: readonly string[], x: number, y: number, color: string): void {
  rows.forEach((row, dy) => {
    let start = -1;
    for (let dx = 0; dx <= row.length; dx++) {
      const ink = row[dx] === '#';
      if (ink && start < 0) start = dx;
      if (!ink && start >= 0) {
        gfx.fillRect(x + start, y + dy, dx - start, 1, color);
        start = -1;
      }
    }
  });
}
