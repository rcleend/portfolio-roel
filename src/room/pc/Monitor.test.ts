// @vitest-environment happy-dom
import {
  BoxGeometry,
  CanvasTexture,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  type ShaderMaterial,
  Texture,
  Vector3,
} from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdleTask } from '../stage/IdleWork';
import { Monitor } from './Monitor';
import { pcViewpoint } from './pcFraming';
import { locatePc } from './pcModel';
import { projectorUvs } from './projectorUvs';
import { ScreenOverlay } from './ScreenOverlay';

const DESKTOP = { width: 1440, height: 900, pixelRatio: 1.5 };

/** A 2D context that accepts every call; happy-dom has none of its own. */
function permissiveContext(): CanvasRenderingContext2D {
  const noop = () => {};
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, property) => {
      if (property === 'createImageData') {
        return (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height });
      }
      return property in target ? target[property] : noop;
    },
    set: (target, property, value) => {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Background work run by hand: `runUnit` runs the first queued task's next unit, `runAll` everything. */
function manualBackground() {
  const tasks: IdleTask[] = [];
  const runUnit = (): void => {
    const task = tasks[0];
    if (task?.next().done) tasks.shift();
  };
  return {
    tasks,
    add(task: IdleTask) {
      tasks.push(task);
      return () => {
        const at = tasks.indexOf(task);
        if (at >= 0) tasks.splice(at, 1);
      };
    },
    runUnit,
    runAll(): void {
      while (tasks.length > 0) runUnit();
    },
  };
}

function setup({ inView = false } = {}) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(permissiveContext);
  const close = vi.fn();
  vi.stubGlobal(
    'ImageBitmap',
    class {
      close = close;
    },
  );
  const root = new Group();
  const baked = new Texture(new (globalThis as unknown as { ImageBitmap: new () => object }).ImageBitmap());
  const disposeBaked = vi.spyOn(baked, 'dispose');
  const glassMaterial = new MeshBasicMaterial({ map: baked });
  const glass = new Mesh(new PlaneGeometry(0.356, 0.284, 4, 4), glassMaterial);
  glass.userData = { interaction_id: 'pc-screen', replaceable_screen: true };
  glass.position.set(-1.34, 1.071, -1.679);
  const crt = new Mesh(new BoxGeometry(0.46, 0.483, 0.432));
  crt.name = 'PC_Imported_CRT_base';
  crt.position.set(-1.34, 1.0265, -1.87);
  const keyboard = new Mesh(new BoxGeometry(0.49, 0.04, 0.2));
  keyboard.name = 'PC_Imported_Keyboard_base';
  keyboard.position.set(-1.345, 0.805, -1.505);
  root.add(glass, crt, keyboard);
  const model = locatePc(root, new Group());
  const scene = new Scene();
  const loop = { invalidate: vi.fn(), animate: vi.fn() };
  const renderer = { initTexture: vi.fn() };
  const overlay = new ScreenOverlay(document.body, { matches: true } as MediaQueryList);
  const originalUv = glass.geometry.getAttribute('uv');
  const view = { inView };
  const background = manualBackground();
  const monitor = new Monitor({
    model,
    scene,
    loop,
    renderer,
    anisotropy: 4,
    overlay,
    pose: pcViewpoint(model, 1),
    isInView: () => view.inView,
    background,
  });
  monitor.setPose(pcViewpoint(model, DESKTOP.width / DESKTOP.height), DESKTOP);
  loop.invalidate.mockClear();
  const glows = scene.children.filter(
    (child): child is Mesh<PlaneGeometry, ShaderMaterial> => child.name === 'ScreenGlow',
  );
  return {
    monitor,
    model,
    glass,
    glassMaterial,
    disposeBaked,
    close,
    loop,
    renderer,
    overlay,
    originalUv,
    glows,
    view,
    background,
  };
}

describe('Monitor', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('keeps the baked unlit program: a clone of the glass material with only its map swapped', () => {
    const { glass, glassMaterial } = setup();
    const material = glass.material as MeshBasicMaterial;
    expect(material).not.toBe(glassMaterial);
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    expect(material.map).toBeInstanceOf(DataTexture);
    // What three keys a MeshBasicMaterial's program on, besides the map's presence (kept).
    const keys = [
      'type',
      'transparent',
      'alphaTest',
      'alphaHash',
      'side',
      'vertexColors',
      'toneMapped',
      'fog',
      'premultipliedAlpha',
      'dithering',
    ] as const;
    for (const key of keys) expect(material[key]).toBe(glassMaterial[key]);
    expect(material.customProgramCacheKey()).toBe(glassMaterial.customProgramCacheKey());
  });

  it('releases the baked desktop picture before it can ever be uploaded', () => {
    const { disposeBaked, close, glassMaterial } = setup();
    expect(disposeBaked).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(glassMaterial.map).toBeNull();
  });

  it('asks for nothing per frame', () => {
    const { glass, glows, loop } = setup();
    expect(loop.animate).not.toHaveBeenCalled();
    expect(glass.onBeforeRender).toBe(Object3D.prototype.onBeforeRender);
    expect(glows).toHaveLength(3);
    for (const glow of glows) expect(glow.onBeforeRender).toBe(Object3D.prototype.onBeforeRender);
  });

  it('re-projects the glass UVs from the settled eye, and restores the asset UVs on dispose', () => {
    const { monitor, glass, model, originalUv } = setup();
    const uv = glass.geometry.getAttribute('uv');
    expect(uv).toBeInstanceOf(Float32BufferAttribute);
    const position = glass.geometry.getAttribute('position');
    const world = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      glass.localToWorld(new Vector3().fromBufferAttribute(position, i)).toArray(world, i * 3);
    }
    const eye = pcViewpoint(model, DESKTOP.width / DESKTOP.height).position;
    expect(Array.from(uv.array as Float32Array)).toEqual(Array.from(projectorUvs(world, eye, model.rim)));
    monitor.dispose();
    expect(glass.geometry.getAttribute('uv')).toBe(originalUv);
  });

  it('lays the live screen over the picture for the current viewport', () => {
    const { overlay } = setup();
    const { left, top, width, height } = overlay.placement;
    expect(Math.abs(left - 283)).toBeLessThanOrEqual(1);
    expect(Math.abs(top - 91)).toBeLessThanOrEqual(1);
    expect(Math.abs(width - 874)).toBeLessThanOrEqual(1);
    expect(Math.abs(height - 687)).toBeLessThanOrEqual(1);
  });

  it('paints the still in the background as soon as the painter arrives, so no flight has to', () => {
    const { monitor, glass, renderer, background } = setup();
    monitor.setStill(() => {});
    expect(renderer.initTexture).not.toHaveBeenCalled();
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    expect((glass.material as MeshBasicMaterial).map).toBeInstanceOf(CanvasTexture);
    expect(monitor.texturePixels).toBe(1024 * 817);
    monitor.prepare('tv', 'room');
    monitor.prepare('room', 'pc');
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
  });

  it('paints on the click only when a flight starts before the background got there', () => {
    const { monitor, renderer, background } = setup();
    monitor.setStill(() => {});
    monitor.prepare('tv', 'room');
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
  });

  it('repaints a stale still in the background whenever the computer can be seen', () => {
    const { monitor, renderer, background, view } = setup();
    monitor.setStill(() => {});
    background.runAll();
    // At the TV the glass is out of sight: the clock's minute waits for the next look around…
    monitor.invalidateStill();
    expect(background.tasks).toHaveLength(0);
    monitor.prepare('tv', 'room');
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(2);
    // …and in the room it is repainted in the background straight away.
    view.inView = true;
    monitor.invalidateStill();
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(3);
  });

  it('repaints a stale still before a flight to or from the computer that the background did not beat', () => {
    const { monitor, renderer, background, view } = setup();
    monitor.setStill(() => {});
    background.runAll();
    view.inView = true;
    monitor.invalidateStill();
    monitor.prepare('room', 'tv');
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    monitor.prepare('room', 'pc');
    expect(renderer.initTexture).toHaveBeenCalledTimes(2);
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(2);
  });

  it('makes the glass finish in a unit of its own, before the first paint', () => {
    const { monitor, renderer, background } = setup();
    const created = vi.spyOn(document, 'createElement');
    const canvases = () => created.mock.calls.filter(([tag]) => tag === 'canvas').length;
    monitor.setStill(() => {});
    expect(canvases()).toBe(0);
    background.runUnit();
    expect(canvases()).toBe(1);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    background.runUnit();
    // The still's own canvas; the finish is reused.
    expect(canvases()).toBe(2);
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
  });

  it('shows a new still in one frame while the computer can be seen', () => {
    const { monitor, renderer, loop, background } = setup({ inView: true });
    monitor.setStill(() => {});
    background.runAll();
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    expect(loop.invalidate).toHaveBeenCalledTimes(1);
  });

  it('cancels its background paint on dispose', () => {
    const { monitor, background } = setup();
    monitor.setStill(() => {});
    monitor.dispose();
    expect(background.tasks).toHaveLength(0);
  });

  it('lights the room with an override colour for one frame, and follows the still again on null', () => {
    const { monitor, glows, loop, background } = setup();
    monitor.setStill(() => {});
    background.runAll();
    const still = glows[0]?.material.uniforms.uPicture?.value;
    loop.invalidate.mockClear();
    monitor.setLight({ r: 0.8, g: 0.8, b: 0.8 });
    expect(loop.invalidate).toHaveBeenCalledTimes(1);
    const light = glows[0]?.material.uniforms.uPicture?.value as DataTexture;
    expect(light).not.toBe(still);
    expect(Array.from(light.image.data as Uint8Array)).toEqual([204, 204, 204, 255]);
    for (const glow of glows) expect(glow.material.uniforms.uPicture?.value).toBe(light);
    monitor.setLight({ r: 0.8, g: 0.8, b: 0.8 });
    expect(loop.invalidate).toHaveBeenCalledTimes(1);
    monitor.setLight(null);
    expect(glows[0]?.material.uniforms.uPicture?.value).toBe(still);
    expect(loop.invalidate).toHaveBeenCalledTimes(2);
  });

  it('keeps its light spill dark until a still is painted', () => {
    const { monitor, glows, background } = setup();
    for (const glow of glows) expect(glow.visible).toBe(false);
    monitor.setStill(() => {});
    background.runAll();
    for (const glow of glows) expect(glow.visible).toBe(true);
  });
});
