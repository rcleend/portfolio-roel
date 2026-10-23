/**
 * The desktop's visual tokens, an original take on the 2001 "Luna" look.
 * The still painter draws its gradients from these stop arrays and the DOM
 * desktop applies the very same arrays inline, so the two can only agree.
 */

/** One colour stop; `offset` runs 0–1 along the gradient line. */
export interface GradientStop {
  readonly offset: number;
  readonly color: string;
}

/** System fonts only: nothing is downloaded, and the painter and the DOM resolve the same face. */
export const UI_FONT_FAMILY = 'Tahoma, Verdana, "Segoe UI", "DejaVu Sans", sans-serif';
export const TITLE_FONT_FAMILY = '"Trebuchet MS", Tahoma, sans-serif';

/** Canvas `font` strings; the CSS spells the same shorthand. */
export const LABEL_FONT = `11px ${UI_FONT_FAMILY}`;
export const CLOCK_FONT = `11px ${UI_FONT_FAMILY}`;
export const START_FONT = `italic bold 18px ${TITLE_FONT_FAMILY}`;

export const TASKBAR_HEIGHT = 30;

/** Stops given in px from the top of the taskbar, as the design spells them. */
const px = (value: number): number => value / TASKBAR_HEIGHT;

export const TASKBAR_STOPS: readonly GradientStop[] = [
  { offset: 0, color: '#3c81f3' },
  { offset: px(2), color: '#2a6ae0' },
  { offset: px(6), color: '#245edb' },
  { offset: 0.5, color: '#2157d7' },
  { offset: 0.92, color: '#1e4fc8' },
  { offset: 1, color: '#1941a5' },
];

export const START_STOPS: readonly GradientStop[] = [
  { offset: 0, color: '#5eb95e' },
  { offset: 0.45, color: '#3c9a3c' },
  { offset: 0.55, color: '#2f8a2f' },
  { offset: 1, color: '#3a9a3a' },
];
/** The start button's rounded right end. */
export const START_RADIUS = 14;

export const TRAY_STOPS: readonly GradientStop[] = [
  { offset: 0, color: '#1fa4f5' },
  { offset: px(3), color: '#0f8df0' },
  { offset: 1, color: '#0b69c7' },
];
/** The tray's bevelled left edge: a dark line, then a light one. */
export const TRAY_EDGE_DARK = '#0a4fb0';
export const TRAY_EDGE_LIGHT = '#39a6f2';

export const TASK_BUTTON = '#3c81f3';
export const TASK_BUTTON_PRESSED = '#1e52b7';

export const SELECTION = '#316ac5';
export const DESKTOP_TEXT = '#ffffff';
/** Label shadows are drawn as a second, offset copy of the text, which canvas shadows (device-space offsets) cannot match. */
export const LABEL_SHADOW = 'rgba(0, 0, 0, 0.75)';
export const START_SHADOW = 'rgba(0, 0, 0, 0.45)';

/** `linear-gradient(<direction>, <stops>)` for inline styles. */
export function cssGradient(direction: string, stops: readonly GradientStop[]): string {
  return `linear-gradient(${direction}, ${stops.map((stop) => `${stop.color} ${round(stop.offset * 100)}%`).join(', ')})`;
}

function round(percent: number): number {
  return Math.round(percent * 1000) / 1000;
}
