// @vitest-environment happy-dom
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, SphereGeometry, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { IdleTask } from '../stage/IdleWork';
import { PICK_CHUNK_TRIANGLES } from './pickMeshes';
import { RoomInteraction } from './RoomInteraction';

function stageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    toJSON: () => ({}),
  });
  return canvas;
}

/** Background work that only collects its tasks, for the test to run. */
function queue(tasks: IdleTask[]) {
  return {
    add(task: IdleTask) {
      tasks.push(task);
      return () => {
        tasks.splice(tasks.indexOf(task), 1);
      };
    },
  };
}

function clickAt(canvas: HTMLCanvasElement, x: number, y = 100): void {
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
  }
}

describe('room target picking', () => {
  it('chooses the nearest real mesh and ignores clicks during a camera flight', () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const onMiss = vi.fn();
    let enabled = true;
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss,
      idleCursor: () => 'default',
      isEnabled: () => enabled,
    });
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const pc = new Mesh(geometry, material);
    const tv = new Mesh(geometry, material);
    tv.position.z = 2;
    tv.updateMatrixWorld();
    pc.updateMatrixWorld();
    const pcClick = vi.fn();
    const tvClick = vi.fn();
    interaction.register({ id: 'pc', object: pc, cursor: () => 'zoom-in', activate: pcClick });
    const removeTv = interaction.register({ id: 'tv', object: tv, cursor: () => 'default', activate: tvClick });
    const click = (x: number) => clickAt(canvas, x);
    click(100);
    expect(tvClick).toHaveBeenCalledTimes(1);
    expect(pcClick).not.toHaveBeenCalled();
    removeTv();
    click(100);
    expect(pcClick).toHaveBeenCalledTimes(1);
    enabled = false;
    click(100);
    expect(pcClick).toHaveBeenCalledTimes(1);
    enabled = true;
    click(10);
    expect(onMiss).toHaveBeenCalledTimes(1);
    interaction.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('cuts large meshes in the background and picks the whole mesh until then', () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const tasks: IdleTask[] = [];
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss: () => {},
      idleCursor: () => 'default',
      isEnabled: () => true,
      background: queue(tasks),
    });
    const sphere = new Mesh(new SphereGeometry(1, 96, 64), new MeshBasicMaterial());
    sphere.updateMatrixWorld();
    const hits: unknown[] = [];
    interaction.register({
      id: 'desk',
      object: sphere,
      cursor: () => 'zoom-in',
      activate: (hit) => hits.push(hit.object),
    });
    expect(tasks).toHaveLength(1);
    clickAt(canvas, 100);
    expect(hits).toEqual([sphere]);

    // The cut runs in many small units, then the same click finds the same mesh through a chunk.
    let units = 0;
    for (const task of tasks) while (!task.next().done) units++;
    expect(units).toBeGreaterThan(1);
    const raycast = vi.spyOn(Mesh.prototype, 'raycast');
    clickAt(canvas, 100);
    expect(hits).toEqual([sphere, sphere]);
    const tested = raycast.mock.contexts as Mesh[];
    expect(tested.length).toBeGreaterThan(1);
    expect(tested.every((mesh) => (mesh.geometry.index?.count ?? 0) <= PICK_CHUNK_TRIANGLES * 3)).toBe(true);
    interaction.dispose();
  });

  it('uses a custom ray test where one is given: never cut, nearest wins, gestures follow it', () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const tasks: IdleTask[] = [];
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss: () => {},
      idleCursor: () => 'default',
      isEnabled: () => true,
      background: queue(tasks),
    });
    // A mesh at z 0 the custom ray test would hide behind: nearer wins either way.
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    box.updateMatrixWorld();
    const boxClicks = vi.fn();
    interaction.register({ id: 'box', object: box, cursor: () => 'default', activate: boxClicks });
    const anchor = new Object3D();
    let distance = 2;
    const intersect = vi.fn(() => ({ hit: { object: anchor, point: new Vector3(), uv: null }, distance }));
    const activate = vi.fn();
    const moves: unknown[] = [];
    const pointerDown = vi.fn(() => true);
    const pointerUp = vi.fn();
    const big = new Mesh(new SphereGeometry(1, 96, 64), new MeshBasicMaterial());
    interaction.register({
      id: 'radio',
      object: big,
      intersect,
      cursor: () => 'pointer',
      activate,
      pointerDown,
      pointerMove: (hit) => moves.push(hit?.object ?? null),
      pointerUp,
    });
    // Only the box is queued for cutting; the custom target's meshes are never collected.
    expect(tasks).toHaveLength(1);
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(canvas.style.cursor).toBe('pointer');
    distance = 9;
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(canvas.style.cursor).toBe('default');
    distance = 2;
    vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {});
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerType: 'touch',
      }),
    );
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 100 }));
    // While it owns the gesture its moves are ray-tested by its own test too.
    expect(moves.at(-1)).toBe(anchor);
    expect(intersect.mock.calls.length).toBeGreaterThanOrEqual(4);
    // The owner learns what pressed (a touch acts on its release) and whether the browser cancelled the gesture.
    expect(pointerDown).toHaveBeenLastCalledWith(expect.anything(), 'touch');
    canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    expect(pointerUp).toHaveBeenLastCalledWith(true);
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        isPrimary: true,
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerType: 'mouse',
      }),
    );
    expect(pointerDown).toHaveBeenLastCalledWith(expect.anything(), 'mouse');
    vi.spyOn(canvas, 'hasPointerCapture').mockReturnValue(false);
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: 100, clientY: 100 }));
    expect(pointerUp).toHaveBeenLastCalledWith(false);
    expect(boxClicks).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    interaction.dispose();
  });

  it('drops a pending cut when its interactable goes', () => {
    const tasks: IdleTask[] = [];
    const interaction = new RoomInteraction({
      canvas: stageCanvas(),
      camera: new PerspectiveCamera(),
      onMiss: () => {},
      idleCursor: () => 'default',
      isEnabled: () => true,
      background: queue(tasks),
    });
    const sphere = new Mesh(new SphereGeometry(1, 96, 64), new MeshBasicMaterial());
    const unregister = interaction.register({
      id: 'desk',
      object: sphere,
      cursor: () => 'zoom-in',
      activate: () => {},
    });
    unregister();
    expect(tasks).toEqual([]);
    interaction.dispose();
  });

  it('keeps keyboard focus where it is while asked to, and still clicks', () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    let keep = true;
    const onMiss = vi.fn();
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss,
      idleCursor: () => 'default',
      isEnabled: () => true,
      keepsFocus: () => keep,
    });
    const press = () => {
      const event = new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, cancelable: true });
      canvas.dispatchEvent(event);
      canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, isPrimary: true, button: 0 }));
      return event.defaultPrevented;
    };
    expect(press()).toBe(true);
    expect(onMiss).toHaveBeenCalledTimes(1);
    keep = false;
    expect(press()).toBe(false);
    interaction.dispose();
  });
});
