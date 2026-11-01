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
      idleCursor: () => 'idle',
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
    interaction.register({ id: 'pc', object: pc, cursor: () => 'enter', activate: pcClick });
    const removeTv = interaction.register({ id: 'tv', object: tv, cursor: () => 'idle', activate: tvClick });
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
      idleCursor: () => 'idle',
      isEnabled: () => true,
      background: queue(tasks),
    });
    const sphere = new Mesh(new SphereGeometry(1, 96, 64), new MeshBasicMaterial());
    sphere.updateMatrixWorld();
    const hits: unknown[] = [];
    interaction.register({
      id: 'desk',
      object: sphere,
      cursor: () => 'enter',
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
      idleCursor: () => 'idle',
      isEnabled: () => true,
      background: queue(tasks),
    });
    // A mesh at z 0 the custom ray test would hide behind: nearer wins either way.
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    box.updateMatrixWorld();
    const boxClicks = vi.fn();
    interaction.register({ id: 'box', object: box, cursor: () => 'idle', activate: boxClicks });
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
      cursor: () => 'press',
      activate,
      pointerDown,
      pointerMove: (hit) => moves.push(hit?.object ?? null),
      pointerUp,
    });
    // Only the box is queued for cutting; the custom target's meshes are never collected.
    expect(tasks).toHaveLength(1);
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(canvas.dataset.cursor).toBe('press');
    // Drawn as the page's own cursor for it, else the stock one.
    expect(canvas.style.cursor).toBe('var(--room-cursor-press, pointer)');
    distance = 9;
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(canvas.dataset.cursor).toBe('idle');
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
      idleCursor: () => 'idle',
      isEnabled: () => true,
      background: queue(tasks),
    });
    const sphere = new Mesh(new SphereGeometry(1, 96, 64), new MeshBasicMaterial());
    const unregister = interaction.register({
      id: 'desk',
      object: sphere,
      cursor: () => 'enter',
      activate: () => {},
    });
    unregister();
    expect(tasks).toEqual([]);
    interaction.dispose();
  });

  it('says again what the pointer rests on when the camera has landed', () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const hovers: (string | null)[] = [];
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss: () => {},
      idleCursor: () => 'idle',
      isEnabled: () => true,
      onHover: (interactable) => hovers.push(interactable?.id ?? null),
    });
    const tv = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    tv.updateMatrixWorld();
    interaction.register({ id: 'tv', object: tv, cursor: () => 'enter', activate: () => {} });
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 }),
    );
    expect(hovers).toEqual(['tv']);
    // The spotlight's door forgets its hover as the camera sets off: the prop still under the pointer is said again.
    interaction.refreshCursor();
    expect(hovers).toEqual(['tv', 'tv']);
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
      idleCursor: () => 'idle',
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

  it('ignores the clicks of the pointer types it is asked to, but not the gestures a target owns', () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const onMiss = vi.fn();
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss,
      idleCursor: () => 'idle',
      isEnabled: () => true,
      ignoresClick: (pointerType) => pointerType === 'touch',
    });
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const tv = new Mesh(geometry, material);
    tv.updateMatrixWorld();
    const activate = vi.fn();
    const pointerDown = vi.fn(() => true);
    interaction.register({ id: 'tv', object: tv, cursor: () => 'play', activate, pointerDown, pointerUp: () => {} });
    const tap = (x: number, pointerType: string) => {
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 100, pointerType }),
        );
      }
    };
    tap(10, 'touch');
    expect(onMiss).not.toHaveBeenCalled();
    tap(100, 'touch');
    expect(pointerDown).toHaveBeenCalledOnce();
    tap(10, 'mouse');
    expect(onMiss).toHaveBeenCalledOnce();
    interaction.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('hands a press nothing took to whoever claims it, whose release is then no click', () => {
    const canvas = stageCanvas();
    vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {});
    vi.spyOn(canvas, 'hasPointerCapture').mockReturnValue(true);
    vi.spyOn(canvas, 'releasePointerCapture').mockImplementation(() => {});
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const onMiss = vi.fn();
    const pointerUp = vi.fn();
    const tv = { id: 'tv', object: new Object3D(), cursor: () => 'play' as const, activate: vi.fn(), pointerUp };
    // Claims touches in the lower half of the canvas (NDC y below 0), as the TV does on its title.
    const claimsPress = vi.fn((pointerType: string, ndc: { y: number }) =>
      pointerType === 'touch' && ndc.y < 0 ? tv : null,
    );
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss,
      idleCursor: () => 'idle',
      isEnabled: () => true,
      claimsPress,
    });
    const tap = (y: number, pointerType: string) => {
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: y, pointerType }),
        );
      }
    };
    tap(180, 'touch');
    expect(pointerUp).toHaveBeenCalledOnce();
    expect(canvas.setPointerCapture).toHaveBeenCalledOnce();
    expect(onMiss).not.toHaveBeenCalled();
    tap(20, 'touch');
    expect(onMiss).toHaveBeenCalledOnce();
    tap(180, 'mouse');
    expect(onMiss).toHaveBeenCalledTimes(2);
    expect(pointerUp).toHaveBeenCalledOnce();
    interaction.dispose();
  });

  it("redraws a resting mouse's cursor when what a click would do changes under it, a gesture's owner included", () => {
    const canvas = stageCanvas();
    const camera = new PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const onHover = vi.fn();
    const interaction = new RoomInteraction({
      canvas,
      camera,
      onMiss: () => {},
      idleCursor: () => 'leave',
      isEnabled: () => true,
      onHover,
    });
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const tv = new Mesh(geometry, material);
    tv.updateMatrixWorld();
    let game: 'play' | 'walk-right' | 'attack-left' = 'play';
    interaction.register({
      id: 'tv',
      object: tv,
      gestureSurface: tv,
      cursor: () => game,
      activate: () => {},
      pointerDown: () => true,
      pointerUp: () => {},
    });
    // Nothing to redraw before a mouse rests on the stage.
    interaction.redrawCursor();
    expect(canvas.dataset.cursor).toBeUndefined();
    const at = { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100, pointerType: 'mouse' };
    canvas.dispatchEvent(new PointerEvent('pointermove', at));
    expect(canvas.dataset.cursor).toBe('play');
    const hovers = onHover.mock.calls.length;
    game = 'walk-right';
    interaction.redrawCursor();
    expect(canvas.dataset.cursor).toBe('walk-right');
    // Drawn as the page's own, else a pointer; an attack's stock cursor is a crosshair.
    expect(canvas.style.cursor).toBe('var(--room-cursor-walk-right, pointer)');
    vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {});
    canvas.dispatchEvent(new PointerEvent('pointerdown', at));
    game = 'attack-left';
    interaction.redrawCursor();
    expect(canvas.style.cursor).toBe('var(--room-cursor-attack-left, crosshair)');
    // A redraw is not a new hover: the spotlight hears nothing of it.
    expect(onHover.mock.calls.length).toBe(hovers);
    interaction.dispose();
    geometry.dispose();
    material.dispose();
  });
});
