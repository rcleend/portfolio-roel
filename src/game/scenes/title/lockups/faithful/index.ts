import { LOCKUP_INK } from '../../../../art/logos';
import { lazy } from '../../../../art/logos/lazy';
import { palette } from '../../../../palette';
import { paintShelfLockup, type ShelfLockupRecipe } from '../shelfLockup';
import type { TitleLockup } from '../TitleLockup';
import { faithfulType } from './type';

/**
 * Metal Slug's proportions kept as they are: the P grows every way at once,
 * as the "M" does, and the name is the "SUPER VEHICLE-001" face at the size
 * it has on screen. Thirteen letters of it cover only two thirds of RODUCT,
 * where seventeen covered ETAL, so they are tracked out evenly to land on
 * the T's corner.
 */
export const FAITHFUL: ShelfLockupRecipe = {
  initial: { x: 1.5, y: 1.5 },
  type: faithfulType,
  style: {
    face: [palette.cream],
    shade: '#8a7656',
    outline: LOCKUP_INK,
    shadow: { color: '#1c0703', x: 1, y: 1 },
  },
  topLine: { x: 16, y: 45 },
  bottomLine: { x: 27, y: 93 },
};

export const faithfulLockup: TitleLockup<'faithful'> = {
  id: 'faithful',
  name: 'Faithful',
  description: 'The "SUPER VEHICLE-001" face at its own size beside a P raised like the M, tracked out to the T.',
  prepare: lazy(() => paintShelfLockup(FAITHFUL)),
};
