/**
 * Resolution-independent shapes as inside-tests.
 *
 * Procedural lettering is designed as geometry and only becomes pixels when a
 * `Mask` samples it at pixel centres. Keeping shapes as functions lets a
 * design be sheared, stretched or roughened before it is rasterised, so the
 * same letter drawing serves every size and slant without resampling pixels.
 */
export type Shape = (x: number, y: number) => boolean;

/** A polygon corner, written as a tuple so letter outlines stay compact to author. */
export type Vertex = readonly [x: number, y: number];

/** Never inside; the identity for `union`. */
export const empty: Shape = () => false;

/** Axis-aligned box covering [x0, x1) × [y0, y1). */
export function rect(x0: number, y0: number, x1: number, y1: number): Shape {
  return (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): Shape {
  return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

export function circle(cx: number, cy: number, r: number): Shape {
  return ellipse(cx, cy, r, r);
}

/** Box with independently rounded corners (radii clockwise from top-left). */
export function roundedRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radii: readonly [topLeft: number, topRight: number, bottomRight: number, bottomLeft: number],
): Shape {
  const [tl, tr, br, bl] = radii;
  const box = rect(x0, y0, x1, y1);
  const corner = (cx: number, cy: number, r: number, x: number, y: number): boolean =>
    r <= 0 || (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  return (x, y) => {
    if (!box(x, y)) return false;
    if (x < x0 + tl && y < y0 + tl) return corner(x0 + tl, y0 + tl, tl, x, y);
    if (x >= x1 - tr && y < y0 + tr) return corner(x1 - tr, y0 + tr, tr, x, y);
    if (x >= x1 - br && y >= y1 - br) return corner(x1 - br, y1 - br, br, x, y);
    if (x < x0 + bl && y >= y1 - bl) return corner(x0 + bl, y1 - bl, bl, x, y);
    return true;
  };
}

/** Simple or self-intersecting polygon, filled with the even-odd rule. */
export function polygon(vertices: readonly Vertex[]): Shape {
  if (vertices.length < 3) throw new RangeError('polygon: at least three vertices are required');
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return (x, y) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return false;
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i] as Vertex;
      const [xj, yj] = vertices[j] as Vertex;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

/** A straight stroke of the given width between two points, with square ends. */
export function stroke(from: Vertex, to: Vertex, width: number): Shape {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const length = Math.hypot(x1 - x0, y1 - y0);
  if (length === 0) return empty;
  const nx = (-(y1 - y0) / length) * (width / 2);
  const ny = ((x1 - x0) / length) * (width / 2);
  return polygon([
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ]);
}

export function union(...shapes: readonly Shape[]): Shape {
  return (x, y) => shapes.some((shape) => shape(x, y));
}

export function intersect(...shapes: readonly Shape[]): Shape {
  return (x, y) => shapes.every((shape) => shape(x, y));
}

/** `base` with every `cut` removed — counters, notches and slits. */
export function subtract(base: Shape, ...cuts: readonly Shape[]): Shape {
  return (x, y) => base(x, y) && !cuts.some((cut) => cut(x, y));
}

export function translate(shape: Shape, dx: number, dy: number): Shape {
  return (x, y) => shape(x - dx, y - dy);
}

/** Scales about `origin`; a horizontal factor above 1 extends letters the way a wide cut of a typeface does. */
export function scale(shape: Shape, sx: number, sy: number, origin: Vertex = [0, 0]): Shape {
  const [ox, oy] = origin;
  return (x, y) => shape(ox + (x - ox) / sx, oy + (y - oy) / sy);
}

/** Rotates by `angle` radians (clockwise on screen, where y points down) about `origin`. */
export function rotate(shape: Shape, angle: number, origin: Vertex): Shape {
  const [ox, oy] = origin;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (x, y) => {
    const [dx, dy] = [x - ox, y - oy];
    return shape(ox + dx * cos + dy * sin, oy - dx * sin + dy * cos);
  };
}

/**
 * Italicises: points above `baseline` lean right by `slant` pixels per pixel
 * of height, so the baseline itself stays put.
 */
export function shear(shape: Shape, slant: number, baseline: number): Shape {
  return (x, y) => shape(x - (baseline - y) * slant, y);
}

/**
 * Samples `shape` through a displacement field. A smooth, low-amplitude
 * field wobbles straight edges into the irregular outline of hand-cut
 * lettering without changing the overall design.
 */
export function displace(shape: Shape, field: (x: number, y: number) => Vertex): Shape {
  return (x, y) => {
    const [dx, dy] = field(x, y);
    return shape(x + dx, y + dy);
  };
}
