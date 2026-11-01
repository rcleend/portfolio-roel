import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onCanvasesRepainted, paintCanvas } from './canvas';

/**
 * A canvas whose pixels are the names painted on it since it was last cleared, and whose context a test can lose and
 * restore the way a GPU process reset does (blank, state reset).
 */
class FakeCanvas extends EventTarget {
  #width = 4;
  height = 4;
  ink: string[] = [];
  lost = false;
  readonly context = {
    imageSmoothingEnabled: true,
    isContextLost: () => this.lost,
  };

  get width(): number {
    return this.#width;
  }

  set width(value: number) {
    this.#width = value;
    this.ink = [];
    this.context.imageSmoothingEnabled = true;
  }

  getContext(): unknown {
    return this.context;
  }

  /** A GPU reset: the context goes, the pixels with it. */
  lose(): void {
    this.lost = true;
    this.ink = [];
    this.context.imageSmoothingEnabled = true;
  }

  restore(): void {
    this.lost = false;
    this.dispatchEvent(new Event('contextrestored'));
  }
}

const asCanvas = (canvas: FakeCanvas) => canvas as unknown as HTMLCanvasElement;

/** Paints `name` on `canvas`, plus whatever `source` holds (a cache drawn from another). */
function paintNamed(canvas: FakeCanvas, name: string, source?: FakeCanvas): void {
  paintCanvas(asCanvas(canvas), (ctx) => {
    expect(ctx.imageSmoothingEnabled).toBe(false);
    canvas.ink.push(name, ...(source?.ink ?? []));
  });
}

describe('paintCanvas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('paints at once, with smoothing off', () => {
    const canvas = new FakeCanvas();
    paintNamed(canvas, 'atlas');
    expect(canvas.ink).toEqual(['atlas']);
  });

  // A GPU process reset wipes every 2D canvas, CPU ones included, and gives each back blank: a cache drawn once drew
  // nothing from then on (the game's text, cards and backdrops went missing).
  it('paints a canvas again once it comes back from a lost context, and says so', () => {
    const canvas = new FakeCanvas();
    paintNamed(canvas, 'atlas');
    const repainted = vi.fn();
    const stop = onCanvasesRepainted(repainted);
    canvas.lose();
    canvas.restore();
    expect(canvas.ink).toEqual([]);
    vi.runAllTimers();
    expect(canvas.ink).toEqual(['atlas']);
    expect(repainted).toHaveBeenCalledTimes(1);
    stop();
  });

  it('repaints a cache drawn from another after the one it draws from, whichever came back first', () => {
    const font = new FakeCanvas();
    paintNamed(font, 'glyphs');
    const flag = new FakeCanvas();
    paintNamed(flag, 'flag', font);
    expect(flag.ink).toEqual(['flag', 'glyphs']);
    font.lose();
    flag.lose();
    flag.restore();
    font.restore();
    vi.runAllTimers();
    expect(font.ink).toEqual(['glyphs']);
    expect(flag.ink).toEqual(['flag', 'glyphs']);
  });

  it('leaves a canvas still lost for its own restore, and then repaints what is drawn from it', () => {
    const font = new FakeCanvas();
    paintNamed(font, 'glyphs');
    const flag = new FakeCanvas();
    paintNamed(flag, 'flag', font);
    font.lose();
    flag.lose();
    flag.restore();
    vi.runAllTimers();
    expect(flag.ink).toEqual(['flag']);
    font.restore();
    vi.runAllTimers();
    expect(font.ink).toEqual(['glyphs']);
    expect(flag.ink).toEqual(['flag', 'glyphs']);
  });

  it('leaves canvases painted before the first restored one alone', () => {
    const before = new FakeCanvas();
    paintNamed(before, 'before');
    const restored = new FakeCanvas();
    paintNamed(restored, 'restored');
    const paint = vi.fn();
    paintCanvas(asCanvas(new FakeCanvas()), paint);
    before.ink.push('kept');
    restored.lose();
    restored.restore();
    vi.runAllTimers();
    expect(before.ink).toEqual(['before', 'kept']);
    expect(restored.ink).toEqual(['restored']);
    // Painted after the restored one, it may draw from it: painted again on a cleared canvas.
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it('repaints once for restores that land together', () => {
    const a = new FakeCanvas();
    const paint = vi.fn();
    paintCanvas(asCanvas(a), paint);
    const repainted = vi.fn();
    const stop = onCanvasesRepainted(repainted);
    a.lose();
    a.restore();
    a.restore();
    vi.runAllTimers();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(repainted).toHaveBeenCalledTimes(1);
    stop();
  });

  it('goes on past a paint that throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new FakeCanvas();
    let calls = 0;
    paintCanvas(asCanvas(broken), () => {
      if (calls++ > 0) throw new Error('gone');
    });
    const after = new FakeCanvas();
    paintNamed(after, 'after');
    broken.lose();
    after.lose();
    broken.restore();
    after.restore();
    vi.runAllTimers();
    expect(after.ink).toEqual(['after']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
