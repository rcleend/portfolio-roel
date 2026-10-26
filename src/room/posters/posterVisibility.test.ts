import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { anyInView, decorBoxes } from './posterVisibility';

const userData = {
  decor: [
    { decor_id: 'A1', min: [-0.2, 1.0, -2.4], max: [0.2, 1.5, -2.39] },
    { decor_id: 'B1', min: [1.0, 1.0, -2.4], max: [1.4, 1.5, -2.39] },
  ],
};

function cameraAt(position: Vector3, target: Vector3): PerspectiveCamera {
  const camera = new PerspectiveCamera(40, 16 / 9, 0.03, 60);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return camera;
}

describe('decorBoxes', () => {
  it('reads one box per item from the node extras', () => {
    const boxes = decorBoxes(userData);
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toEqual(new Box3(new Vector3(1.0, 1.0, -2.4), new Vector3(1.4, 1.5, -2.39)));
  });

  it('refuses a node without boxes', () => {
    expect(() => decorBoxes({})).toThrow(/no decor boxes/);
    expect(() => decorBoxes({ decor: [] })).toThrow(/no decor boxes/);
  });
});

describe('anyInView', () => {
  const boxes = decorBoxes(userData);

  it('sees a box in front of the camera', () => {
    expect(anyInView(boxes, cameraAt(new Vector3(0, 1.25, 0), new Vector3(0, 1.25, -2.4)))).toBe(true);
  });

  it('sees nothing when the camera looks away', () => {
    expect(anyInView(boxes, cameraAt(new Vector3(0, 1.25, 0), new Vector3(0, 1.25, 2.4)))).toBe(false);
  });

  it('sees nothing in a close-up that frames something else', () => {
    // A narrow view of the floor to the left: neither box is in it.
    const camera = cameraAt(new Vector3(-1.5, 0.6, -1.0), new Vector3(-1.5, 0.0, -1.6));
    camera.fov = 20;
    camera.updateProjectionMatrix();
    expect(anyInView(boxes, camera)).toBe(false);
  });

  it('follows the camera when it turns back', () => {
    const camera = cameraAt(new Vector3(0, 1.25, 0), new Vector3(0, 1.25, 2.4));
    expect(anyInView(boxes, camera)).toBe(false);
    camera.lookAt(new Vector3(1.2, 1.25, -2.4));
    expect(anyInView(boxes, camera)).toBe(true);
  });
});
