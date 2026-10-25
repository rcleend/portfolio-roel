// The radio is modelled on a real boombox; the room's radio carries no brand. These are the brand, model and
// marketing letterings its bakes pick up from the source model's texture, and the fill that paints them out
// with the moulding around them. optimize.mjs applies it to radio-base.glb's atlas and radio-closeup.mjs to the
// 2K skin; both are baked on the same unwrap, so one table in atlas UV space serves every resolution. The
// radio-base.glb on main predates this pass and its bake cannot be reproduced byte for byte, so debrand-base.mjs
// repaints that atlas once (geometry and UVs proven untouched) and republishes the manifest; verify.mjs checks
// every shipped radio atlas stays free of lettering.
//
// Rects are [left, top, right, bottom) in pixels of the 2048² skin (UV × 2048, v down as stored), with a margin
// of clean plastic round the glyphs' anti-aliasing. `along` is the direction the surface under the lettering
// runs: 'x' continues each row from the pixels left and right of the rect (horizontal bands), 'y' each column
// from above and below (vertical strips), 'xy' blends both (a flat face with a gentle gradient).

export const RADIO_LETTERING = [
  { name: 'brand logo under the cassette window (front panel, mirrored)', rect: [450, 1224, 497, 1240], along: 'x' },
  { name: 'bass-boost trademark by the tone knob (front panel, mirrored)', rect: [547, 1156, 575, 1167], along: 'x' },
  { name: 'compact-disc logo (lid top)', rect: [948, 1328, 985, 1354], along: 'xy' },
  { name: 'model number and product line (right side)', rect: [652, 1762, 678, 1860], along: 'y' },
  { name: 'speaker-box marketing line (left side)', rect: [417, 1752, 432, 1843], along: 'y' },
];

const SKIN_SIZE = 2048;
/** How many clean pixels beside the rect each end's colour is averaged over. */
const SAMPLE_DEPTH = 2;

/** One rect scaled to an atlas of `size` pixels, grown outwards so it still covers the glyphs. */
export function scaledRect([left, top, right, bottom], size) {
  const scale = size / SKIN_SIZE;
  return [Math.floor(left * scale), Math.floor(top * scale), Math.ceil(right * scale), Math.ceil(bottom * scale)];
}

/** Mean of `channels` values at the given pixels. */
function mean(data, width, channels, pixels) {
  const sum = new Float64Array(channels);
  for (const [x, y] of pixels) for (let c = 0; c < channels; c++) sum[c] += data[(y * width + x) * channels + c];
  return sum.map((value) => value / pixels.length);
}

function span(from, count, step) {
  return Array.from({ length: count }, (_, i) => from + i * step);
}

/**
 * Paints every lettering rect out of a square atlas in place: raw interleaved 8-bit pixels, `channels` per pixel.
 * Each fill interpolates between the clean pixels on either side of the rect, so the plastic's gradient carries
 * straight through where the lettering was.
 */
export function debrandAtlas(data, size, channels, lettering = RADIO_LETTERING) {
  for (const { rect, along } of lettering) {
    const [left, top, right, bottom] = scaledRect(rect, size);
    const depth = Math.max(1, Math.round((SAMPLE_DEPTH * size) / SKIN_SIZE));
    const rows = new Map();
    const columns = new Map();
    if (along !== 'y') {
      for (let y = top; y < bottom; y++) {
        const before = mean(
          data,
          size,
          channels,
          span(left - 1, depth, -1).map((x) => [x, y]),
        );
        const after = mean(
          data,
          size,
          channels,
          span(right, depth, 1).map((x) => [x, y]),
        );
        rows.set(y, [before, after]);
      }
    }
    if (along !== 'x') {
      for (let x = left; x < right; x++) {
        const before = mean(
          data,
          size,
          channels,
          span(top - 1, depth, -1).map((y) => [x, y]),
        );
        const after = mean(
          data,
          size,
          channels,
          span(bottom, depth, 1).map((y) => [x, y]),
        );
        columns.set(x, [before, after]);
      }
    }
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const tx = (x - left + 0.5) / (right - left);
        const ty = (y - top + 0.5) / (bottom - top);
        for (let c = 0; c < channels; c++) {
          const row = rows.get(y);
          const column = columns.get(x);
          const horizontal = row ? row[0][c] + (row[1][c] - row[0][c]) * tx : 0;
          const vertical = column ? column[0][c] + (column[1][c] - column[0][c]) * ty : 0;
          const value = row && column ? (horizontal + vertical) / 2 : row ? horizontal : vertical;
          data[(y * size + x) * channels + c] = Math.round(value);
        }
      }
    }
  }
  return data;
}

async function decode(sharp, input) {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== info.height) throw new Error(`radio atlas is ${info.width}×${info.height}, expected square`);
  return { data, size: info.width, channels: info.channels };
}

/** An encoded square atlas (anything sharp reads) with the lettering painted out, as lossless PNG bytes. */
export async function debrandImage(sharp, input) {
  const { data, size, channels } = await decode(sharp, input);
  debrandAtlas(data, size, channels);
  return sharp(data, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

/**
 * The most any lettering rect of an encoded atlas differs from its own fill: the mean absolute difference over
 * the rect's pixels and channels, in 8-bit levels. A painted-out rect only carries its encoder's noise (well under
 * UNBRANDED); glyphs on the plastic differ by tens of levels.
 */
export async function letteringResidue(sharp, input) {
  const { data, size, channels } = await decode(sharp, input);
  const filled = debrandAtlas(Uint8Array.from(data), size, channels);
  let worst = 0;
  for (const { rect } of RADIO_LETTERING) {
    const [left, top, right, bottom] = scaledRect(rect, size);
    let sum = 0;
    for (let y = top; y < bottom; y++) {
      for (let i = (y * size + left) * channels; i < (y * size + right) * channels; i++) {
        sum += Math.abs(data[i] - filled[i]);
      }
    }
    worst = Math.max(worst, sum / ((right - left) * (bottom - top) * channels));
  }
  return worst;
}

/** The residue below which an atlas counts as carrying no lettering. */
export const UNBRANDED = 5;
