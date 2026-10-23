import type { StageTheme } from '../../world/stage';

/** San Francisco dressing: cable cars on rails, spam-folder pits and "429" rate-limit gates. */
export const lunaTheme: StageTheme = {
  music: 'level-luna',
  mover: {
    prop: 'cableCar',
    roofInset: 5,
    roofMargin: 11,
    speed: 55,
    dwell: 0.8,
    railColor: '#6a6280',
    railShade: '#2c1c38',
  },
  gate: { prop: 'rateLimitGate', closedSeconds: 1.6, openSeconds: 1.8, beamColor: '#ff3a3a' },
  slowZone: null,
  barrier: null,
  pit: { label: 'SPAM', labelColor: '#9e3028' },
  finale: 'acquired',
  bossPlan: 'ENTERPRISE PLAN',
  // The telephone pole is a full-height silhouette that crosses the HUD; once per level is a striking accent, more is a wall.
  foreground: { every: 3, offset: 1 },
};
