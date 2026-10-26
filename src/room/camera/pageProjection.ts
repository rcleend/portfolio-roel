import { PerspectiveCamera, type Vector3 } from 'three';
import type { Viewpoint } from './cameraPath';

/** A viewport in CSS pixels. */
export interface PageViewport {
  readonly width: number;
  readonly height: number;
}

/** A world point on the page, in the room container's CSS pixels (+y down). */
export interface PagePoint {
  readonly x: number;
  readonly y: number;
  /** Behind the camera: x and y are then mirrored through the centre, as perspective division leaves them. */
  readonly behind: boolean;
}

const scratch = new PerspectiveCamera();

/**
 * Projects world points onto the page as a camera resting at `viewpoint` sees them. A scratch
 * camera is posed exactly as CameraRig poses the real one, so the two agree to the last bit,
 * but the real camera (parallax, flights) is never read.
 */
export function projectToPage(points: readonly Vector3[], viewpoint: Viewpoint, viewport: PageViewport): PagePoint[] {
  scratch.fov = viewpoint.fov;
  scratch.aspect = viewport.width / viewport.height;
  scratch.updateProjectionMatrix();
  scratch.position.copy(viewpoint.position);
  scratch.lookAt(viewpoint.target);
  scratch.updateMatrixWorld();
  return points.map((point) => {
    const ndc = point.clone().project(scratch);
    // Depth past the far plane, which for a point behind the camera is where projection puts it.
    const behind = ndc.z > 1;
    return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height, behind };
  });
}
