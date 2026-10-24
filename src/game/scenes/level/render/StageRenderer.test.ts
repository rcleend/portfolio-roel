import { describe, expect, it } from 'vitest';
import { fillLabelScreen, type LabelScreenBuffer } from './StageRenderer';

/** A camera at rest at (100, 0), drawn `(dx, dy)` away by a shake. */
function camera(dx = 0, dy = 0) {
  return { width: 320, left: 100, top: 0, view: { x: 100 + dx, y: dy } };
}

function screenOf(cam: ReturnType<typeof camera>, hud?: { settled: number; top: number }): LabelScreenBuffer {
  const screen = { width: 0, restLeft: 0, restBottom: 0, left: 0, bottom: 0 };
  fillLabelScreen(screen, cam, 240, hud);
  return screen;
}

describe('fillLabelScreen', () => {
  it('ends the screen at its bottom without a HUD', () => {
    expect(screenOf(camera())).toEqual({ width: 320, restLeft: 100, restBottom: 240, left: 100, bottom: 240 });
  });

  it('reads the camera at rest for the rows and as drawn for the hold', () => {
    const hud = { settled: 214, top: 214 };
    expect(screenOf(camera(3, -3), hud)).toEqual({
      width: 320,
      restLeft: 100,
      restBottom: 214,
      left: 103,
      bottom: 211,
    });
  });

  it('keeps labels off the rows a rising HUD is about to take, shake or no shake', () => {
    // The boss bar still rising from below the screen: its settled top binds, shaken with the street.
    expect(screenOf(camera(0, -3), { settled: 214, top: 238 }).bottom).toBe(211);
  });

  it('keeps labels off a HUD bouncing up past its settled top', () => {
    expect(screenOf(camera(), { settled: 214, top: 212 })).toMatchObject({ restBottom: 214, bottom: 212 });
  });
});
