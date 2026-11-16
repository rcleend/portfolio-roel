/**
 * The desktop wallpaper's picture, drawn by code: a sunlit green hill under a blue sky with fair-weather clouds, the
 * era's default-desktop feeling in a composition of its own. A pure function of the pixel, so every device draws the
 * same picture at any size and a band of rows can be drawn at a time.
 *
 * The picture is laid out in units of its height: `v` runs 0 (top) to 1, `u` is 0 at the middle column. Sky and
 * clouds live on a plane seen in perspective (small and flat towards the horizon); the hill's grass is shaded by its
 * place on the slope, by drifting cloud shadows and by a grain that follows the ground. Every pixel is dithered, so
 * no gradient bands.
 */

const TABLE_BITS = 8;
const TABLE_SIZE = 1 << TABLE_BITS;
const TABLE_MASK = TABLE_SIZE - 1;

let table: Float32Array | null = null;

/** A 32-bit integer mix (lowbias32, as `room/gen/kit/hash.ts`): the same lattice on every device. */
function hash32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** The noise lattice, hashed once: value noise is then four reads a sample. */
function lattice(): Float32Array {
  if (table) return table;
  table = new Float32Array(TABLE_SIZE * TABLE_SIZE);
  for (let i = 0; i < table.length; i++) table[i] = hash32(i + 0x9e3779b1) / 4294967296;
  return table;
}

/** Smooth value noise in 0..1 on the wrapping lattice. */
function noise(t: Float32Array, x: number, y: number): number {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  let fx = x - xf;
  let fy = y - yf;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = xf & TABLE_MASK;
  const x1 = (xf + 1) & TABLE_MASK;
  const row0 = (yf & TABLE_MASK) << TABLE_BITS;
  const row1 = ((yf + 1) & TABLE_MASK) << TABLE_BITS;
  const a = t[row0 | x0] as number;
  const b = t[row1 | x0] as number;
  const top = a + ((t[row0 | x1] as number) - a) * fx;
  const bottom = b + ((t[row1 | x1] as number) - b) * fx;
  return top + (bottom - top) * fy;
}

/** Layered noise, 0..1; each layer is turned against the last, so the lattice's grid never lines up. */
function fbm(t: Float32Array, x: number, y: number, octaves: number): number {
  let sum = 0;
  let gain = 0.5;
  for (let octave = 0; octave < octaves; octave++) {
    sum += gain * noise(t, x, y);
    const turned = x * 1.6 + y * 1.2 + 17.3;
    y = y * 1.6 - x * 1.2 + 9.1;
    x = turned;
    gain *= 0.5;
  }
  return sum / (1 - gain * 2);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const s = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return s * s * (3 - 2 * s);
}

/** Where the sky meets the far land, as a share of the height. */
const HORIZON = 0.6;
/** Cloud cover above this is cloud. */
const CLOUD_EDGE = 0.61;
/** The cover's fine layers together, and what all its layers come to. */
const CLOUD_FINE = 0.16 + 0.1 + 0.06;
const CLOUD_NORM = 1 / (0.75 + CLOUD_FINE);

/**
 * The sky's colour at (`u`, `v`) into `out[at..at + 2]`: the gradient, the high streaks, the cumulus and the far
 * ridge (`ridge` is its skyline at this column).
 */
function paintSky(t: Float32Array, out: Float32Array, at: number, u: number, v: number, ridge: number): void {
  const up = Math.max(0, HORIZON - v) / HORIZON;
  // Deep overhead, paler down to the haze, brighter towards the sun (upper left, out of the frame).
  const depth = up ** 0.78;
  const sun = Math.max(0, 1 - Math.sqrt((u + 0.8) * (u + 0.8) + (v + 0.15) * (v + 0.15)) / 1.35);
  const glow = sun * sun;
  let r = 172 - 150 * depth + 30 * glow;
  let g = 211 - 122 * depth + 22 * glow;
  let b = 244 - 34 * depth + 6 * glow;

  // High, thin streaks, combed along the wind.
  const high = smoothstep(0.15, 0.7, up) * 0.4;
  if (high > 0) {
    const veil = smoothstep(0.56, 0.86, fbm(t, u * 1.3 + v * 2.2 + 4, (v - u * 0.42) * 11 + 2, 2)) * high;
    r += (250 - r) * veil;
    g += (252 - g) * veil;
    b += (255 - b) * veil;
  }

  // Cumulus in loose fields with clear blue between; far clouds are smaller, and flatter above the horizon.
  let x = (u * 5.4) / (up + 0.46) + 5.2;
  let y = 8.6 * Math.log(up + 0.46);
  const field = (noise(t, x * 0.2 + 3.1, y * 0.2 + 8.6) - 0.5) * 0.46;
  const warp = noise(t, x * 0.6 + 31, y * 0.6 + 7) - 0.5;
  x += warp * 0.8;
  y -= warp * 0.5;
  const x1 = x * 1.6 + y * 1.2 + 17.3;
  const y1 = y * 1.6 - x * 1.2 + 9.1;
  const coarse = 0.5 * noise(t, x, y) + 0.25 * noise(t, x1, y1);
  // Most of the sky: the coarse layers already rule a cloud out.
  if ((coarse + CLOUD_FINE) * CLOUD_NORM + field > CLOUD_EDGE) {
    const x2 = x1 * 1.6 + y1 * 1.2 + 17.3;
    const y2 = y1 * 1.6 - x1 * 1.2 + 9.1;
    const x3 = x2 * 1.6 + y2 * 1.2 + 17.3;
    const y3 = y2 * 1.6 - x2 * 1.2 + 9.1;
    const fine =
      0.16 * noise(t, x2, y2) +
      0.1 * noise(t, x3, y3) +
      0.06 * noise(t, x3 * 1.6 + y3 * 1.2 + 17.3, y3 * 1.6 - x3 * 1.2 + 9.1);
    const density = (coarse + fine) * CLOUD_NORM + field;
    if (density > CLOUD_EDGE) {
      // Lit from the sun's side: where the coarse cover falls away a step towards the light the cloud is white;
      // away from it, and deep inside, grey-blue.
      const sx = x - 0.2;
      const sy = y + 0.26;
      const towards =
        coarse - 0.5 * noise(t, sx, sy) - 0.25 * noise(t, sx * 1.6 + sy * 1.2 + 17.3, sy * 1.6 - sx * 1.2 + 9.1);
      const inside = smoothstep(CLOUD_EDGE + 0.03, CLOUD_EDGE + 0.26, density);
      const lit = Math.min(1, Math.max(0, 0.7 + towards * 5.6 - 0.16 * inside + (fine - 0.16) * 1.1));
      const far = (1 - up) ** 3;
      const alpha = smoothstep(CLOUD_EDGE, CLOUD_EDGE + 0.085, density) * (1 - 0.45 * far);
      r += (128 + 127 * lit + 24 * far - r) * alpha;
      g += (147 + 108 * lit + 12 * far - g) * alpha;
      b += (186 + 69 * lit - b) * alpha;
    }
  }

  // The far ridge: blue with distance, greener where the sun finds its folds.
  const below = v - ridge;
  if (below > -0.004) {
    const ridgeLand = smoothstep(-0.004, 0.002, below);
    const fold = fbm(t, u * 9 + 3, below * 40 + u * 3, 3);
    const deep = Math.min(1, Math.max(0, below * 14));
    r += (100 + 34 * fold - 24 * deep - r) * ridgeLand;
    g += (138 + 40 * fold - 10 * deep - g) * ridgeLand;
    b += (176 - 34 * fold - 50 * deep - b) * ridgeLand;
  }
  out[at] = r;
  out[at + 1] = g;
  out[at + 2] = b;
}

/**
 * What the rows share, per picture size: the skylines per column, and the two rows of the sky's grid the row being
 * drawn lies between. The sky is soft, so it is worked out at every other pixel of every other row and smoothed
 * between: a quarter of its cost.
 */
interface Frame {
  readonly width: number;
  readonly height: number;
  /** The hill's crest (`v`) per column: a broad summit right of the middle, falling away to both sides. */
  readonly crest: Float32Array;
  /** The far ridge's skyline per column, seen where the hill leaves it uncovered. */
  readonly ridge: Float32Array;
  /** The grid rows above and below, RGB per grid column, and which rows they are. */
  above: Float32Array;
  below: Float32Array;
  aboveRow: number;
  belowRow: number;
}

let frame: Frame | null = null;

function frameFor(t: Float32Array, width: number, height: number): Frame {
  if (frame && frame.width === width && frame.height === height) return frame;
  const crest = new Float32Array(width + 2);
  const ridge = new Float32Array(width + 2);
  for (let x = 0; x < width + 2; x++) {
    const u = (x + 0.5 - width / 2) / height;
    const d = (u - 0.17) / 0.56;
    crest[x] = 0.615 - 0.1 * Math.exp(-d * d) + 0.014 * (noise(t, u * 1.9 + 40, 7.5) - 0.5);
    ridge[x] = 0.585 - 0.075 * fbm(t, u * 1.7 + 11, 3.3, 4);
  }
  const columns = (width >> 1) + 2;
  frame = {
    width,
    height,
    crest,
    ridge,
    above: new Float32Array(columns * 3),
    below: new Float32Array(columns * 3),
    aboveRow: -1,
    belowRow: -1,
  };
  return frame;
}

/** Works out grid row `row` of the sky (pixel row `2 × row`), wherever the hill does not cover it. */
function paintSkyRow(t: Float32Array, f: Frame, out: Float32Array, row: number): void {
  const pixel = 1 / f.height;
  const v = (row * 2 + 0.5) * pixel;
  for (let column = 0, x = 0; x < f.width + 2; column++, x += 2) {
    // A few pixels into the hill, for the pixels of its skyline.
    if (v - (f.crest[x] as number) > 5 * pixel) continue;
    paintSky(t, out, column * 3, (x + 0.5 - f.width / 2) * pixel, v, f.ridge[x] as number);
  }
}

/** One channel of the sky between its grid's four nearest points: `i` in the row above, `i + 3` beside it. */
function between(above: Float32Array, below: Float32Array, i: number, across: number, downward: number): number {
  const a = above[i] as number;
  const b = below[i] as number;
  const top = a + ((above[i + 3] as number) - a) * across;
  return top + (b + ((below[i + 3] as number) - b) * across - top) * downward;
}

/**
 * Draws rows `from` (inclusive) to `to` (exclusive) of the picture into `data`, the RGBA rows of a `width` × `height`
 * image.
 */
export function paintWallpaperRows(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  from: number,
  to: number,
): void {
  const t = lattice();
  const f = frameFor(t, width, height);
  const crest = f.crest;
  const pixel = 1 / height;
  const soft = 0.75 * pixel;
  for (let y = Math.max(0, from); y < Math.min(height, to); y++) {
    const v = (y + 0.5) * pixel;
    // The sky's grid rows this row lies between; rows drawn in order work each out once.
    const gridRow = y >> 1;
    if (f.aboveRow !== gridRow) {
      if (f.belowRow === gridRow) {
        const swap = f.above;
        f.above = f.below;
        f.below = swap;
        f.belowRow = -1;
      } else paintSkyRow(t, f, f.above, gridRow);
      f.aboveRow = gridRow;
    }
    if (f.belowRow !== gridRow + 1) {
      paintSkyRow(t, f, f.below, gridRow + 1);
      f.belowRow = gridRow + 1;
    }
    const above = f.above;
    const below = f.below;
    const downward = (y & 1) * 0.5;
    let o = y * width * 4;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5 - width / 2) * pixel;
      const hill = crest[x] as number;
      let r = 0;
      let g = 0;
      let b = 0;

      // How much of this pixel is hill: its skyline is smoothed over a pixel and a half.
      const land = smoothstep(-soft, soft, v - hill);

      if (land < 1) {
        const i = (x >> 1) * 3;
        const across = (x & 1) * 0.5;
        r = between(above, below, i, across, downward);
        g = between(above, below, i + 1, across, downward);
        b = between(above, below, i + 2, across, downward);
      }

      if (land > 0) {
        // 0 at the crest, 1 at the bottom of the picture.
        const slope = Math.max(0, v - hill) / (1 - hill);
        // Rows of grass crowd together towards the crest, as ground seen at a glancing angle does.
        const row = Math.sqrt(slope);
        // Cloud shadows lying over the slope.
        const shadow = smoothstep(0.5, 0.68, fbm(t, u * 1.3 + row * 0.5 + 12.3, row * 2.1 + 4.4, 2));
        // The sun rakes the hill from the left: full on the near shoulder, falling away over the summit's far side.
        const facing = smoothstep(0.8, -0.45, u + slope * 0.3);
        const swell = noise(t, u * 3.4 + 8, row * 4.6 + 1) - 0.5;
        // Grass: tufts that follow the ground, and blades a pixel wide and two long.
        const tuft = fbm(t, u * 200 + 3, row * 130, 2) - 0.5;
        const blade = (t[(((y >> 1) & TABLE_MASK) << TABLE_BITS) | ((x + 91) & TABLE_MASK)] as number) - 0.5;
        // The foreground is nearer: coarser, and darker where the hill rolls under.
        const near = smoothstep(0.45, 1, slope);
        let light =
          (0.36 + 0.7 * facing) * (1 - 0.5 * shadow) * (1 - 0.3 * near) +
          swell * 0.2 +
          tuft * (0.1 + 0.3 * slope) +
          blade * (0.03 + 0.07 * near);
        // The crest catches the light.
        if (slope < 0.3) light += 0.16 * Math.exp(-slope * 14) * facing;

        let lr = 12 + 96 * light + 92 * light * light;
        let lg = 44 + 168 * light;
        let lb = 8 + 34 * light - 14 * light * light;
        // Air between here and the hill: its top is a touch bluer and paler.
        const thin = (1 - slope) * (1 - slope);
        const air = 0.2 * thin * thin;
        lr += (150 - lr) * air;
        lg += (200 - lg) * air;
        lb += (205 - lb) * air;
        // Flowers in the near grass.
        if (near > 0 && tuft > 0) {
          const bloom = noise(t, x * 0.45 + 71, y * 0.45 + 13);
          if (bloom > 0.89) {
            const petal = Math.min(1, (bloom - 0.89) * 16) * near;
            lr += (244 - lr) * petal;
            lg += (224 - lg) * petal;
            lb += (60 - lb) * petal;
          }
        }
        r += (lr - r) * land;
        g += (lg - g) * land;
        b += (lb - b) * land;
      }

      // Dither: a film's grain, and no banding in the sky's gradient.
      const grain = ((t[((y & TABLE_MASK) << TABLE_BITS) | (x & TABLE_MASK)] as number) - 0.5) * 3;
      data[o++] = r + grain;
      data[o++] = g + grain;
      data[o++] = b + grain;
      data[o++] = 255;
    }
  }
}
