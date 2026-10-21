import { type IUniform, type Texture, Vector2, Vector4 } from 'three';
import type { UvRect } from './screenMapping';

/**
 * The CRT look, applied to the game's native 320×240 canvas on the curved screen mesh.
 *
 * Work happens in linear light (the canvas texture is sRGB-decoded on sampling), so beam
 * profiles and bloom add up the way light does. Every effect that would alias when the TV
 * is small on screen (scanlines, aperture grille) fades out by screen-space derivative
 * instead of shimmering.
 */
export interface CrtUniforms {
  [name: string]: IUniform;
  uPicture: IUniform<Texture | null>;
  uPictureSize: IUniform<Vector2>;
  /** Content rect in mesh UV space: (minU, minV, maxU, maxV). */
  uContentRect: IUniform<Vector4>;
  uOsd: IUniform<Texture | null>;
  uOsdOpacity: IUniform<number>;
  /** Beam deflection (power animation): the picture is squeezed into this fraction. */
  uDeflection: IUniform<Vector2>;
  uBrightness: IUniform<number>;
  uFlash: IUniform<number>;
  uRoll: IUniform<number>;
  /** Device pixels per CSS pixel; sizes the aperture grille in device pixels. */
  uPixelRatio: IUniform<number>;
}

export function createCrtUniforms(contentRect: UvRect, pictureSize: Vector2): CrtUniforms {
  return {
    uPicture: { value: null },
    uPictureSize: { value: pictureSize },
    uContentRect: { value: new Vector4(contentRect.minU, contentRect.minV, contentRect.maxU, contentRect.maxV) },
    uOsd: { value: null },
    uOsdOpacity: { value: 0 },
    uDeflection: { value: new Vector2(0, 0) },
    uBrightness: { value: 0 },
    uFlash: { value: 0 },
    uRoll: { value: 0 },
    uPixelRatio: { value: 1 },
  };
}

export const CRT_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -viewPosition.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const CRT_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uPicture;
uniform vec2 uPictureSize;
uniform vec4 uContentRect;
uniform sampler2D uOsd;
uniform float uOsdOpacity;
uniform vec2 uDeflection;
uniform float uBrightness;
uniform float uFlash;
uniform float uRoll;
uniform float uPixelRatio;

varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

// Unlit phosphor behind glass: a dark green-grey, as an unpowered tube looks at night.
const vec3 TUBE = vec3(0.0022, 0.0029, 0.0027);
// Horizontal softness: 1.0 is plain bilinear, larger is sharper.
const float SHARPNESS = 2.4;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Rounded-rectangle coverage in native pixels, softened by one screen pixel.
float pictureCoverage(vec2 px, vec2 size, float radius) {
  vec2 q = abs(px - size * 0.5) - (size * 0.5 - radius);
  float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float aa = max(fwidth(distance), 1e-4);
  return 1.0 - smoothstep(-aa, aa, distance);
}

// One scanline's colour: sharp-bilinear across the row, nearest between rows, with the
// on-screen display composited on top (the OSD is drawn by the TV, so it scans out too).
vec3 rowColor(float row, float x) {
  float v = (row + 0.5) / uPictureSize.y;
  float fx = x - 0.5;
  float ix = floor(fx);
  float f = clamp((fract(fx) - 0.5) * SHARPNESS + 0.5, 0.0, 1.0);
  vec2 uv = vec2((ix + 0.5 + f) / uPictureSize.x, v);
  vec3 picture = textureLod(uPicture, uv, 0.0).rgb;
  vec4 osd = textureLod(uOsd, vec2((floor(x) + 0.5) / uPictureSize.x, v), 0.0);
  return mix(picture, osd.rgb, osd.a * uOsdOpacity);
}

// Gaussian beam profile; brighter lines bloom wider, as on a real tube.
float beam(float distance, float brightness) {
  float sigma = mix(0.2, 0.34, clamp(brightness, 0.0, 1.0));
  return exp(-(distance * distance) / (2.0 * sigma * sigma));
}

void main() {
  vec2 content = (vUv - uContentRect.xy) / (uContentRect.zw - uContentRect.xy);

  // Power-on / power-off deflection: the raster is squeezed towards the centre.
  vec2 deflection = max(uDeflection, vec2(1e-4));
  vec2 picture = (content - 0.5) / deflection + 0.5;
  // A rolling picture wraps vertically through the blanking interval (a dark bar).
  float rolled = fract(picture.y + uRoll);
  float blanking = uRoll > 0.0 ? smoothstep(0.0, 0.04, rolled) * smoothstep(1.0, 0.96, rolled) : 1.0;
  vec2 px = vec2(picture.x, rolled) * uPictureSize;

  // Pixels per scanline on screen decide whether scanline and mask detail can be resolved.
  float rowsPerPixel = fwidth(content.y * uPictureSize.y);
  float detail = smoothstep(0.75, 0.38, rowsPerPixel);

  float row = clamp(floor(px.y), 0.0, uPictureSize.y - 1.0);
  float offset = px.y - row - 0.5;
  float neighbour = clamp(row + sign(offset), 0.0, uPictureSize.y - 1.0);
  vec3 near = rowColor(row, px.x);
  vec3 far = rowColor(neighbour, px.x);
  vec3 lines = near * beam(offset, luma(near)) + far * beam(1.0 - abs(offset), luma(far));
  // The beam profile integrates to ~0.8 of a flat row; compensate so scanlines do not dim.
  vec3 color = mix(near, lines * 1.25, detail * 0.9);

  // Power-on raster: the beam glows white before the picture locks.
  color = mix(color, vec3(1.0), uFlash);

  // Gentle bloom from blurred mip levels: bright pixels bleed into their neighbours.
  vec2 bloomAt = px / uPictureSize;
  vec3 halo = 0.6 * textureLod(uPicture, bloomAt, 2.0).rgb + 0.4 * textureLod(uPicture, bloomAt, 3.5).rgb;
  halo = mix(halo, vec3(1.0), uFlash);
  color += max(halo - 0.22, 0.0) * 0.55;

  // Aperture grille: vertical RGB stripes in device pixels, so they never alias.
  float stripe = mod(floor(gl_FragCoord.x / max(1.0, uPixelRatio * 0.75)), 3.0);
  vec3 mask = vec3(stripe == 0.0, stripe == 1.0, stripe == 2.0);
  color *= mix(vec3(1.0), mix(vec3(0.82), vec3(1.12), mask), detail * 0.7);

  // Edge vignette: the beam is weaker towards the corners of the tube.
  vec2 centred = (content - 0.5) * vec2(1.05, 1.25);
  color *= mix(0.55, 1.0, clamp(1.0 - dot(centred, centred) * 1.15, 0.0, 1.0));

  // Light only lands inside the deflected raster, with softly rounded corners.
  float raster = pictureCoverage(picture * uPictureSize, uPictureSize, 5.0) * blanking;
  vec3 light = color * raster * uBrightness;

  // Hot spot of a collapsed beam: a soft glow around the dot or the line.
  vec2 spotExtent = max(deflection * vec2(uPictureSize.x / uPictureSize.y, 1.0), vec2(0.02));
  vec2 spot = (content - 0.5) * vec2(uPictureSize.x / uPictureSize.y, 1.0) / spotExtent;
  float collapsed = 1.0 - clamp(deflection.x * deflection.y * 40.0, 0.0, 1.0);
  light += vec3(0.85, 0.9, 1.0) * exp(-dot(spot, spot) * 2.0) * collapsed * uBrightness * 0.6;

  // Glass: the room's dim light caught by the curved face (a soft sheen top-left, fading
  // towards the rim where the tube curves away) plus Fresnel at grazing angles.
  vec3 normal = normalize(vViewNormal);
  vec3 view = normalize(vViewPosition);
  float fresnel = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 4.0);
  vec2 fromSheen = (vUv - vec2(0.3, 0.2)) * vec2(1.0, 1.4);
  float sheen = exp(-dot(fromSheen, fromSheen) * 4.0);
  vec2 rim = abs(vUv - 0.5) * 2.0;
  float face = 1.0 - smoothstep(0.55, 1.0, max(rim.x, rim.y));
  vec3 glass = vec3(0.016, 0.019, 0.028) * (0.25 + 1.6 * sheen) * face + vec3(0.06, 0.07, 0.09) * fresnel;

  gl_FragColor = vec4(TUBE + light + glass, 1.0);
  #include <colorspace_fragment>
}
`;
