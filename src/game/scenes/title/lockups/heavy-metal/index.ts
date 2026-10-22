import { LOCKUP_INK } from '../../../../art/logos';
import { lazy } from '../../../../art/logos/lazy';
import { palette } from '../../../../palette';
import { paintShelfLockup, type ShelfLockupRecipe } from '../shelfLockup';
import type { TitleLockup } from '../TitleLockup';
import { heavyMetalType } from './type';

/**
 * The name stamped from plate: a bold cut of the reference face, banded
 * cream with a lit top edge and a darker foot, beside the heaviest P of
 * the three, widened a little more than it is raised so it squats like the
 * "M" of METAL SLUG rather than towering.
 */
export const HEAVY_METAL: ShelfLockupRecipe = {
  initial: { x: 1.65, y: 1.62 },
  type: heavyMetalType,
  style: {
    face: ['#fff6da', palette.cream, palette.cream, palette.cream, '#d6c08b', '#c0a46c'],
    highlight: '#fffef0',
    outline: LOCKUP_INK,
    shadow: { color: '#1c0703', x: 1, y: 1 },
  },
  topLine: { x: 14, y: 50 },
  bottomLine: { x: 27, y: 98 },
};

export const heavyMetalLockup: TitleLockup<'heavy-metal'> = {
  id: 'heavy-metal',
  name: 'Heavy metal',
  description: 'A bold cut of the reference face stamped in banded cream, beside a broad, heavy P.',
  prepare: lazy(() => paintShelfLockup(HEAVY_METAL)),
};
