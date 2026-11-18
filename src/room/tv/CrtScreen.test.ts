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
    /** The game as the test sets it, and its frames as the test sends them. */
    const game = { paused: true, untouched: 0, frame: (): void => {} };
    const surface = {
      canvas,
      width: 320,
      height: 240,
      get paused() {
        return game.paused;
      },
      get untouched() {
        return game.untouched;
      },
      onFrame: (listener: () => void) => {
        game.frame = listener;
        return () => {};
      },
    } as unknown as GameSurface;
    /** What the screen told the loop moves by itself: the frames a second it needs now. */
    let rate = (): number => 0;
    const loop = {
      invalidate: vi.fn(),
      animate: vi.fn(() => () => {}),
      ambient: vi.fn((_name: string, needed: () => number) => {
        rate = needed;
        return () => {};
      }),
    } as unknown as RenderLoop;
    const crt = new CrtScreen({ tv, surface, loop, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)') });
    const osd = (screen.material as ShaderMaterial).uniforms.uOsd?.value as CanvasTexture;
    return { crt, loop, osd, canvas: osd.image as HTMLCanvasElement, game, rate: () => rate() };
  }

  it('shows a game somebody plays frame by frame, and one nobody has touched for a while as often as a room at rest draws', async () => {
    const { crt, loop, game, rate } = setup();
    await crt.powerOn(true);
    game.paused = false;
    vi.mocked(loop.invalidate).mockClear();
    // Played: each of the game's frames asks for one of the room's, as a run's.
    game.frame();
    expect(loop.invalidate).toHaveBeenCalledWith(true);
    expect(rate()).toBe(0);
    // Six seconds without a key, a button or a move over the picture: the title goes round by itself. Its frames
    // ask for none; the loop is told the tube moves, thirty frames a second.
    game.untouched = 6;
    vi.mocked(loop.invalidate).mockClear();
    game.frame();
    game.frame();
    expect(loop.invalidate).not.toHaveBeenCalled();
    expect(rate()).toBe(30);
    // The first touch: frame by frame again from that frame on (the frames are a sixtieth of a second apart).
    await new Promise((resolve) => setTimeout(resolve, 20));
    game.untouched = 0;
    game.frame();
    expect(loop.invalidate).toHaveBeenCalledWith(true);
    expect(rate()).toBe(0);
    // A paused game shows one picture: nothing moves on the tube.
    game.untouched = 60;
    game.paused = true;
    expect(rate()).toBe(0);
  });

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
