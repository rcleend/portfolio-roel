import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Texture,
  type Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RoomTarget } from '../camera/anchors';
import type { LitProp } from './PropSpotlight';
import { createSpotlight, jellyAt } from './Spotlight';
import type { SpotlightHost, SpotlitProp } from './spotlightContract';
import { spotlightKit } from './spotlightKit';

/** A prop on the floor: a 1 m box standing on y = 0 at `x`, its baked material textured. */
function prop(
  target: RoomTarget,
  x: number,
): { readonly prop: SpotlitProp; readonly root: Group; readonly mesh: Mesh } {
  const root = new Group();
  const material = new MeshBasicMaterial({ map: new Texture(), color: new Color(0.5, 0.5, 0.5) });
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.position.y = 0.5;
  root.add(mesh);
  root.position.x = x;
  root.updateMatrixWorld(true);
  return {
    root,
    mesh,
    prop: {
      target,
      glow: [root],
      bounce: [root],
      pivot: new Vector3(x, 0, 0),
      top: new Vector3(x, 1, 0),
    },
  };
}

function setup({
  reduced = false,
  still = () => false,
}: {
  reduced?: boolean;
  still?: (t: RoomTarget) => boolean;
} = {}) {
  const tv = prop('tv', 0);
  const radio = prop('radio', 3);
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.set(0, 1, 6);
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld();
  let compiled: () => void = () => {};
  const compiling = new Promise<void>((resolve) => {
    compiled = resolve;
  });
  const renders: string[] = [];
  const renderer = {
    autoClear: true,
    info: { autoReset: true },
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    compileAsync: vi.fn(() => compiling),
    getDrawingBufferSize: (target: Vector2) => target.set(1600, 800),
    render: vi.fn((scene: { children: unknown[] }) => renders.push(`scene of ${scene.children.length}`)),
  };
  const steps = new Set<(now: number) => boolean>();
  const frames = new Set<() => void>();
  let now = 0;
  const host: SpotlightHost = {
    kit: spotlightKit,
    renderer: renderer as unknown as WebGLRenderer,
    camera,
    loop: {
      animate: (step) => {
        steps.add(step);
        return () => steps.delete(step);
      },
      invalidate: () => {},
    },
    props: [tv.prop, radio.prop],
    reducedMotion: { matches: reduced } as MediaQueryList,
    size: () => ({ width: 800, height: 400, pixelRatio: 2 }),
    still,
    onRender: (listener) => {
      frames.add(listener);
      return () => frames.delete(listener);
    },
  };
  const told: (LitProp | null)[] = [];
  const spotlight = createSpotlight(host, (lit) => told.push(lit));
  /** Draws a frame: the motion steps first, then what follows a frame. */
  const frame = (ms = 16): void => {
    now += ms;
    for (const step of [...steps]) if (!step(now)) steps.delete(step);
    for (const listener of frames) listener();
  };
  const settle = (): void => {
    for (let i = 0; i < 300 && steps.size > 0; i++) frame();
  };
  return { spotlight, tv, radio, told, frame, settle, renderer, renders, compiled, steps };
}

describe('the spotlight', () => {
  it('tells where the lit prop’s label goes, over the middle of its top, and that nothing is lit afterwards', () => {
    const { spotlight, told } = setup();
    spotlight.show('tv');
    const lit = told.at(-1);
    expect(lit?.target).toBe('tv');
    // The top of the box at x = 0 is on the page's vertical centre line, above the middle.
    expect(lit?.x).toBeCloseTo(400, 0);
    expect(lit?.y).toBeLessThan(200);
    spotlight.show(null);
    expect(told.at(-1)).toBeNull();
  });

  it('plays its jelly about its foot as it lights, holds it a touch bigger, and takes it home as the light goes', () => {
    const { spotlight, tv, frame, settle } = setup();
    spotlight.show('tv');
    let widest = 1;
    let tallest = 1;
    for (let i = 0; i < 40; i++) {
      frame();
      widest = Math.max(widest, tv.root.scale.x);
      tallest = Math.max(tallest, tv.root.scale.y);
      // Scaled about the foot (x 0, y 0): the root's own origin stays put.
      expect(tv.root.position.x).toBeCloseTo(0, 6);
      expect(tv.root.position.y).toBeCloseTo(0, 6);
    }
    // Squash across, then stretch up (jellyAt's keys).
    expect(widest).toBeCloseTo(1.03, 2);
    expect(tallest).toBeCloseTo(1.035, 2);
    settle();
    expect(tv.root.scale.toArray()).toEqual([1.015, 1.015, 1.015]);
    spotlight.show(null);
    settle();
    expect(tv.root.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('follows the jelly’s keys, smoothstepped, and holds the last', () => {
    expect(jellyAt(0)).toEqual([1, 1]);
    expect(jellyAt(0.2)).toEqual([1.03, 0.97]);
    expect(jellyAt(0.45)[1]).toBeCloseTo(1.035, 6);
    expect(jellyAt(1)).toEqual([1.015, 1.015]);
    expect(jellyAt(3)).toEqual([1.015, 1.015]);
    const [across] = jellyAt(0.1);
    expect(across).toBeCloseTo(1.015, 6);
  });

  it('keeps the foot where it was for a prop whose origin is elsewhere', () => {
    const { spotlight, radio, settle } = setup();
    spotlight.show('radio');
    settle();
    // Scaled about x = 3: the origin at x = 3 is the pivot itself, so it stays; the box's top rises.
    expect(radio.root.position.x).toBeCloseTo(3, 6);
    expect(radio.root.scale.y).toBeCloseTo(1.015, 4);
  });

  it('brightens the lit prop’s baked colours while it is lit, and gives them back', () => {
    const { spotlight, tv, settle } = setup();
    const material = tv.mesh.material as MeshBasicMaterial;
    spotlight.show('tv');
    settle();
    expect(material.color.r).toBeCloseTo(0.5 * 1.12, 3);
    spotlight.show(null);
    settle();
    expect(material.color.r).toBeCloseTo(0.5, 6);
  });

  it('holds a prop the room needs still, and every prop under reduced motion, yet lights them', () => {
    const still = setup({ still: (target) => target === 'radio' });
    still.spotlight.show('radio');
    still.settle();
    expect(still.radio.root.scale.x).toBe(1);
    expect(still.told.at(-1)?.target).toBe('radio');

    const reduced = setup({ reduced: true });
    reduced.spotlight.show('tv');
    for (let i = 0; i < 10; i++) {
      reduced.frame();
      expect(reduced.tv.root.scale.x).toBe(1);
    }
    reduced.settle();
    expect((reduced.tv.mesh.material as MeshBasicMaterial).color.r).toBeCloseTo(0.56, 2);
  });

  it('draws the glow only once its programs are ready, and only while a prop has any', async () => {
    const { spotlight, frame, settle, renderer, compiled } = setup();
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    spotlight.show('tv');
    frame();
    expect(renderer.render).not.toHaveBeenCalled();
    compiled();
    await Promise.resolve();
    await Promise.resolve();
    frame();
    // The mask, the blur across and down, and the glow over the frame.
    expect(renderer.render).toHaveBeenCalledTimes(4);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.info.autoReset).toBe(true);
    spotlight.show(null);
    settle();
    renderer.render.mockClear();
    frame();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('lets go of everything: the poses and colours as they were, and no more frames', () => {
    const { spotlight, tv, frame, renderer, steps } = setup();
    spotlight.show('tv');
    for (let i = 0; i < 5; i++) frame();
    spotlight.dispose();
    expect(tv.root.scale.toArray()).toEqual([1, 1, 1]);
    expect((tv.mesh.material as MeshBasicMaterial).color.r).toBeCloseTo(0.5, 6);
    expect(steps.size).toBe(0);
    renderer.render.mockClear();
    frame();
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
