/**
 * The room's TV view as the startup still needs it (docs/ROOM.md › Startup): `tvViewpoint` and `frameSubject`
 * (room/tv/tvFraming.ts, room/camera/framing.ts) again in plain numbers, for a set that faces −x, so the still's
 * inline script places every point where the live camera will without three.js. `camera.test.ts` holds it to the
 * room's own over a grid of viewports; a change to the framing there must be made here.
 *
 * Points are in view space, [right, up, depth]: the camera always looks along the set's axis pitched 4° down, so
 * only where the eye stands and how wide the lens is depend on the viewport.
 */
export type Point = readonly [number, number, number];

export interface StillFraming {
  /** The set's bounds, as `TV_SPEC.bounds`: min then max. */
  readonly bounds: readonly [Point, Point];
  /** The game's picture on the glass, as `pictureOutline` traces it. */
  readonly picture: readonly Point[];
}

/** The strips of the viewport the touch pad covers (CSS px), as `room.setFramingInsets` takes them. */
export interface StillInsets {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

export interface StillCamera {
  /** A world point's place on the viewport, in CSS px. */
  project(point: Point): [number, number];
  /** The game's picture: left, top, width, height in CSS px. */
  readonly picture: readonly [number, number, number, number];
  /** The eye in view space and the vertical field of view in degrees, for the tests and the still's generator. */
  readonly eye: Point;
  readonly fov: number;
}

const RAD = Math.PI / 180;
// tvFraming.ts: TV_PITCH_DEGREES, TV_FOV, TV_MAX_FOV, TV_MAX_DISTANCE, TV_MARGIN, PICTURE_MARGIN, MIN_PICTURE_HEIGHT.
const COS = Math.cos(4 * RAD);
const SIN = Math.sin(4 * RAD);

/** View space back to the world. */
export const unseen = ([right, up, depth]: Point): Point => [COS * depth + SIN * up, COS * up - SIN * depth, right];

/** World to view space. */
const seen = ([x, y, z]: Point): Point => [z, SIN * x + COS * y, COS * x - SIN * y];

type Bounds = [minX: number, maxX: number, minY: number, maxY: number];

/** Where view-space points land in NDC from `eye` (framing.ts › project). */
function bounds(points: readonly Point[], eye: Point, tanX: number, tanY: number): Bounds {
  const b: Bounds = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of points) {
    const depth = p[2] - eye[2];
    const x = (p[0] - eye[0]) / (depth * tanX);
    const y = (p[1] - eye[1]) / (depth * tanY);
    b[0] = Math.min(b[0], x);
    b[1] = Math.max(b[1], x);
    b[2] = Math.min(b[2], y);
    b[3] = Math.max(b[3], y);
  }
  return b;
}

export function stillCamera(framing: StillFraming, width: number, height: number, insets: StillInsets): StillCamera {
  const [min, max] = framing.bounds;
  const middle = seen([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]);
  const picture = framing.picture.map(seen);
  const aspect = width / height;
  // The region the pad leaves free, in NDC (framing.ts › regionFromInsets).
  const left = (insets.left / width) * 2 - 1;
  const right = 1 - (insets.right / width) * 2;
  const bottom = (insets.bottom / height) * 2 - 1;
  let tanX = 0;
  let tanY = 0;

  /** frameSubject: the nearest eye from which `points` fit the region less `margin`, centred in it. */
  const pose = (points: readonly Point[], margin: number, fov: number): Point => {
    tanY = Math.tan((fov * RAD) / 2);
    tanX = tanY * aspect;
    const centre = [0, 1, 2].map((axis) => points.reduce((sum, p) => sum + (p[axis] as number), 0) / points.length);
    const [cx, cy, cz] = centre as [number, number, number];
    const span = Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz)), 1e-3);
    let near = Math.max(...points.map((p) => cz - p[2]), 0) + span * 1e-3;
    let far = near + span * 1e4;
    const innerWidth = (right - left) * (1 - 2 * margin);
    const innerHeight = (1 - bottom) * (1 - 2 * margin);
    let eye: Point = [0, 0, 0];
    let fits = true;
    const solve = (distance: number): void => {
      let [x, y] = [cx, cy];
      let b = bounds(points, [x, y, cz - distance], tanX, tanY);
      for (let i = 0; i < 6; i++) {
        x += ((b[0] + b[1] - left - right) / 2) * distance * tanX;
        y += ((b[2] + b[3] - bottom - 1) / 2) * distance * tanY;
        b = bounds(points, [x, y, cz - distance], tanX, tanY);
      }
      eye = [x, y, cz - distance];
      fits = b[1] - b[0] <= innerWidth && b[3] - b[2] <= innerHeight;
    };
    for (let i = 0; i < 48; i++) {
      const mid = (near + far) / 2;
      solve(mid);
      if (fits) far = mid;
      else near = mid;
    }
    solve(far);
    return eye;
  };

  /** tvViewpoint › frame: the lens widens rather than the eye standing further back than the desk allows. */
  let fov = 0;
  const frame = (points: readonly Point[], margin: number): Point => {
    let eye: Point;
    fov = 26;
    do {
      fov += 2;
      eye = pose(points, margin, fov);
    } while (middle[2] - eye[2] > 1.75 && fov < 60);
    return eye;
  };

  const pictureBounds = (eye: Point): Bounds => bounds(picture, eye, tanX, tanY);
  let eye: Point | null = null;
  if (width >= height) {
    const corners: Point[] = [];
    for (let i = 0; i < 8; i++)
      corners.push(seen([(i & 1 ? max : min)[0], (i & 2 ? max : min)[1], (i & 4 ? max : min)[2]]));
    eye = frame(corners, 0.06);
    const b = pictureBounds(eye);
    if (((b[3] - b[2]) / 2) * height < 300) eye = null;
  }
  eye ??= frame(picture, 0.001);
  const [ex, ey, ez] = eye;
  const [fx, fy] = [tanX, tanY];
  const b = pictureBounds(eye);
  const px = (x: number): number => ((x + 1) / 2) * width;
  const py = (y: number): number => ((1 - y) / 2) * height;
  return {
    project(point) {
      const p = seen(point);
      const depth = p[2] - ez;
      return [px((p[0] - ex) / (depth * fx)), py((p[1] - ey) / (depth * fy))];
    },
    picture: [px(b[0]), py(b[3]), px(b[1]) - px(b[0]), py(b[2]) - py(b[3])],
    eye,
    fov,
  };
}
