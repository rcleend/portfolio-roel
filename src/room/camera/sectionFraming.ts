import { MathUtils, Vector3 } from 'three';
import type { RoomSection } from '../viewState';
import type { Viewpoint } from './cameraPath';
import { boxCorners, frameSubject } from './framing';

/**
 * Art-directed subject bounds in room metres. The desk frames its working surface from
 * above the chair; the cabinet includes its drawers, radio and the whole lava lamp.
 * Portrait crops the desk's outer edges to keep the monitor and keyboard legible.
 */
export function sectionPoints(section: RoomSection, aspect: number): Vector3[] {
  if (section === 'drawer') {
    return boxCorners(new Vector3(0.27, 0.12, -2.28), new Vector3(1.63, 1.52, -1.77));
  }
  const wide = MathUtils.smoothstep(aspect, 0.62, 1.15);
  const min = new Vector3(-1.88, 0.74, -2.12).lerp(new Vector3(-2.43, 0.7, -2.25), wide);
  const max = new Vector3(-0.74, 1.4, -1.39).lerp(new Vector3(-0.4, 1.43, -1.12), wide);
  return boxCorners(min, max);
}

export function sectionViewpoint(section: RoomSection, aspect: number): Viewpoint {
  let fov = section === 'desk' ? 46 : 42;
  const direction = section === 'desk' ? new Vector3(-0.12, -0.45, -1) : new Vector3(0.04, -0.16, -1);
  const points = sectionPoints(section, aspect);
  const frame = () =>
    frameSubject({
      points,
      direction,
      up: new Vector3(0, 1, 0),
      fovY: fov,
      aspect,
      margin: 0.08,
    });
  let pose = frame();
  // A portrait lens widens instead of backing through the entrance wall to fit the props.
  while (pose.position.z > 0.8 && fov < 68) {
    fov += 2;
    pose = frame();
  }
  return { ...pose, fov };
}
