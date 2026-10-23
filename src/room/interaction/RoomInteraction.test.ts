// @vitest-environment happy-dom
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RoomInteraction } from './RoomInteraction';

describe('room target picking', () => {
  it('chooses the nearest real mesh and ignores clicks during a camera flight', () => {
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
    const click = (x: number) => {
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 100 }),
        );
      }
    };
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
});
