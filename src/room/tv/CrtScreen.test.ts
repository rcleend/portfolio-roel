// @vitest-environment happy-dom
import { type CanvasTexture, Mesh, type ShaderMaterial } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { RenderLoop } from '../stage/RenderLoop';
import { CrtScreen } from './CrtScreen';
import type { TvModel } from './tvModel';

describe('CrtScreen', () => {
  let fills: number;
  beforeEach(() => {
    fills = 0;
    // happy-dom has no 2D canvas: a context that counts the OSD's pixels.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ fillStyle: '', fillRect: () => fills++ }) as unknown as CanvasRenderingContext2D,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const screen = new Mesh();
    const tv = { screen, screenAspect: 4 / 3 } as unknown as TvModel;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const surface = {
      canvas,
      width: 320,
      height: 240,
      paused: true,
      onFrame: () => () => {},
    } as unknown as GameSurface;
    const loop = { invalidate: vi.fn(), animate: vi.fn(() => () => {}) } as unknown as RenderLoop;
    const crt = new CrtScreen({ tv, surface, loop, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)') });
    const osd = (screen.material as ShaderMaterial).uniforms.uOsd?.value as CanvasTexture;
    return { crt, loop, osd, canvas: osd.image as HTMLCanvasElement };
  }

  // A GPU process reset (a laptop's sleep, a display change) gives the OSD's canvas back blank, and the restored WebGL
  // context uploads it: a paused game's TV lost its PAUSE for good.
  it('paints the pause indicator again, and uploads it, when its canvas comes back from a lost context', () => {
    const { loop, osd, canvas } = setup();
    const painted = fills;
    expect(painted).toBeGreaterThan(0);
    const version = osd.version;
    vi.mocked(loop.invalidate).mockClear();
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(fills).toBe(painted * 2);
    expect(osd.version).toBe(version + 1);
    expect(loop.invalidate).toHaveBeenCalled();
  });

  it('stops listening once disposed', () => {
    const { crt, canvas } = setup();
    crt.dispose();
    const painted = fills;
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(fills).toBe(painted);
  });
});
