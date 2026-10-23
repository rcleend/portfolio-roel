import type { StageTheme } from '../../world/stage';

/** Berlin dressing: the U-Bahn on its viaduct, Baustelle pits with barriers and scope-creep vines. */
export const scripeTheme: StageTheme = {
  music: 'level-scripe',
  mover: {
    prop: 'uBahn',
    roofInset: 1,
    roofMargin: 10,
    speed: 70,
    dwell: 0.8,
    railColor: '#5c5a76',
    railShade: '#1c1420',
  },
  gate: null,
  slowZone: { prop: 'scopeCreep', speed: 0.45, jump: 0.85 },
  barrier: { prop: 'baustelle', topInset: 8 },
  pit: { label: 'BAUSTELLE', labelColor: '#a8505a' },
  finale: 'product-market-fit',
  bossPlan: 'ENTERPRISE PLAN',
  // Street lamps are tall; one every other repetition keeps them from walling off the play plane.
  foreground: { every: 2, offset: 1 },
};
