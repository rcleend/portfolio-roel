/**
 * A small software rasteriser for the startup still's generator (docs/ROOM.md › Startup): triangles drawn with a
 * depth buffer through one pinhole camera, to find what a layer of the room covers and how deep each pixel of it is.
 * No three.js and no GPU, so it runs the same in the generator and in the test that holds the still to the room.
 */
export type Vec3 = readonly [number, number, number];

/** A pinhole on the TV view's axis: world points to pixels of a plane `scale` px per unit of tangent. */
export interface Pinhole {
  readonly eye: Vec3;
  /** Unit vectors: the view's right, up and forward. */
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly scale: number;
}

export interface Raster {
  /** The window's first pixel on the camera's plane (px, y down), and its size. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Depth along the view of the nearest surface a pixel shows; Infinity where there is none. */
  readonly depth: Float32Array;
  /** Which triangle (its index in what was drawn) that surface is of; -1 where there is none. */
  readonly triangle: Int32Array;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A world point on the camera's plane: px right, px down, depth. */
export function toPlane(camera: Pinhole, point: Vec3): Vec3 {
  const rel: Vec3 = [point[0] - camera.eye[0], point[1] - camera.eye[1], point[2] - camera.eye[2]];
  const depth = dot(rel, camera.forward);
  return [(dot(rel, camera.right) / depth) * camera.scale, (-dot(rel, camera.up) / depth) * camera.scale, depth];
}

/** The world point a pixel of the plane shows at `depth`. */
export function fromPlane(camera: Pinhole, x: number, y: number, depth: number): Vec3 {
  const [r, u] = [(x / camera.scale) * depth, (-y / camera.scale) * depth];
  return [0, 1, 2].map(
    (axis) =>
      (camera.eye[axis] as number) +
      (camera.right[axis] as number) * r +
      (camera.up[axis] as number) * u +
      (camera.forward[axis] as number) * depth,
  ) as unknown as Vec3;
}

/**
 * Draws triangles (nine floats each in `positions`, those listed in `triangles`) into a window just large enough
 * for them, clipped to `limit` (left, top, right, bottom on the plane) where one is given, or into `window`.
 */
export function rasterise(
  camera: Pinhole,
  positions: ArrayLike<number>,
  triangles: readonly number[],
  limit?: readonly [number, number, number, number],
  window?: Pick<Raster, 'left' | 'top' | 'width' | 'height'>,
): Raster {
  const plane = new Float64Array(triangles.length * 9);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  triangles.forEach((triangle, i) => {
    for (let corner = 0; corner < 3; corner++) {
      const at = triangle * 9 + corner * 3;
      const p = toPlane(camera, [positions[at] as number, positions[at + 1] as number, positions[at + 2] as number]);
      plane.set(p, i * 9 + corner * 3);
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  });
  if (limit)
    [minX, minY, maxX, maxY] = [
      Math.max(minX, limit[0]),
      Math.max(minY, limit[1]),
      Math.min(maxX, limit[2]),
      Math.min(maxY, limit[3]),
    ];
  // A pixel of margin all round, so every outline closes inside the window.
  const left = window?.left ?? Math.floor(minX) - 2;
  const top = window?.top ?? Math.floor(minY) - 2;
  const width = window?.width ?? Math.max(1, Math.ceil(maxX) + 2 - left);
  const height = window?.height ?? Math.max(1, Math.ceil(maxY) + 2 - top);
  const depth = new Float32Array(width * height).fill(Infinity);
  const index = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < triangles.length; i++) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = plane.subarray(i * 9, i * 9 + 9) as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0 || az <= 0 || bz <= 0 || cz <= 0) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - left));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx) - left));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - top));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy) - top));
    for (let y = y0; y <= y1; y++) {
      const py = y + top + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + left + 0.5;
        // Barycentric weights of the pixel's centre; depth is interpolated as its reciprocal (perspective).
        const wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const z = 1 / (wa / az + wb / bz + wc / cz);
        const at = y * width + x;
        if (z < (depth[at] as number)) {
          depth[at] = z;
          index[at] = i;
        }
      }
    }
  }
  return { left, top, width, height, depth, triangle: index };
}
