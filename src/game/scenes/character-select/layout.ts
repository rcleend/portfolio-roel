import { containsPoint, type Rect } from '@/engine/math/Rect';
import type { FocusTarget } from './selectMachine';

/**
 * Screen layout of the character select, in native pixels. One place for
 * every box, so drawing and pointer hit-testing can never disagree.
 *
 *   ◄ ┌card────┐ ►   NAME ROEL
 *     │ stars  │     class
 *     │  ROEL  │     bio …
 *     │pedestal│     ATTACK …
 *     └────────┘     [icon] SKILL 1
 *                    [icon] SKILL 2
 *                              [SELECT]
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

export const NAME_Y = 22;
export const CLASS_Y = 40;
export const BIO_Y = 55;
export const ATTACK_Y = 120;

/** Skill slots are at least this big — classic's 16 px icons with their bevel — and grow with a look's icons. */
export const SKILL_SLOT_SIZE = 24;
const SKILLS_TOP = 134;
const SKILL_ROW_GAP = 2;

export const SELECT_BUTTON: Rect = { x: DETAILS.x + DETAILS.w - 72, y: CARD.y + CARD.h - 22, w: 72, h: 22 };

/** Where the card's focus is shown: the name heading stands for the character itself. */
export const NAME_ROW: Rect = { x: DETAILS.x, y: NAME_Y - 2, w: DETAILS.w, h: 16 };

export type HitTarget = FocusTarget | 'arrowLeft' | 'arrowRight';

/** The parts of the screen that follow the size of the skill icons on show. */
export interface SelectLayout {
  readonly slotSize: number;
  /** A skill row: the bevelled icon slot plus the name beside it. */
  readonly skillRows: readonly [Rect, Rect];
  /** What the pointer at (x, y) is over, if anything. */
  hitTest(x: number, y: number): HitTarget | null;
  /** The point the hand cursor's fingertip touches when `target` has focus. */
  cursorAnchor(target: FocusTarget): { readonly x: number; readonly y: number };
}

export function selectLayout(slotSize = SKILL_SLOT_SIZE): SelectLayout {
  const row = (index: number): Rect => ({
    x: DETAILS.x,
    y: SKILLS_TOP + index * (slotSize + SKILL_ROW_GAP),
    w: DETAILS.w,
    h: slotSize,
  });
  const skillRows = [row(0), row(1)] as const;
  // SELECT comes before the skills: a look's taller skill rows may reach down beside it.
  const hitAreas: readonly (readonly [HitTarget, Rect])[] = [
    ['arrowLeft', ARROW_LEFT_HIT],
    ['arrowRight', ARROW_RIGHT_HIT],
    ['card', CARD],
    ['select', SELECT_BUTTON],
    ['skill1', skillRows[0]],
    ['skill2', skillRows[1]],
  ];
  return {
    slotSize,
    skillRows,
    hitTest(x, y) {
      for (const [target, area] of hitAreas) if (containsPoint(area, x, y)) return target;
      return null;
    },
    cursorAnchor(target) {
      const focused =
        target === 'card' ? NAME_ROW : target === 'select' ? SELECT_BUTTON : skillRows[target === 'skill1' ? 0 : 1];
      return { x: focused.x - 3, y: focused.y + Math.floor(focused.h / 2) };
    },
  };
}
