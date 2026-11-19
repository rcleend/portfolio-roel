/**
 * Vectors as plain triples. A module of its own, apart from the builder, because the bake reads these on the room's
 * main thread (bake/Baker.ts): whatever the room's chunk and the generators both import lands in the room's chunk, and
 * the MeshBuilder belongs with the generators (the worker, or the lazy roomBuilder chunk).
 */
export type Vec3 = readonly [number, number, number];
/** Linear RGB albedo. */
export type Rgb = readonly [number, number, number];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Two unit vectors that make a right-handed frame with `axis`. */
export function basis(axis: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const side = normalize(cross(helper, axis));
  return [side, cross(axis, side)];
}
