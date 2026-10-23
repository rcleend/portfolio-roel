import type { PresentationMode } from '../presentation';

/**
 * The startup sequence as data (docs/PC.md › Storyboard): when the scripted
 * cursor moves, the CV is double-clicked, the splash talks and the reader
 * opens. t = 0 is the landing frame, the moment the room makes the screen
 * live. Nothing here waits on an animation: cues fire on timers, and the
 * window opens at `openAt` or as soon as the hidden reader is ready, whichever
 * is later.
 */

/** The first visit in a page load plays the whole show; later ones the short version. */
export type Visit = 'first' | 'warm';

export type SplashStatus = 'initializing' | 'preferences' | 'opening';

export const SPLASH_STATUS_TEXT: Readonly<Record<SplashStatus, string>> = {
  initializing: 'Initializing…',
  preferences: 'Reading preferences…',
  opening: 'Opening Roel Leenders CV.pdf…',
};

export type Cue =
  /** The scripted cursor fades in, at its start point or already resting on the CV. */
  | { readonly at: number; readonly kind: 'cursor'; readonly onIcon: boolean; readonly duration: number }
  /** It glides to the CV icon. */
  | { readonly at: number; readonly kind: 'glide'; readonly duration: number }
  /** The first click of the double-click selects the icon; `dip` is the cursor's press. */
  | { readonly at: number; readonly kind: 'select'; readonly dip: number }
  /** The second click: busy cursor, and the reader starts mounting out of sight. */
  | { readonly at: number; readonly kind: 'launch'; readonly dip: number }
  /** The splash appears (`duration` is its fade-in). */
  | { readonly at: number; readonly kind: 'splash'; readonly status: SplashStatus; readonly duration: number }
  /** The splash's status line changes. */
  | { readonly at: number; readonly kind: 'status'; readonly status: SplashStatus }
  /** After the window opened: the résumé page fades in. */
  | { readonly at: number; readonly kind: 'page'; readonly duration: number }
  /** After the window opened: the reader grows out of the glass to fill the viewport (pop-out). */
  | { readonly at: number; readonly kind: 'breakout'; readonly duration: number }
  /** The résumé is readable: focus moves into it and the scripted cursor bows out. */
  | { readonly at: number; readonly kind: 'read' };

export interface Storyboard {
  readonly visit: Visit;
  /** Cues timed from the landing frame. */
  readonly intro: readonly Cue[];
  /** The earliest time the window opens. */
  readonly openAt: number;
  /** Cues timed from the moment the window opened. */
  readonly afterOpen: readonly Cue[];
}

export interface StoryboardOptions {
  readonly visit: Visit;
  readonly reducedMotion: boolean;
  readonly mode: PresentationMode;
}

/** The scripted cursor's start point, as fractions of the desktop. */
export const CURSOR_START = { x: 0.62, y: 0.58 } as const;
export const CURSOR_FADE_IN_MS = 80;
export const CURSOR_FADE_OUT_MS = 100;
export const CURSOR_DIP_MS = 60;
/** Closing in the pop-out shrinks the reader back into the glass first. */
export const SHRINK_MS = 200;
/** The desktop holds this long after the window closed before the camera pulls back. */
export const CLOSE_BEAT_MS = 200;

export function storyboard({ visit, reducedMotion, mode }: StoryboardOptions): Storyboard {
  if (reducedMotion) {
    // No scripted cursor, glides, fades or zooms: the splash (first visit only) stands still until the reader is up.
    return visit === 'first'
      ? {
          visit,
          intro: [
            { at: 0, kind: 'launch', dip: 0 },
            { at: 0, kind: 'splash', status: 'opening', duration: 0 },
          ],
          openAt: 400,
          afterOpen: [{ at: 0, kind: 'read' }],
        }
      : { visit, intro: [{ at: 0, kind: 'launch', dip: 0 }], openAt: 0, afterOpen: [{ at: 0, kind: 'read' }] };
  }
  const breakout: readonly Cue[] = [
    { at: 150, kind: 'breakout', duration: 280 },
    { at: 430, kind: 'read' },
  ];
  if (visit === 'first') {
    return {
      visit,
      intro: [
        { at: 160, kind: 'cursor', onIcon: false, duration: CURSOR_FADE_IN_MS },
        { at: 240, kind: 'glide', duration: 520 },
        { at: 820, kind: 'select', dip: CURSOR_DIP_MS },
        { at: 960, kind: 'launch', dip: CURSOR_DIP_MS },
        { at: 1040, kind: 'splash', status: 'initializing', duration: 120 },
        { at: 1240, kind: 'status', status: 'preferences' },
        { at: 1440, kind: 'status', status: 'opening' },
      ],
      openAt: 1640,
      afterOpen:
        mode === 'pop-out'
          ? breakout
          : [
              { at: 60, kind: 'page', duration: 150 },
              { at: 210, kind: 'read' },
            ],
    };
  }
  return {
    visit,
    intro: [
      { at: 160, kind: 'cursor', onIcon: true, duration: CURSOR_FADE_IN_MS },
      { at: 240, kind: 'select', dip: CURSOR_DIP_MS },
      { at: 380, kind: 'launch', dip: CURSOR_DIP_MS },
    ],
    openAt: 460,
    afterOpen:
      mode === 'pop-out'
        ? breakout
        : [
            { at: 0, kind: 'page', duration: 120 },
            { at: 120, kind: 'read' },
          ],
  };
}

/** When the résumé is readable after landing, if the reader is ready by `openAt`. */
export function readableAt(board: Storyboard): number {
  const read = board.afterOpen.find((cue) => cue.kind === 'read');
  return board.openAt + (read?.at ?? 0);
}

/** Whether a cue moves or fades anything (reduced motion allows none). */
export function hasMotion(cue: Cue): boolean {
  return ('duration' in cue && cue.duration > 0) || ('dip' in cue && cue.dip > 0) || cue.kind === 'glide';
}
