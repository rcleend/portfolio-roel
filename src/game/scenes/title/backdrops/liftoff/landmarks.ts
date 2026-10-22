import { pixels } from '@/engine/gfx/PixelArt';

/**
 * The two cities' landmarks as hand-drawn silhouettes, lit on their right
 * edge by what is left of the sunset. Keys: `k`/`g` silhouette, `r`/`G` rim,
 * `w`/`o` lit and dim windows, `b` an aviation light (drawn blinking per
 * frame on top).
 */

const repeat = (row: string, count: number): string[] => Array.from({ length: count }, () => row);

/**
 * Berlin's Fernsehturm, 11 × 62: the needle, the striped mast, the steel
 * sphere with its ring of café windows, the tapering shaft and the angular
 * pavilion at its foot.
 */
export const FERNSEHTURM: readonly string[] = [
  '.....b.....',
  ...repeat('.....k.....', 10),
  ...repeat('....kkr....', 6),
  ...pixels(`
    ....kkr....
    ..kkkkkkr..
    .kkkkkkkkr.
    kkkkkkkkkkr
    kkkkkkkkkkr
    kokwkwkokwr
    kkkkkkkkkkr
    kkkkkkkkkkr
    .kkkkkkkkr.
    ..kkkkkkr..
    ....kkr....
  `),
  ...repeat('....kkr....', 17),
  ...repeat('...kkkr....', 8),
  ...repeat('...kkkkr...', 4),
  ...pixels(`
    ..kkkkkkr..
    .kkkkkkkkr.
    kkkkkkkkkkr
    kkokkkwkkkr
    kkkkkkkkkkr
  `),
];

/**
 * A Golden Gate tower, 11 × 54: two legs stepping out as they fall, the four
 * portal struts above the roadway and the cross strut below it, an aviation
 * light on each leg.
 */
export const GOLDEN_GATE_TOWER: readonly string[] = [
  '.b.......b.',
  '.gG.....gG.',
  'ggggggggggG',
  'ggggggggggG',
  ...repeat('.gG.....gG.', 6),
  'ggggggggggG',
  'ggggggggggG',
  ...repeat('ggG.....ggG', 9),
  'ggggggggggG',
  'ggggggggggG',
  ...repeat('ggG.....ggG', 11),
  'ggggggggggG',
  'ggggggggggG',
  ...repeat('ggG.....ggG', 12),
  'ggggggggggG',
  ...repeat('gggG...gggG', 3),
];
