// @vitest-environment happy-dom
import { Object3D } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lcd, type LcdPlacement } from './Lcd';

const PLACEMENT: LcdPlacement = { min: [-0.02, 0.01], max: [0.02, 0.02], z: 0.05, normal: [0, 0.2, 1] };

/** happy-dom has no 2D canvas: a context that counts the panel's backlight fills (one per paint). */
function countingContext() {
  const context = {
    paints: 0,
    fillStyle: '' as unknown,
    globalAlpha: 1,
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: (x: number, y: number) => {
      if (x === 0 && y === 0) context.paints++;
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
  };
  return context;
}

describe('Lcd', () => {
  let context: ReturnType<typeof countingContext>;
  beforeEach(() => {
    context = countingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const loop = { animate: vi.fn(() => () => {}), invalidate: vi.fn() };
    const lcd = new Lcd(new Object3D(), PLACEMENT, 100, 1, loop);
    const canvas = lcd.mesh.material.map?.image as HTMLCanvasElement;
    return { lcd, loop, canvas, texture: lcd.mesh.material.map };
  }

  it('paints what it shows only when that changes', () => {
    const { lcd } = setup();
    const painted = context.paints;
    lcd.show({ kind: 'no-disc' }, true, true);
    lcd.show({ kind: 'no-disc' }, true, true);
    expect(context.paints).toBe(painted);
    lcd.show({ kind: 'reading' }, true, true);
    expect(context.paints).toBe(painted + 1);
  });

  // A GPU process reset (a laptop's sleep, a display change) wipes the canvas and restores its context blank; the
  // new WebGL context then uploads that blank canvas, and the panel read black until the readout next changed.
  it('paints its readout again, and uploads it, when the canvas comes back from a lost context', () => {
    const { lcd, loop, canvas, texture } = setup();
    lcd.show({ kind: 'track', track: 1, seconds: 37, transport: 'paused' }, true, true);
    const painted = context.paints;
    const version = texture?.version ?? 0;
    loop.invalidate.mockClear();
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(context.paints).toBe(painted + 1);
    expect(texture?.version).toBe(version + 1);
    expect(loop.invalidate).toHaveBeenCalled();
  });

  it('stops listening once disposed', () => {
    const { lcd, canvas } = setup();
    lcd.dispose();
    const painted = context.paints;
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(context.paints).toBe(painted);
  });
});
