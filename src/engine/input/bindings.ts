/** A gamepad stick direction counted as a button press once it passes the dead zone. */
export interface AxisBinding {
  /** Standard-mapping axis index (0 = left stick X, 1 = left stick Y). */
  readonly axis: number;
  readonly direction: -1 | 1;
}

/** Everything that triggers one action. */
export interface ActionBinding {
  /** `KeyboardEvent.code` values, e.g. `ArrowLeft`, `KeyZ` — layout-independent physical keys. */
  readonly keys?: readonly string[];
  /** Standard-mapping gamepad button indices (0 = A/Cross, 9 = Start, 12–15 = D-pad). */
  readonly buttons?: readonly number[];
  readonly axes?: readonly AxisBinding[];
}

export type InputBindings<A extends string> = Readonly<Record<A, ActionBinding>>;

/** Indices of the W3C "standard" gamepad mapping, for readable binding tables. */
export const GamepadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LeftBumper: 4,
  RightBumper: 5,
  Select: 8,
  Start: 9,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

export const GamepadAxis = { LeftX: 0, LeftY: 1 } as const;
