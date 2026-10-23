/**
 * The static finish of a display's glass: a dark edge shadow where the tube curves away and a
 * faint warm sheen of the desk lamp, which sits to the left of the monitor. It is painted once
 * into a small canvas that both the monitor's still texture and the live DOM screen draw on top
 * of their picture, so the glass looks identical on both sides of the hand-off.
 *
 * Tuned by eye within ±30 % of the design values (6 % edge, 18 % corner, 5 % sheen): at the top of
 * that range, so the settled screen reads as a tube's curved glass rather than a flat panel.
 */

/** Non-premultiplied RGBA, each 0–1, as an ImageData pixel holds it (÷ 255). */
export type GlassPixel = readonly [number, number, number, number];

/** Half of the glass's central part that stays clear of the edge shadow (the middle 70 %)… */
const CLEAR_HALF = 0.35;
/** …and the width of the rim over which the shadow eases in. */
const RAMP = 0.15;
/** Edge shadow at the middle of an edge and in a corner (where both edges add up). */
const EDGE_SHADOW = 0.078;
const CORNER_SHADOW = 0.234;
/** The lamp's reflection: warm white, centred towards the top left, faint. */
const SHEEN_COLOR = [1, 0.96, 0.9] as const;
const SHEEN_CENTRE = { u: 0.22, v: 0.16 } as const;
const SHEEN_MAX = 0.065;
/** Radii (UV units) at which the sheen has fallen to a quarter. */
const SHEEN_RADIUS = { u: 0.22, v: 0.2 } as const;

/** The glass finish at texture coordinate (u, v) of the glass's UV square (v = 0 at the top). */
export function glassLayerPixel(u: number, v: number): GlassPixel {
  const shadow = edgeShadow(u, v);
  const sheen = lampSheen(u, v);
  // Sheen composited over the shadow ("source-over"), then un-premultiplied for ImageData.
  const alpha = sheen + shadow * (1 - sheen);
  if (alpha === 0) return [0, 0, 0, 0];
  const colour = sheen / alpha;
  return [SHEEN_COLOR[0] * colour, SHEEN_COLOR[1] * colour, SHEEN_COLOR[2] * colour, alpha];
}

/** Fills `image` (RGBA bytes) with the glass finish, sampling each pixel at its centre. */
export function paintGlassLayer(image: {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}): void {
  const { data, width, height } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = glassLayerPixel((x + 0.5) / width, (y + 0.5) / height);
      const i = (y * width + x) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = Math.round(a * 255);
    }
  }
}

function edgeShadow(u: number, v: number): number {
  const eu = edgeRamp(u);
  const ev = edgeRamp(v);
  // Each edge contributes its own falloff; in a corner the two overlap and deepen further.
  return EDGE_SHADOW * (eu + ev) + (CORNER_SHADOW - 2 * EDGE_SHADOW) * eu * ev;
}

/** 0 inside the clear middle, easing in to 1 at the edge. */
function edgeRamp(t: number): number {
  const d = Math.max(0, Math.abs(t - 0.5) - CLEAR_HALF) / RAMP;
  const clamped = Math.min(1, d);
  return clamped * clamped;
}

function lampSheen(u: number, v: number): number {
  const du = (u - SHEEN_CENTRE.u) / SHEEN_RADIUS.u;
  const dv = (v - SHEEN_CENTRE.v) / SHEEN_RADIUS.v;
  // The same soft inverse-square-ish falloff the room's light spill uses: no hard edge anywhere.
  const falloff = 1 / (1 + du * du + dv * dv) ** 2;
  return SHEEN_MAX * falloff;
}
