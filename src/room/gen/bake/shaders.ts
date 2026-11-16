import { SURFACE_GLSL } from '../materials';

/**
 * The bake's three programs. `LIGHT` adds one light, seen from one point of its emitter through one shadow map, to
 * whatever it is drawn over: a page of charts in the page's own space, or the vertices of the props as one texel each.
 * The two `COMPOSE` programs then turn light and surface into what a frame draws.
 */

/** Receivers are drawn where `clip` says: a chart's rectangle in its page, or a vertex's own texel. */
export const RECEIVER_VERTEX = /* glsl */ `
attribute vec2 clip;
attribute float shade;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vShade;
void main() {
  vWorld = position;
  vNormal = normal;
  vShade = shade;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const LIGHT_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vShade;
// 0: a point of an emitter (spot, one face of an omni). 1: a sun, or one direction of the ambient dome.
uniform float uDirectional;
uniform float uDome;
uniform vec3 uLightPosition;
// From the light into the scene (a sun's and a dome's direction, a spot's axis).
uniform vec3 uLightAxis;
uniform vec3 uColor;
// 1: a light of the finish (rig.ts), kept apart in the alpha channel.
uniform float uFinish;
// soften, reach start, reach end, wrap
uniform vec4 uFall;
// cos(outer), cos(inner); below -1 for no cone
uniform vec2 uCone;
// aim, and the beam's floor; cosines; below -1 for no beam
uniform vec4 uBeam;
uniform vec2 uBeamCos;
uniform vec3 uFacing;
// An opening the light must come through (a window): its centre (w: on) and its two half edges.
uniform vec4 uPortal;
uniform vec3 uPortalU;
uniform vec3 uPortalV;
uniform mat4 uShadow;
uniform sampler2D uShadowMap;
// 1 / the map's size, and a texel's size in metres one metre from the light (a sun: anywhere)
uniform vec2 uShadowTexel;
uniform vec4 uEncode;

float lit(vec3 point) {
  vec4 projected = uShadow * vec4(point, 1.0);
  if (projected.w <= 0.0) return -1.0;
  vec3 at = projected.xyz / projected.w * 0.5 + 0.5;
  if (at.x <= 0.0 || at.x >= 1.0 || at.y <= 0.0 || at.y >= 1.0) return -1.0;
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 offset = (vec2(float(i & 1), float(i >> 1)) - 0.5) * uShadowTexel.x;
    sum += step(at.z - 0.00004, texture2D(uShadowMap, at.xy + offset).r);
  }
  return sum * 0.25;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toLight = uDirectional > 0.5 ? -uLightAxis : uLightPosition - vWorld;
  float distance2 = dot(toLight, toLight);
  vec3 direction = toLight * inversesqrt(distance2);
  float facing = max((dot(normal, direction) + uFall.w) / (1.0 + uFall.w), 0.0);
  float light = facing;
  if (uDirectional < 0.5) {
    light /= distance2 + uFall.x;
    if (uFall.z > 0.0) light *= 1.0 - smoothstep(uFall.y, uFall.z, sqrt(distance2));
    if (uCone.x > -1.0) light *= smoothstep(uCone.x, uCone.y, dot(-direction, uLightAxis));
    if (uBeamCos.x > -1.0)
      light *= mix(uBeam.w, 1.0, smoothstep(uBeamCos.x, uBeamCos.y, dot(-direction, uBeam.xyz)))
        * smoothstep(-0.05, 0.2, dot(-direction, uFacing));
  }
  if (light > 0.0) {
    // Off the surface by a shadow texel's width, so a surface never shadows itself.
    float texel = uShadowTexel.y * (uDirectional > 0.5 ? 1.0 : sqrt(distance2));
    float seen = lit(vWorld + normal * texel * 2.0 + direction * texel);
    // Outside the map: a sun or the dome is unshadowed there, a point light's view simply does not reach it.
    light *= seen < 0.0 ? uDirectional : seen;
  }
  if (uPortal.w > 0.5 && light > 0.0) {
    vec3 across = cross(uPortalU, uPortalV);
    float t = dot(uPortal.xyz - vWorld, across) / dot(direction, across);
    vec3 hit = vWorld + direction * t - uPortal.xyz;
    vec2 at = vec2(dot(hit, uPortalU) / dot(uPortalU, uPortalU), dot(hit, uPortalV) / dot(uPortalV, uPortalV));
    light *= step(0.0, t) * (1.0 - smoothstep(0.96, 1.0, max(abs(at.x), abs(at.y))));
  }
  if (uDome > 0.5) light *= vShade;
  vec4 added = uFinish > 0.5 ? vec4(0.0, 0.0, 0.0, light * uColor.r) : vec4(uColor * light, 0.0);
  gl_FragColor = added * uEncode;
}
`;

const DISPLAY = /* glsl */ `
uniform vec4 uDecode;
uniform float uExposure;
uniform float uWarmth;
uniform vec3 uStatic;

// Scene-linear light under a filmic curve with a little toe: the display values the room's surfaces hold (the Blender
// bake held AgX medium-high contrast), then the finish's static lights in the finish's own terms (RoomGloss).
vec3 display(vec3 albedo, vec4 light, vec3 world) {
  vec3 c = albedo * light.rgb * uDecode.rgb * uExposure;
  c = c / (c + 0.6) * 1.25;
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
  float lava = length(world - vec3(0.49, 1.28, -1.97));
  float desk = length(world - vec3(-2.05, 1.03, -1.88));
  float pool = exp(-lava * lava * 0.85) + exp(-desk * desk * 1.8) * 0.65;
  c *= vec3(1.0) + vec3(0.9, 0.26, 0.025) * pool * uWarmth;
  c += min(c * 25.0, vec3(0.85)) * uStatic * light.a * uDecode.a;
  return c;
}
`;

export const CHART_COMPOSE_VERTEX = /* glsl */ `
attribute vec2 clip;
attribute vec2 local;
attribute vec2 st;
attribute float material;
attribute vec4 params;
varying vec3 vWorld;
varying vec2 vPage;
varying vec2 vLocal;
varying vec2 vSt;
varying float vMaterial;
varying vec4 vParams;
void main() {
  vWorld = position;
  vPage = clip * 0.5 + 0.5;
  vLocal = local;
  vSt = st;
  vMaterial = material;
  vParams = params;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const CHART_COMPOSE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec3 vWorld;
varying vec2 vPage;
varying vec2 vLocal;
varying vec2 vSt;
varying float vMaterial;
varying vec4 vParams;
uniform sampler2D uLight;
${SURFACE_GLSL}
${DISPLAY}
void main() {
  float cavity;
  vec3 albedo = surface(vMaterial, vLocal, vSt, vParams, cavity);
  vec3 c = display(albedo * cavity, texture2D(uLight, vPage), vWorld);
  // Half a level of noise in display space: a dark wall's slow gradient must not band in eight bits.
  float noise = hash2(ivec2(gl_FragCoord.xy)) - 0.5;
  c += noise * (2.0 * sqrt(max(c, vec3(0.0))) + 0.01) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const VERTEX_COMPOSE_VERTEX = /* glsl */ `
attribute vec2 clip;
attribute vec3 albedo;
varying vec3 vWorld;
varying vec3 vAlbedo;
void main() {
  vWorld = position;
  vAlbedo = albedo;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

/** A vertex's display colour, square-rooted into eight bits; read back and squared into the mesh's colours. */
export const VERTEX_COMPOSE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec3 vWorld;
varying vec3 vAlbedo;
uniform sampler2D uLight;
${DISPLAY}
void main() {
  vec3 c = display(vAlbedo, texelFetch(uLight, ivec2(gl_FragCoord.xy), 0), vWorld);
  gl_FragColor = vec4(sqrt(clamp(c, 0.0, 1.0)), 1.0);
}
`;
