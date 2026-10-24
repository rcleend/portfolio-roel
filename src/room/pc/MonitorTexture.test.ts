// @vitest-environment happy-dom
import { CanvasTexture, DataTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GlassPlane, insetPlane } from './glassPlane';
import { MonitorTexture } from './MonitorTexture';
import type { ScreenRect, StillPainter, StillRequest } from './PcMonitor';

const GLASS: GlassPlane = { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 };
const PICTURE = insetPlane(GLASS, 0.01);
const PLACEMENT: ScreenRect = { left: 283, top: 91, width: 874, height: 687 };
const LARGE = { width: 1024, height: 817 };
const SMALL = { width: 768, height: 613 };

/** Records what is drawn; happy-dom has no 2D canvas of its own. */
function recordingContext() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(
        `${name}(${args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : typeof a)).join(',')})`,
      );
    };
  const context = {
    calls,
    fillStyle: '',
    fillRect: record('fillRect'),
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    arcTo: record('arcTo'),
    closePath: record('closePath'),
    clip: record('clip'),
    translate: record('translate'),
    drawImage: record('drawImage'),
  };
  return context;
}

function setup({ cpuCanvas = false } = {}) {
  const context = recordingContext();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const renderer = { initTexture: vi.fn() };
  const glassLayer = document.createElement('canvas');
  const texture = new MonitorTexture({
    glass: GLASS,
    picture: PICTURE,
    pictureRadius: 0.006,
    tubeColor: '#070a09',
    renderer,
    anisotropy: 4,
    cpuCanvas,
    glassLayer: () => glassLayer,
  });
  texture.setTarget(LARGE, PLACEMENT);
  return { texture, renderer, context, getContext };
}

describe('MonitorTexture', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a dark 1 × 1 tube until a still is painted', () => {
    const { texture, renderer } = setup();
    expect(texture.texture).toBeInstanceOf(DataTexture);
    expect(texture.texture.image).toMatchObject({ width: 1, height: 1 });
    expect(Array.from((texture.texture as DataTexture).image.data as Uint8Array)).toEqual([7, 10, 9, 255]);
    expect(texture.texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.painted).toBe(false);
    expect(texture.pixels).toBe(0);
    expect(texture.paintIfDue(true)).toBe(false);
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it('paints on the first flight anywhere, then uploads it at once', () => {
    const { texture, renderer } = setup();
    const painter = vi.fn<StillPainter>();
    texture.setPainter(painter);
    expect(painter).not.toHaveBeenCalled();
    expect(texture.paintIfDue(false)).toBe(true);
    expect(painter).toHaveBeenCalledTimes(1);
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    const still = renderer.initTexture.mock.calls[0]?.[0];
    expect(still).toBe(texture.texture);
    expect(still).toBeInstanceOf(CanvasTexture);
    expect(still).toMatchObject({
      flipY: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      anisotropy: 4,
    });
    expect(still.colorSpace).toBe(SRGBColorSpace);
    expect(texture.pixels).toBe(1024 * 817);
    expect(texture.painted).toBe(true);
  });

  it('hands the painter the picture inside the tube border, clipped, with its origin at the corner', () => {
    const { texture, context } = setup();
    const painter = vi.fn<StillPainter>((_context, request) =>
      context.calls.push(`paint(${Math.round(request.width)})`),
    );
    texture.setPainter(painter);
    texture.paintIfDue(false);
    const request = painter.mock.calls[0]?.[1];
    // 10 mm of a 356 mm wide glass on a 1024 px canvas is 28.8 px of border each side.
    expect(request?.width).toBeCloseTo(1024 * (0.336 / 0.356), 6);
    expect(request?.height).toBeCloseTo(817 * (0.264 / 0.284), 6);
    expect(request?.placement).toEqual(PLACEMENT);
    expect(request?.cpuCanvas).toBe(false);
    expect(context.calls).toEqual([
      'fillRect(0,0,1024,817)',
      'save()',
      'beginPath()',
      expect.stringMatching(/^moveTo/),
      expect.stringMatching(/^arcTo/),
      expect.stringMatching(/^arcTo/),
      expect.stringMatching(/^arcTo/),
      expect.stringMatching(/^arcTo/),
      'closePath()',
      'clip()',
      'translate(28.76,28.77)',
      'paint(966)',
      'restore()',
      // The glass finish goes over everything, border included.
      'drawImage(object,0,0,1024,817)',
    ]);
    expect(context.fillStyle).toBe('#070a09');
  });

  it("runs a painter's preparation once, a unit per step, with the request its paints will get", () => {
    const { texture } = setup();
    const steps: string[] = [];
    const prepare = vi.fn(function* (request: StillRequest): Generator<void, void, void> {
      steps.push(`fonts ${Math.round(request.width)}`);
      yield;
      steps.push('wallpaper');
    });
    const painter = Object.assign(vi.fn<StillPainter>(), { prepare });
    texture.setPainter(painter);
    const units = texture.prepare();
    units.next();
    expect(steps).toEqual(['fonts 966']);
    expect(prepare.mock.calls[0]?.[0].placement).toEqual(PLACEMENT);
    expect(units.next().done).toBe(true);
    expect(steps).toEqual(['fonts 966', 'wallpaper']);
    expect(texture.prepare().next().done).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(painter).not.toHaveBeenCalled();
  });

  it('composes a picture ahead without uploading it, and uploads it with the next paint', () => {
    const { texture, renderer } = setup();
    const painter = vi.fn<StillPainter>();
    texture.setPainter(painter);
    expect(texture.composeIfDue(false)).toBe(false);
    expect(painter).toHaveBeenCalledTimes(1);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(texture.painted).toBe(false);
    expect(texture.composeIfDue(true)).toBe(false);
    expect(texture.paintIfDue(false)).toBe(true);
    expect(painter).toHaveBeenCalledTimes(1);
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    expect(texture.painted).toBe(true);
    expect(texture.paintIfDue(true)).toBe(false);
  });

  it('never uploads a composed picture once its painter is gone', () => {
    const { texture, renderer } = setup();
    texture.setPainter(vi.fn<StillPainter>());
    texture.composeIfDue(false);
    texture.setPainter(null);
    expect(texture.paintIfDue(true)).toBe(false);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(texture.texture).toBeInstanceOf(DataTexture);
  });

  it('has nothing to prepare for a painter without a preparation', () => {
    const { texture } = setup();
    expect(texture.prepare().next().done).toBe(true);
    texture.setPainter(vi.fn<StillPainter>());
    expect(texture.prepare().next().done).toBe(true);
  });

  it('paints on a CPU canvas on a software GPU, and asks the painter to do the same', () => {
    const { texture, getContext } = setup({ cpuCanvas: true });
    const prepare = vi.fn(function* (_request: StillRequest): Generator<void, void, void> {});
    const painter = Object.assign(vi.fn<StillPainter>(), { prepare });
    texture.setPainter(painter);
    texture.prepare().next();
    texture.paintIfDue(false);
    expect(getContext).toHaveBeenCalledWith('2d', { alpha: false, willReadFrequently: true });
    expect(prepare.mock.calls[0]?.[0].cpuCanvas).toBe(true);
    expect(painter.mock.calls[0]?.[1].cpuCanvas).toBe(true);
  });

  it('repaints a stale still only when asked to refresh (background, flights to or from the display)', () => {
    const { texture, renderer } = setup();
    const painter = vi.fn<StillPainter>();
    texture.setPainter(painter);
    texture.paintIfDue(false);
    expect(texture.paintIfDue(true)).toBe(false);
    texture.invalidate();
    expect(texture.paintIfDue(false)).toBe(false);
    expect(texture.paintIfDue(true)).toBe(true);
    expect(texture.paintIfDue(true)).toBe(false);
    expect(painter).toHaveBeenCalledTimes(2);
    expect(renderer.initTexture).toHaveBeenCalledTimes(2);
  });

  it('repaints at a new size or placement, reallocating the texture for a new size', () => {
    const { texture, renderer } = setup();
    texture.setPainter(vi.fn<StillPainter>());
    texture.paintIfDue(false);
    const first = texture.texture;
    const dispose = vi.spyOn(first, 'dispose');
    texture.setTarget(SMALL, PLACEMENT);
    expect(texture.paintIfDue(false)).toBe(false);
    expect(texture.paintIfDue(true)).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(texture.pixels).toBe(768 * 613);
    texture.setTarget(SMALL, { ...PLACEMENT, width: 700 });
    expect(texture.paintIfDue(true)).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(renderer.initTexture).toHaveBeenCalledTimes(3);
  });

  it('paints a new painter on the next flight, and a null one shows the tube at once', () => {
    const { texture } = setup();
    const first = vi.fn<StillPainter>();
    const second = vi.fn<StillPainter>();
    texture.setPainter(first);
    texture.paintIfDue(false);
    texture.setPainter(second);
    expect(texture.paintIfDue(false)).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(texture.setPainter(null)).toBe(true);
    expect(texture.texture).toBeInstanceOf(DataTexture);
    expect(texture.pixels).toBe(0);
  });

  it('falls back to the standby tube when the painter throws, warning once', () => {
    const { texture, renderer } = setup();
    const broken = vi.fn<StillPainter>(() => {
      throw new Error('no fonts');
    });
    texture.setPainter(broken);
    expect(texture.paintIfDue(false)).toBe(false);
    expect(texture.texture).toBeInstanceOf(DataTexture);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    // A failed painter is not retried on every flight…
    expect(texture.paintIfDue(false)).toBe(false);
    expect(broken).toHaveBeenCalledTimes(1);
    // …only once it reports new content, and it warns only the first time.
    texture.invalidate();
    texture.paintIfDue(true);
    expect(broken).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('drops a painted still back to standby if a later repaint throws', () => {
    const { texture } = setup();
    let fail = false;
    texture.setPainter(() => {
      if (fail) throw new Error('boom');
    });
    texture.paintIfDue(false);
    fail = true;
    texture.invalidate();
    expect(texture.paintIfDue(true)).toBe(true);
    expect(texture.painted).toBe(false);
    expect(texture.texture).toBeInstanceOf(DataTexture);
  });

  it('asks for nothing per frame: no update hooks on what it hands the renderer', () => {
    const { texture } = setup();
    texture.setPainter(vi.fn<StillPainter>());
    texture.paintIfDue(false);
    expect(texture.texture.onUpdate).toBeNull();
  });
});
