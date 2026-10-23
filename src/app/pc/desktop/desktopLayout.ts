import { TASKBAR_HEIGHT } from './lunaTokens';

/**
 * Where everything sits on the desktop, in layout px. The only source of
 * positions for both renderers (the still painter and the DOM desktop), so
 * the still on the glass and the live screen line up exactly at the hand-off.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type DesktopIconId = 'cv' | 'projects' | 'arcade' | 'wastebasket';

export interface DesktopIconSlot {
  readonly id: DesktopIconId;
  readonly label: string;
  readonly cell: Rect;
  /** The 32 × 32 icon art. */
  readonly art: Rect;
  /** Up to two lines of label, centred under the art. */
  readonly labelBox: Rect;
}

export interface DesktopLayout {
  readonly width: number;
  readonly height: number;
  readonly taskbar: Rect;
  readonly start: Rect;
  /** The start button's orb mark, then the "start" text from `startTextX`. */
  readonly startMark: Rect;
  readonly startTextX: number;
  /** The first (and only) task button, for the open reader. */
  readonly taskButton: Rect;
  /** The notification area; the clock is centred in it. */
  readonly tray: Rect;
  readonly icons: readonly DesktopIconSlot[];
}

/** The icons in column order: the CV always first, the wastebasket last. */
export const DESKTOP_ICONS: readonly { readonly id: DesktopIconId; readonly label: string }[] = [
  { id: 'cv', label: 'Roel Leenders CV.pdf' },
  { id: 'projects', label: 'Projects' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'wastebasket', label: 'Wastebasket' },
];

export const CV_FILE_NAME = 'Roel Leenders CV.pdf';

const START_WIDTH = 100;
const TASK_BUTTONS_X = 106;
const TASK_BUTTON_WIDTH = 160;
const TASK_BUTTON_HEIGHT = 24;
const TASK_BUTTON_TOP = 3;
const TRAY_WIDTH = 84;

const ICON_COLUMN_X = 8;
const ICON_FIRST_Y = 10;
const ICON_CELL_WIDTH = 74;
const ICON_CELL_HEIGHT = 78;
const ICON_ART_SIZE = 32;
const ICON_ART_TOP = 4;
const ICON_LABEL_TOP = 40;
export const ICON_LABEL_WIDTH = 70;
export const ICON_LABEL_LINE_HEIGHT = 13;
export const ICON_LABEL_MAX_LINES = 2;

const START_MARK_SIZE = 16;
const START_MARK_X = 9;
const START_TEXT_GAP = 5;

export function desktopLayout(width: number, height: number): DesktopLayout {
  const taskbarTop = height - TASKBAR_HEIGHT;
  const tray = { x: width - TRAY_WIDTH, y: taskbarTop, width: TRAY_WIDTH, height: TASKBAR_HEIGHT };
  const fitting = Math.floor((taskbarTop - ICON_FIRST_Y) / ICON_CELL_HEIGHT);
  const count = Math.min(DESKTOP_ICONS.length, Math.max(1, fitting));
  const markY = taskbarTop + (TASKBAR_HEIGHT - START_MARK_SIZE) / 2;
  return {
    width,
    height,
    taskbar: { x: 0, y: taskbarTop, width, height: TASKBAR_HEIGHT },
    start: { x: 0, y: taskbarTop, width: START_WIDTH, height: TASKBAR_HEIGHT },
    startMark: { x: START_MARK_X, y: markY, width: START_MARK_SIZE, height: START_MARK_SIZE },
    startTextX: START_MARK_X + START_MARK_SIZE + START_TEXT_GAP,
    taskButton: {
      x: TASK_BUTTONS_X,
      y: taskbarTop + TASK_BUTTON_TOP,
      // Narrow layouts shorten the button rather than run it under the tray.
      width: Math.max(0, Math.min(TASK_BUTTON_WIDTH, tray.x - TASK_BUTTONS_X - TASK_BUTTON_TOP)),
      height: TASK_BUTTON_HEIGHT,
    },
    tray,
    icons: DESKTOP_ICONS.slice(0, count).map(({ id, label }, index) => {
      const cell = {
        x: ICON_COLUMN_X,
        y: ICON_FIRST_Y + index * ICON_CELL_HEIGHT,
        width: ICON_CELL_WIDTH,
        height: ICON_CELL_HEIGHT,
      };
      return {
        id,
        label,
        cell,
        art: {
          x: cell.x + (ICON_CELL_WIDTH - ICON_ART_SIZE) / 2,
          y: cell.y + ICON_ART_TOP,
          width: ICON_ART_SIZE,
          height: ICON_ART_SIZE,
        },
        labelBox: {
          x: cell.x + (ICON_CELL_WIDTH - ICON_LABEL_WIDTH) / 2,
          y: cell.y + ICON_LABEL_TOP,
          width: ICON_LABEL_WIDTH,
          height: ICON_LABEL_LINE_HEIGHT * ICON_LABEL_MAX_LINES,
        },
      };
    }),
  };
}

/** The centre of a rectangle: where the scripted cursor aims to open the CV. */
export function centreOf(rect: Rect): { readonly x: number; readonly y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
