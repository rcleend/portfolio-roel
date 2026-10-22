import { LOCKUP_INK } from '../../../../art/logos';
import { lazy } from '../../../../art/logos/lazy';
import { palette } from '../../../../palette';
import { paintShelfLockup, type ShelfLockupRecipe } from '../shelfLockup';
import type { TitleLockup } from '../TitleLockup';
import { headlinerType } from './type';

/**
 * The name as the hero: the "SUPER VEHICLE-001" face drawn large enough to
 * fill RODUCT at its own tight spacing, and the P raised as tall as the
 * name needs.
 */
export const HEADLINER: ShelfLockupRecipe = {
  initial: { x: 1.45, y: 1.7 },
  type: headlinerType,
  style: {
    face: [palette.cream],
    shade: '#8a7656',
    outline: LOCKUP_INK,
    shadow: { color: '#1c0703', x: 1, y: 1 },
  },
  topLine: { x: 17, y: 52 },
  bottomLine: { x: 27, y: 100 },
};

export const headlinerLockup: TitleLockup<'headliner'> = {
  id: 'headliner',
  name: 'Headliner',
  description: 'The name as the hero: the reference face drawn large and tight, beside a P raised to match.',
  prepare: lazy(() => paintShelfLockup(HEADLINER)),
};
