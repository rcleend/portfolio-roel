import type { Gfx } from '@/engine/gfx/Gfx';
import { layoutText } from '@/engine/gfx/TextStyle';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import type { TextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { palette } from '../../../palette';
import type { ButtonState } from '../../../ui/Button';
import { drawKeyCap, keyCapWidth } from '../../../ui/hud/KeyCap';
import { type ControlDevice, type KeyCapLabel, keyCapFor } from '../../../ui/hud/keyLabels';

/** When the hints show, in seconds of scene time: from just after the level opens, for as long as it lasts. */
export const HINTS = { from: 1.2 } as const;

/** The actions the strip's keys press. */
export type HintAction = Extract<Action, 'left' | 'right' | 'jump' | 'attack' | 'skill1' | 'skill2' | 'pause'>;

/** What the mouse does with the strip's keys on one step. */
export interface HintPresses {
  /** Keys held down under the mouse. */
  readonly held: ReadonlySet<HintAction>;
  /** Keys the mouse pressed this step. */
  readonly pressed: ReadonlySet<HintAction>;
}

interface Hint {
  readonly actions: readonly HintAction[];
  readonly label: string;
}

const HINT_ROW: readonly Hint[] = [
  { actions: ['left', 'right'], label: 'MOVE' },
  { actions: ['jump'], label: 'JUMP' },
  { actions: ['attack'], label: 'ATTACK' },
  { actions: ['skill1', 'skill2'], label: 'SKILLS' },
  { actions: ['pause'], label: 'PAUSE' },
];

const GAP = 7;
const Y = 225;
/** The strip's top row; from here down the screen is the HUD's. */
const STRIP_TOP = Y - 4;
const NOTHING: HintPresses = { held: new Set(), pressed: new Set() };

interface Key {
  /** The actions the cap stands for: one, or both directions on the touch pad's d-pad. */
  readonly actions: readonly HintAction[];
  readonly cap: KeyCapLabel;
  readonly x: number;
  /**
   * Where the mouse presses each action: the cap (a d-pad split down the middle) and, for a hint of one key, its
   * label too, over the strip's whole height.
   */
  readonly areas: readonly { readonly action: HintAction; readonly rect: Rect }[];
}

interface Label {
  readonly text: string;
  readonly x: number;
  readonly actions: readonly HintAction[];
}

interface Layout {
  readonly keys: readonly Key[];
  readonly labels: readonly Label[];
}

/**
 * The top of the hints' strip once it shows, or null before: the screen
 * rows from there down are the HUD's.
 */
export function controlHintsTop(time: number): number | null {
  return time < HINTS.from ? null : STRIP_TOP;
}

/**
 * A strip of key caps along the bottom of the level, there the whole time:
 * the keys, the gamepad's buttons or, on a touch screen, the pad's own
 * controls (its d-pad once for both directions). With a mouse the caps are
 * the keys themselves: pointing at one lights it, pressing it presses its
 * action (and sinks it a pixel) for as long as the button is held on it, so
 * a visitor can play from the strip alone. Holding the real key sinks its
 * cap too.
 */
export class ControlHints {
  readonly #text: TextStyles;
  readonly #layouts = new Map<ControlDevice, Layout>();
  #hover: HintAction | null = null;
  #armed: HintAction | null = null;
  #keysDown: ReadonlySet<HintAction> = new Set();

  constructor(text: TextStyles) {
    this.#text = text;
  }

  /** True where the strip is up at `time`: the mouse there is on its keys, not in the play. */
  covers(y: number, time: number): boolean {
    return time >= HINTS.from && y >= STRIP_TOP;
  }

  /** The action of the key under native pixel (x, y), if any. */
  hitTest(x: number, y: number, device: ControlDevice): HintAction | null {
    for (const key of this.#layout(device).keys) {
      for (const area of key.areas) if (containsPoint(area.rect, x, y)) return area.action;
    }
    return null;
  }

  /**
   * Advances one step: which key the mouse points at, presses and holds. Only a mouse plays the strip, the touch
   * pad being a finger's; `active` is false while the strip is hidden.
   */
  update(input: InputSnapshot<Action>, device: ControlDevice, active: boolean): HintPresses {
    const { pointer } = input;
    this.#keysDown = new Set(HINT_ROW.flatMap((hint) => hint.actions).filter((action) => input.isDown(action)));
    const mouse = active && pointer.kind === 'mouse' && pointer.over;
    this.#hover = mouse ? this.hitTest(pointer.x, pointer.y, device) : null;
    input.clickable(this.#hover !== null);
    if (!pointer.down || !mouse) this.#armed = null;
    if (!mouse) return NOTHING;
    const pressed = pointer.pressed && this.#hover !== null ? this.#hover : null;
    if (pressed) this.#armed = pressed;
    // Sliding off a key lets go of it, like a finger off a button.
    const held = this.#armed !== null && this.#armed === this.#hover && pointer.down ? this.#armed : null;
    if (!held && !pressed) return NOTHING;
    return { held: new Set(held ? [held] : []), pressed: new Set(pressed ? [pressed] : []) };
  }

  /** How `action`'s key looks: pressed while the mouse holds it or its real key is down, lit while pointed at. */
  state(action: HintAction): ButtonState {
    if (this.#keysDown.has(action) || (this.#armed === action && this.#hover === action)) return 'pressed';
    return this.#hover === action ? 'hover' : 'normal';
  }

  render(gfx: Gfx, device: ControlDevice, time: number): void {
    if (time < HINTS.from) return;
    const text = this.#text;
    const layout = this.#layout(device);
    gfx.fillRect(0, Y - 3, gfx.width, 16, '#0b0a1f');
    gfx.fillRect(0, STRIP_TOP, gfx.width, 1, '#3d2f8f');
    for (const key of layout.keys) drawKeyCap(gfx, key.x, Y - 1, key.cap, text.label, this.#capState(key.actions));
    const lit = { ...text.hud, fill: palette.gold };
    for (const label of layout.labels) {
      gfx.text(label.text, label.x, Y + 1, this.#capState(label.actions) === 'normal' ? text.hud : lit);
    }
  }

  /** The look of a cap or label standing for `actions`: the most pressed of theirs. */
  #capState(actions: readonly HintAction[]): ButtonState {
    const states = actions.map((action) => this.state(action));
    return states.includes('pressed') ? 'pressed' : states.includes('hover') ? 'hover' : 'normal';
  }

  #layout(device: ControlDevice): Layout {
    const cached = this.#layouts.get(device);
    if (cached) return cached;
    const text = this.#text;
    const items = HINT_ROW.map((hint) => ({ ...hint, caps: capsFor(hint.actions, device) }));
    const widthOf = (caps: readonly { cap: KeyCapLabel }[], label: string): number =>
      caps.reduce((sum, { cap }) => sum + keyCapWidth(cap, text.label) + 1, 0) + 2 + layoutText(text.hud, label).width;
    const total = items.reduce((sum, item) => sum + widthOf(item.caps, item.label), 0) + GAP * (items.length - 1);
    const keys: Key[] = [];
    const labels: Label[] = [];
    let x = Math.round((320 - total) / 2);
    for (const item of items) {
      const start = x;
      const first = keys.length;
      for (const { actions, cap } of item.caps) {
        const width = keyCapWidth(cap, text.label);
        const share = (width + 2) / actions.length;
        const areas = actions.map((action, index) => ({
          action,
          rect: { x: x - 1 + share * index, y: STRIP_TOP, w: share, h: 240 - STRIP_TOP },
        }));
        keys.push({ actions, cap, x, areas });
        x += width + 1;
      }
      x += 2;
      const labelWidth = layoutText(text.hud, item.label).width;
      labels.push({ text: item.label, x, actions: item.actions });
      // A hint of one key takes its label too, and half the gap either side: the whole hint is the button.
      const only = keys.length === first + 1 ? keys[first] : undefined;
      const area = only?.areas.length === 1 ? only.areas[0] : undefined;
      if (only && area) {
        const rect = { ...area.rect, x: start - 3, w: x + labelWidth + 3 - (start - 3) };
        keys[first] = { ...only, areas: [{ action: area.action, rect }] };
      }
      x += labelWidth + GAP;
    }
    const layout = { keys, labels };
    this.#layouts.set(device, layout);
    return layout;
  }
}

/** The caps to draw for a hint's actions: one per distinct cap, the d-pad once for both of MOVE's directions. */
function capsFor(actions: readonly HintAction[], device: ControlDevice): { actions: HintAction[]; cap: KeyCapLabel }[] {
  const caps: { actions: HintAction[]; cap: KeyCapLabel; key: string }[] = [];
  for (const action of actions) {
    const cap = keyCapFor(action, device);
    const key = JSON.stringify(cap);
    const same = caps.find((candidate) => candidate.key === key);
    if (same) same.actions.push(action);
    else caps.push({ actions: [action], cap, key });
  }
  return caps;
}
