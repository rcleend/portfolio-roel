import { containsPoint, type Rect } from '@/engine/math/Rect';
import type { KeyHintsAnchor } from '../../ui/KeyHints';

/**
 * Screen layout of the character select, in native pixels. One place for
 * every box, so drawing and pointer hit-testing can never disagree.
 *
 *   ◄ ┌card────┐ ►   PICK YOUR ROEL_
 *     │ stars  │     CLASS
 *     │  ROEL  │     bio …
 *     │pedestal│     SKILLS
 *     │        │     [icon] SKILL 1
 *     └────────┘     [icon] SKILL 2
 *   ◀▶ CHANGE                 ⏎ CONFIRM ⌫ BACK
 */

export const CARD: Rect = { x: 22, y: 18, w: 120, h: 190 };

/** Border thickness of the card frame; the starfield fills what is inside. */
export const CARD_BORDER = 5;

export const CARD_INNER: Rect = {
  x: CARD.x + CARD_BORDER,
  y: CARD.y + CARD_BORDER,
  w: CARD.w - CARD_BORDER * 2,
  h: CARD.h - CARD_BORDER * 2,
};

/** Where the character's feet stand, on top of the pedestal. */
export const STAGE = { x: CARD.x + CARD.w / 2, y: CARD.y + 150 } as const;

/** Vertical centre line both arrows sit on. */
export const ARROW_Y = CARD.y + Math.floor(CARD.h / 2);
/** Arrow tips at rest, a few pixels outside the card. */
export const ARROW_LEFT_TIP = { x: CARD.x - 15, y: ARROW_Y } as const;
export const ARROW_RIGHT_TIP = { x: CARD.x + CARD.w + 14, y: ARROW_Y } as const;
/** Generous click targets: the arrows themselves are only 8 px wide. */
export const ARROW_LEFT_HIT: Rect = { x: 0, y: ARROW_Y - 16, w: CARD.x, h: 32 };
export const ARROW_RIGHT_HIT: Rect = { x: CARD.x + CARD.w, y: ARROW_Y - 16, w: 20, h: 32 };

/** The details column on the right. */
export const DETAILS = { x: 170, w: 140 } as const;

/** The column top to bottom: the call to action level with the card's top, the class heading, the bio, SKILLS. */
export const PROMPT_Y = CARD.y;
export const NAME_Y = 33;
export const BIO_Y = 56;
export const SKILLS_Y = 124;

/** Skill slots are at least this big — classic's 16 px icons with their bevel — and grow with a look's icons. */
export const SKILL_SLOT_SIZE = 24;
/** The label face's cell height: a skill's name is centred on its slot. */
export const SKILL_NAME_HEIGHT = 8;
/** The skill rows stack under the SKILLS header, this far apart whatever their slots' size. */
const SKILL_ROWS_Y = SKILLS_Y + 14;
const SKILL_ROW_GAP = 4;

/** The class heading's row: the heading stands for the character, and the hand cursor points at it. */
export const NAME_ROW: Rect = { x: DETAILS.x, y: NAME_Y - 2, w: DETAILS.w, h: 16 };
/** The point the hand cursor's fingertip touches, just left of the class heading. */
export const CURSOR_ANCHOR = { x: NAME_ROW.x - 3, y: NAME_ROW.y + Math.floor(NAME_ROW.h / 2) } as const;

/** Top of the control legend's row, under the card. */
export const HINTS_Y = CARD.y + CARD.h + 10;
/** CONFIRM and BACK close the legend, flush with the details column's right edge. */
export const KEY_HINTS: KeyHintsAnchor = { right: DETAILS.x + DETAILS.w, y: HINTS_Y };

/**
 * The only parts of the screen the pointer acts on besides the CONFIRM and BACK keys: the arrows, and the card (a
 * mouse click on it picks the hero on show). The skills are not among them.
 */
export type HitTarget = 'arrowLeft' | 'arrowRight' | 'card';

/** The parts of the screen that follow the size of the skill icons on show. */
export interface SelectLayout {
  readonly slotSize: number;
  /** A skill row: the bevelled icon slot plus the name beside it. Drawn only: it reacts to nothing. */
  readonly skillRows: readonly [Rect, Rect];
  /** What the pointer at (x, y) is over, if anything. */
  hitTest(x: number, y: number): HitTarget | null;
}

/**
 * The layout for skill slots of `slotSize`: classic's 24 px, or 32 px for a
 * look's 24 px icons. The rows grow down from the SKILLS header; even 32 px
 * rows end above the reach of the CONFIRM and BACK keys under them.
 */
export function selectLayout(slotSize = SKILL_SLOT_SIZE): SelectLayout {
  const row = (index: number): Rect => ({
    x: DETAILS.x,
    y: SKILL_ROWS_Y + index * (slotSize + SKILL_ROW_GAP),
    w: DETAILS.w,
    h: slotSize,
  });
  const skillRows = [row(0), row(1)] as const;
  const hitAreas: readonly (readonly [HitTarget, Rect])[] = [
    ['arrowLeft', ARROW_LEFT_HIT],
    ['arrowRight', ARROW_RIGHT_HIT],
    ['card', CARD],
  ];
  return {
    slotSize,
    skillRows,
    hitTest(x, y) {
      for (const [target, area] of hitAreas) if (containsPoint(area, x, y)) return target;
      return null;
    },
  };
}
