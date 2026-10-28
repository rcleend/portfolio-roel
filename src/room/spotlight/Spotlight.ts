import type {
  Color,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import type { RoomTarget } from '../camera/anchors';
import type { LitProp } from './PropSpotlight';
import type { CreateSpotlight, SpotlitProp } from './spotlightContract';

/**
 * The glow (after c-na.dev/explore's, docs/ROOM.md › The spotlight): warm white added onto the frame outside the
 * prop's outline only, at full strength from the outline to about 3 CSS px out and gone by about 12, in display
 * values like the screens' spill. Its blur's sigma is in CSS px.
 */
const GLOW_COLOR = [0.5, 0.47, 0.42] as const;
const GLOW_SIGMA = 6;
/** The glow is worked out at this fraction of the frame's resolution, each way. */
const SCALE = 4;
/** How much brighter the prop's own baked colours get in the light. */
const LIFT = 0.12;
/** The glow's fade towards lit and back: exponential, time constants in ms (95 % in about 240 and 330 ms). */
const FADE_IN_MS = 80;
const FADE_OUT_MS = 110;

/**
 * The jelly (after c-na.dev's): the moment a prop lights it squashes, stretches and rebounds about its foot, then
 * holds a touch bigger for as long as it is lit. Keys are [t, across, up], smoothstepped between, over JELLY_MS.
 */
const JELLY_MS = 520;
const JELLY = [
  [0, 1, 1],
  [0.2, 1.03, 0.97],
  [0.45, 0.98, 1.035],
  [0.7, 1.02, 0.995],
  [1, 1.015, 1.015],
] as const;
const HELD = 1.015;
/** Any other way (home as the light goes, or up to HELD without a jelly) is an exponential approach at this rate /s. */
const EASE_RATE = 8;
/** A prop lit again this soon after its own jelly, without another prop in between, eases back up instead (anti-nag). */
const REPLAY_MS = 500;
/** Within this of where it is going, a prop is there. */
const REST = 1e-4;

const PASS_VERTEX = /* glsl */ `
uniform float uMode;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = uMode > 0.5 ? vec4(position.xy, 0.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Mode 0 draws a prop into the mask: where it is in red, its glow level there in green. Mode 1 blurs both along uStep
 * (nine Gaussian taps through five bilinear fetches).
 */
const PASS_FRAGMENT = /* glsl */ `
uniform float uMode;
uniform float uLevel;
uniform sampler2D uSource;
uniform vec2 uStep;
varying vec2 vUv;
vec2 tap(float offset) { return texture(uSource, vUv + uStep * offset).rg; }
void main() {
  if (uMode < 0.5) {
    gl_FragColor = vec4(1.0, uLevel, 0.0, 1.0);
    return;
  }
  vec2 spread = tap(0.0) * 0.2270270 + (tap(1.3846154) + tap(-1.3846154)) * 0.3162162
    + (tap(3.2307692) + tap(-3.2307692)) * 0.0702703;
  gl_FragColor = vec4(spread, 0.0, 1.0);
}
`;

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The halo, shaped from the blurred mask alone (so the low-resolution mask's steps never show): full from the outline
 * (half covered) to where the blur is down to 0.3, about 3 CSS px out, then falling away; nothing over the prop. Its
 * strength is the props' own levels there. Dithered so its fade never bands.
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uGlow;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 glow = texture(uGlow, vUv).rg;
  float level = glow.g / max(glow.r, 0.001);
  float halo = smoothstep(0.0, 0.3, glow.r) * (1.0 - smoothstep(0.5, 0.6, glow.r)) * level;
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  gl_FragColor = vec4(max(uColor * halo + (noise - 0.5) / 255.0, 0.0), 1.0);
}
`;

/** A pass's uniforms, kept so a frame sets values rather than objects. */
interface PassUniforms {
  readonly uMode: { value: number };
  readonly uLevel: { value: number };
  readonly uSource: { value: unknown };
  readonly uStep: { value: Vector2 };
}

interface Rest {
  readonly object: Object3D;
  readonly position: Vector3;
  readonly scale: Vector3;
}

/** One prop's light: its mask, its rest pose and where its glow and bounce are. */
interface PropLight {
  readonly prop: SpotlitProp;
  /** The prop's meshes as the mask draws them: the same geometry and world matrix, the mask's material. */
  readonly proxies: Mesh[];
  readonly sources: Mesh[];
  readonly mask: ShaderMaterial;
  readonly level$: PassUniforms['uLevel'];
  readonly rest: Rest[];
  /** `pivot` in the bouncing objects' parent space. */
  readonly pivot: Vector3;
  /** The root the room built for it that it has taken in (`SpotlitProp.joins`), or null. */
  joined: Object3D | null;
  level: number;
  lit: boolean;
  /** Its scale across (x and z) and up (y), about the foot. */
  across: number;
  up: number;
  /** When its jelly started (ms on the frames' clock; NaN until its first frame), while one plays. */
  jelly: number | null;
  /** When the light last left it (ms). */
  unlit: number;
  /** The baked materials it brightens, with their own colours, while any light is on it. */
  lifted: Map<MeshBasicMaterial, Color> | null;
}

/**
 * The props' glow and bounce (docs/ROOM.md › The spotlight), the lazy `propSpotlight` chunk. The glow is drawn after the
 * room's frame, only while a prop has any: the lit prop's meshes go into a quarter-resolution, multisampled mask,
 * which is blurred across and down, and the blur is added onto the frame around the prop's outline. Two programs, compiled behind the
 * first flight; until they are ready a lit prop bounces and has its label but no glow yet.
 */
export const createSpotlight: CreateSpotlight = (host, emit) => {
  const { kit, renderer, camera } = host;
  const maskScene = new kit.Scene();
  const pass = (mode: number, source: unknown = null) => {
    const uniforms: PassUniforms = {
      uMode: { value: mode },
      uLevel: { value: 0 },
      uSource: { value: source },
      uStep: { value: new kit.Vector2() },
    };
    const material = new kit.ShaderMaterial({
      uniforms: { ...uniforms },
      vertexShader: PASS_VERTEX,
      fragmentShader: PASS_FRAGMENT,
      side: kit.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    return { material, uniforms };
  };
  /** A mesh in the mask: its positions and triangles only, shared with the mesh, so every pass has one program. */
  const proxy = (source: Mesh, mask: ShaderMaterial): Mesh => {
    const shape = new kit.BufferGeometry();
    shape.setAttribute('position', source.geometry.getAttribute('position'));
    shape.setIndex(source.geometry.getIndex());
    const drawn = new kit.Mesh(shape, mask);
    // Shared, not copied: the proxy follows its mesh through every bounce.
    drawn.matrixWorld = source.matrixWorld;
    drawn.matrixAutoUpdate = false;
    drawn.matrixWorldAutoUpdate = false;
    drawn.frustumCulled = false;
    maskScene.add(drawn);
    return drawn;
  };
  const meshesUnder = (roots: readonly Object3D[]): Mesh[] => {
    const meshes: Mesh[] = [];
    for (const root of roots) root.traverse((object) => (object as Mesh).isMesh && meshes.push(object as Mesh));
    return meshes;
  };
  const lights = new Map<RoomTarget, PropLight>();
  const owned: Copy[] = [];
  for (const prop of host.props) {
    const { material: mask, uniforms } = pass(0);
    const sources = meshesUnder(prop.glow);
    owned.push(...ownShared(sources));
    const parent = prop.bounce[0]?.parent;
    lights.set(prop.target, {
      prop,
      proxies: sources.map((source) => proxy(source, mask)),
      sources,
      mask,
      level$: uniforms.uLevel,
      rest: prop.bounce.map((object) => ({ object, position: object.position.clone(), scale: object.scale.clone() })),
      pivot: parent ? parent.worldToLocal(prop.pivot.clone()) : prop.pivot.clone(),
      joined: null,
      level: 0,
      lit: false,
      across: 1,
      up: 1,
      jelly: null,
      unlit: Number.NEGATIVE_INFINITY,
      lifted: null,
    });
  }

  /**
   * The root the room built for the prop after the spotlight (the radio's device, a sibling of what bounces): its
   * meshes join the mask, the lift and the bounce, so the prop lights and bounces whole. Read as the prop lights,
   * where the colours it brightens are its own.
   */
  const join = (light: PropLight): void => {
    const root = light.prop.joins?.() ?? null;
    if (!root || root === light.joined) return;
    light.joined = root;
    const meshes = meshesUnder([root]);
    for (const mesh of meshes) light.proxies.push(proxy(mesh, light.mask));
    light.sources.push(...meshes);
    light.rest.push({ object: root, position: root.position.clone(), scale: root.scale.clone() });
    owned.push(...ownShared(light.sources));
    if (light.lifted) for (const [material, colour] of liftable(meshes)) light.lifted.set(material, colour);
  };

  // A quarter of the frame's pixels each way is plenty for a glow; the mask is multisampled, so its outline is smooth
  // (and where it is, to a quarter of a texel) before the blur ever sees it.
  const masked: WebGLRenderTarget = new kit.WebGLRenderTarget(1, 1, { depthBuffer: false, samples: 4 });
  const blurred: WebGLRenderTarget = new kit.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const glowing: WebGLRenderTarget = new kit.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const triangle = new kit.BufferGeometry();
  triangle.setAttribute('position', new kit.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const across = pass(1, masked.texture);
  const down = pass(1, blurred.texture);
  const composite = new kit.ShaderMaterial({
    uniforms: { uGlow: { value: glowing.texture }, uColor: { value: new kit.Vector3(...GLOW_COLOR) } },
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    blending: kit.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new kit.Mesh(triangle, composite);
  quad.frustumCulled = false;
  const quadScene = new kit.Scene();
  quadScene.add(quad);
  const buffer: Vector2 = new kit.Vector2();
  const point: Vector3 = new kit.Vector3();

  // Both programs compile off the main thread where the GPU can (KHR_parallel_shader_compile), the mask's for a
  // render target as it draws.
  let ready = false;
  let disposed = false;
  renderer.setRenderTarget(masked);
  const compiling = renderer.compileAsync(maskScene, camera);
  renderer.setRenderTarget(null);
  Promise.all([compiling, renderer.compileAsync(quadScene, camera)]).then(
    () => {
      if (disposed) return;
      ready = true;
      host.loop.invalidate();
    },
    (error: unknown) => console.warn('The props will not glow', error),
  );

  let current: RoomTarget | null = null;
  /** The prop that played the last jelly. */
  let jellied: RoomTarget | null = null;
  let label: LitProp | null = null;
  let stopMotion: (() => void) | null = null;
  let last: number | null = null;

  /** The lit prop's label point now: the middle of its top as it bounces, on the page. */
  const place = (target: RoomTarget): LitProp | null => {
    const light = lights.get(target);
    if (!light) return null;
    const { top, pivot } = light.prop;
    point.copy(top).sub(pivot);
    point
      .set(point.x * light.across, point.y * light.up, point.z * light.across)
      .add(pivot)
      .project(camera);
    const { width, height } = host.size();
    return { target, x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
  };

  const tell = (next: LitProp | null): void => {
    if (
      next?.target === label?.target &&
      (!next || !label || (Math.abs(next.x - label.x) < 0.5 && Math.abs(next.y - label.y) < 0.5))
    ) {
      return;
    }
    label = next;
    emit(next);
  };

  const pose = (light: PropLight): void => {
    const { across, up, pivot } = light;
    for (const { object, position, scale } of light.rest) {
      object.scale.set(scale.x * across, scale.y * up, scale.z * across);
      object.position.set(
        pivot.x + (position.x - pivot.x) * across,
        pivot.y + (position.y - pivot.y) * up,
        pivot.z + (position.z - pivot.z) * across,
      );
    }
    if (!light.lifted) return;
    const gain = 1 + LIFT * light.level;
    for (const [material, colour] of light.lifted) material.color.copy(colour).multiplyScalar(gain);
    if (light.level === 0 && !light.lit) light.lifted = null;
  };

  /** Advances every light to `now` (`seconds` since the last frame); true while any is still on its way. */
  const advance = (now: number, seconds: number): boolean => {
    let moving = false;
    for (const light of lights.values()) {
      const goal = light.lit ? 1 : 0;
      if (light.level !== goal) {
        const tau = (light.lit ? FADE_IN_MS : FADE_OUT_MS) / 1000;
        light.level += (goal - light.level) * (1 - Math.exp(-seconds / tau));
        if (Math.abs(goal - light.level) < 0.002) light.level = goal;
      }
      const held = light.lit && !host.reducedMotion.matches && !host.still(light.prop.target) ? HELD : 1;
      if (light.jelly !== null && held === HELD) {
        // It starts on the first frame after the light, on the frames' own clock.
        if (Number.isNaN(light.jelly)) light.jelly = now;
        const t = (now - light.jelly) / JELLY_MS;
        [light.across, light.up] = jellyAt(t);
        if (t >= 1) light.jelly = null;
      } else {
        light.jelly = null;
        const ease = 1 - Math.exp(-EASE_RATE * seconds);
        light.across += (held - light.across) * ease;
        light.up += (held - light.up) * ease;
        if (Math.abs(held - light.across) < REST && Math.abs(held - light.up) < REST) light.across = light.up = held;
      }
      pose(light);
      moving ||= light.level !== goal || light.jelly !== null || light.across !== held || light.up !== held;
    }
    return moving;
  };

  const move = (): void => {
    if (stopMotion) return;
    last = null;
    stopMotion = host.loop.animate((now) => {
      const seconds = last === null ? 1 / 60 : Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const moving = advance(now, seconds);
      if (!moving) stopMotion = null;
      return moving;
    });
  };

  /** After every frame: the label rides its prop (bounce, parallax), and the glow goes over the frame. */
  const afterFrame = (): void => {
    if (current) tell(place(current));
    if (!ready) return;
    let any = false;
    for (const light of lights.values()) {
      const on = light.level > 0.002;
      light.level$.value = light.level;
      for (const [i, proxy] of light.proxies.entries()) proxy.visible = on && (light.sources[i]?.visible ?? false);
      any ||= on;
    }
    if (!any) return;
    renderer.getDrawingBufferSize(buffer);
    const width = Math.ceil(buffer.x / SCALE);
    const height = Math.ceil(buffer.y / SCALE);
    if (masked.width !== width || masked.height !== height) {
      for (const target of [masked, blurred, glowing]) target.setSize(width, height);
    }
    // At a step of one texel the nine taps make a sigma of about 1.75.
    const step = (GLOW_SIGMA * (buffer.x / host.size().width)) / SCALE / 1.75;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.setRenderTarget(masked);
    renderer.render(maskScene, camera);
    blur(across, step / width, 0, blurred);
    blur(down, 0, step / height, glowing);
    quad.material = composite;
    renderer.setRenderTarget(previous);
    renderer.autoClear = false;
    renderer.render(quadScene, camera);
    renderer.autoClear = autoClear;
    renderer.info.autoReset = autoReset;
  };

  const blur = (
    { material, uniforms }: ReturnType<typeof pass>,
    x: number,
    y: number,
    into: WebGLRenderTarget,
  ): void => {
    uniforms.uStep.value.set(x, y);
    quad.material = material;
    renderer.setRenderTarget(into);
    renderer.render(quadScene, camera);
  };

  const stopFrames = host.onRender(afterFrame);

  return {
    show(target) {
      if (target === current) return;
      const now = performance.now();
      const previous = current ? lights.get(current) : undefined;
      if (previous) {
        previous.lit = false;
        previous.unlit = now;
      }
      current = target;
      const light = target ? lights.get(target) : undefined;
      if (light) {
        join(light);
        light.lit = true;
        light.lifted ??= liftable(light.sources);
        // A pointer wobbling over a prop's edge would replay the jelly on every crossing: the same prop again so soon
        // just eases back up.
        const again = jellied === light.prop.target && now - light.unlit < REPLAY_MS;
        if (!again && !host.reducedMotion.matches && !host.still(light.prop.target)) {
          light.jelly = Number.NaN;
          jellied = light.prop.target;
        }
      }
      tell(target ? place(target) : null);
      move();
    },
    dispose() {
      disposed = true;
      stopMotion?.();
      stopFrames();
      for (const light of lights.values()) {
        light.across = light.up = 1;
        light.level = 0;
        light.lit = false;
        pose(light);
        // Not the proxies' geometries: disposing one would free the buffers it shares with its mesh.
        light.mask.dispose();
      }
      for (const { mesh, shared, own } of owned) {
        mesh.material = shared;
        own.dispose();
      }
      across.material.dispose();
      down.material.dispose();
      composite.dispose();
      triangle.dispose();
      masked.dispose();
      blurred.dispose();
      glowing.dispose();
    },
  };
};

/** A mesh on the prop's own copy of a baked material, with the shared one to hand back. */
interface Copy {
  readonly mesh: Mesh;
  readonly shared: Material;
  readonly own: MeshBasicMaterial;
}

/**
 * Puts the prop's meshes on their own copy of any baked material a mesh outside the prop is on too (the computer's
 * device material is the keyboard's and the mouse's), so the light brightens the prop alone. A copy with the same
 * values draws with the same program, so the chunk still compiles two.
 */
function ownShared(meshes: readonly Mesh[]): Copy[] {
  const inside = new Set<Object3D>(meshes);
  const elsewhere = new Set<Material>();
  let top: Object3D | undefined = meshes[0];
  while (top?.parent) top = top.parent;
  top?.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && !inside.has(mesh)) elsewhere.add(mesh.material as Material);
  });
  const copies: Copy[] = [];
  for (const mesh of meshes) {
    const shared = mesh.material as MeshBasicMaterial;
    if (!shared.isMeshBasicMaterial || !shared.map || !elsewhere.has(shared)) continue;
    const own = shared.clone();
    mesh.material = own;
    copies.push({ mesh, shared, own });
  }
  return copies;
}

/** The baked, textured materials of a prop's meshes and their own colours: what it brightens in the light. */
function liftable(meshes: readonly Mesh[]): Map<MeshBasicMaterial, Color> {
  const found = new Map<MeshBasicMaterial, Color>();
  for (const mesh of meshes) {
    const basic = mesh.material as MeshBasicMaterial;
    if (basic.isMeshBasicMaterial && basic.map && !found.has(basic)) found.set(basic, basic.color.clone());
  }
  return found;
}

/** The jelly's scale across and up at `t` (0–1) of its run: smoothstep between keys, its last key from t = 1 on. */
export function jellyAt(t: number): readonly [across: number, up: number] {
  for (let i = 1; i < JELLY.length; i++) {
    const [t1, across1, up1] = JELLY[i] as (typeof JELLY)[number];
    if (t > t1 && i < JELLY.length - 1) continue;
    const [t0, across0, up0] = JELLY[i - 1] as (typeof JELLY)[number];
    const x = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const k = x * x * (3 - 2 * x);
    return [across0 + (across1 - across0) * k, up0 + (up1 - up0) * k];
  }
  return [HELD, HELD];
}
