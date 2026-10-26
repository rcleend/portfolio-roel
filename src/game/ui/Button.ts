import { shade } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import type { Action } from '../input/bindings';
import type { WindowTheme } from './theme';
import { drawWindow } from './Window';

export type ButtonState = 'normal' | 'hover' | 'pressed';

/** How far a hovered, focused or pressed button brightens its fill towards white. */
export const BUTTON_LIT = 0.18;

export interface ButtonOptions {
  readonly label: string;
  readonly bounds: Rect;
  readonly theme: WindowTheme;
  readonly style: TextStyle;
  /** Shown left of the button while it has keyboard/gamepad focus. */
  readonly cursor?: SpriteSheet<'point'>;
}

/**
 * A pixel button that works with the pointer and with focus-based keyboard or
 * gamepad navigation. It activates on release, like a real button: pressing
 * and dragging off cancels.
 */
export class Button {
  readonly options: ButtonOptions;
  #state: ButtonState = 'normal';
  #armed = false;
  #focused = false;
  #time = 0;

  constructor(options: ButtonOptions) {
    this.options = options;
  }

  get state(): ButtonState {
    return this.#state;
  }

  /** Advances one step; returns true on the step the button activates. */
  update(input: InputSnapshot<Action>, focused: boolean, dt: number): boolean {
    this.#time += dt;
    this.#focused = focused;
    const { pointer } = input;
    const over = pointer.over && containsPoint(this.options.bounds, pointer.x, pointer.y);
    if (over && pointer.pressed) this.#armed = true;

    let activated = false;
    if (this.#armed && pointer.released) {
      activated = over;
      this.#armed = false;
    }
    if (!pointer.down) this.#armed = false;

    const keyHeld = focused && input.isDown('confirm');
    if (focused && input.wasReleased('confirm')) activated = true;

    this.#state = (this.#armed && over) || keyHeld ? 'pressed' : over || focused ? 'hover' : 'normal';
    return activated;
  }

  render(gfx: Gfx): void {
    const { bounds, theme, style, label, cursor } = this.options;
    const pressed = this.#state === 'pressed';
    // Pressing sinks the face by one pixel; hovering brightens the fill one band.
    const face = pressed ? { ...bounds, y: bounds.y + 1, h: bounds.h - 1 } : bounds;
    const lit =
      this.#state === 'normal'
        ? theme
        : { ...theme, fill: { ...theme.fill, stops: theme.fill.stops.map((stop) => shade(stop, BUTTON_LIT)) } };
    drawWindow(gfx, face, lit);
    const text = gfx.measureText(label, style);
    const textX = face.x + Math.floor((face.w - text.width) / 2);
    const textY = face.y + Math.floor((face.h - text.height) / 2);
    gfx.text(label, textX, textY, style);
    if (this.#focused && cursor)
      gfx.sprite(cursor, 'point', this.#time, bounds.x - 2, bounds.y + Math.floor(bounds.h / 2));
  }
}
