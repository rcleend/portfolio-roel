// Types only: three.js arrives through the GenKit (genKit.ts).
import type {
  BufferGeometry,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { GenKit } from '../genKit';
import type { Vec3 } from '../kit/builder';
import { add, basis, normalize, scale, sub } from '../kit/builder';
import { AMBIENT, RIG, type RigLight } from '../rig';
import type { GenScene } from '../scene';
import {
  CHART_COMPOSE_FRAGMENT,
  CHART_COMPOSE_VERTEX,
  LIGHT_FRAGMENT,
  RECEIVER_VERTEX,
  VERTEX_COMPOSE_FRAGMENT,
  VERTEX_COMPOSE_VERTEX,
} from './shaders';

/** The layers a shadow map's camera sees: everything opaque, or only furniture and props (rig.ts › casters). */
export const CASTERS_ALL = 20;
export const CASTERS_LOCAL = 21;

export interface BakeOptions {
  /** The shadow map's side, in texels. */
  readonly shadowSize: number;
  /** A light page's size as a fraction of its chart page's: light is soft, its page can be smaller. */
  readonly lightScale: number;
  /** Which of each light's sample counts to use: 0 full quality, 1 the lowest tier. */
  readonly sampleSet: 0 | 1;
  /** Half-float light pages; without them (no EXT_color_buffer_half_float) light is accumulated in eight bits. */
  readonly halfFloat: boolean;
  readonly exposure: number;
  /** The finish's static lights now (RoomStage.staticLights): the lamp's colour × intensity and the pools' warmth. */
  readonly staticColor: Vec3;
  readonly warmth: number;
  readonly anisotropy: number;
}

/** One light, from one point of its emitter, through one shadow map. */
interface View {
  readonly light: RigLight;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  /** A perspective view's vertical field in radians, or an orthographic view's half extent in metres. */
  readonly fov?: number;
  readonly extent?: number;
  readonly near: number;
  readonly far: number;
  readonly color: Vec3;
}

/** What eight-bit light pages hold: light ÷ these, so the sum of every pass stays under one. */
const EIGHT_BIT_RANGE = { scene: 3, finish: 24 };

const CUBE: readonly (readonly [Vec3, Vec3])[] = [
  [
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [0, -1, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [0, 1, 0],
  ],
];

/** Deterministic points in the unit disc (a golden-angle spiral). */
function disc(i: number, n: number): [number, number] {
  const r = Math.sqrt((i + 0.5) / n);
  const a = i * 2.39996323;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** Deterministic directions over the whole sphere (a Fibonacci lattice). */
function sphere(i: number, n: number): Vec3 {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.39996323;
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

/** Every view the rig is rendered from, in the order they are baked. */
export function rigViews(sampleSet: 0 | 1, rig: readonly RigLight[] = RIG): View[] {
  const views: View[] = [];
  for (const light of rig) {
    const samples = light.samples[sampleSet];
    if (light.kind === 'dome') {
      for (let i = 0; i < samples; i++) {
        // Where the light comes from: the sky's colour from above, the floor's bounce from below.
        const from = sphere(i, samples);
        const blend = Math.min(1, Math.max(0, (from[1] + 0.3) / 0.6));
        const tint = AMBIENT.ground.map(
          (ground, c) => ground + ((AMBIENT.sky[c] as number) - ground) * blend,
        ) as unknown as Vec3;
        views.push({
          light,
          position: add(light.position, scale(from, 9)),
          target: light.position,
          up: Math.abs(from[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0],
          extent: light.extent ?? 4,
          near: 0.5,
          far: 18,
          // A whole sphere of unit radiance gives a surface π of irradiance: here, its own colour.
          color: scale(tint, 4 / samples).map((v, c) => v * (light.color[c] as number)) as unknown as Vec3,
        });
      }
      continue;
    }
    const axis = normalize(sub(light.target, light.position));
    const [side, up] = light.kind === 'omni' ? [[1, 0, 0] as Vec3, [0, 1, 0] as Vec3] : basis(axis);
    for (let i = 0; i < samples; i++) {
      const [jx, jy] = disc(i, samples);
      const position = add(light.position, add(scale(side, jx * light.size), scale(up, jy * light.size)));
      const color = scale(light.color, 1 / samples);
      if (light.kind === 'sun') {
        // Every point of the emitter looks at the same place: a penumbra that widens with the caster's height.
        views.push({
          light,
          position,
          target: light.target,
          up: [0, 1, 0],
          extent: light.extent ?? 4,
          near: 0.5,
          far: 14,
          color,
        });
      } else if (light.kind === 'spot') {
        const outer = light.cone?.[1] ?? 1;
        views.push({
          light,
          position,
          target: add(position, axis),
          up: Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0],
          fov: Math.min(2.7, outer * 2 + 0.1),
          near: light.clear ?? 0.03,
          far: 9,
          color,
        });
      } else {
        for (const [direction, faceUp] of CUBE)
          views.push({
            light,
            position,
            target: add(position, direction),
            up: faceUp,
            fov: Math.PI / 2,
            near: light.clear ?? 0.02,
            far: (light.reach?.[1] ?? 6) + 0.5,
            color,
          });
      }
    }
  }
  return views;
}

/** A part of the bake's receivers (`Baker.begin`). */
export interface BakePart {
  /** Per chart page: the vertices of its bake mesh to light, as a triangle list (null: all; empty: none). */
  readonly charts: readonly (Uint32Array | null)[];
  /** Whether the props' vertices take light in this pass. */
  readonly vertices: boolean;
}

export interface BakeResult {
  /** One texture a chart page: what its charts draw with. */
  readonly pages: readonly Texture[];
  /** The props' vertex colours (linear display values), all meshes end to end in `GenScene.meshes` order. */
  readonly colors: Float32Array;
  /** Shadow maps rendered and light passes drawn. */
  readonly views: number;
}

/**
 * Computes the generated room's light on the GPU, once (docs/ROOM.md › The generated room › The bake). `step()` does
 * one view a call (a shadow map of the room, then that light added to every page and to the vertices' page), so the
 * caller can run it in idle moments; the last steps compose the pages and read the vertices' colours back.
 */
export class Baker {
  private readonly views: View[];
  private next = 0;
  private readonly camera: PerspectiveCamera;
  /** Draws the receivers, which place themselves (`clip`): any camera that sees their layer.*/
  private readonly flat: PerspectiveCamera;
  private readonly shadow: WebGLRenderTarget;
  private readonly depthMaterial: InstanceType<GenKit['MeshBasicMaterial']>;
  private readonly lightMaterial: ShaderMaterial;
  private readonly chartCompose: ShaderMaterial;
  private readonly vertexCompose: ShaderMaterial;
  private readonly receivers: Scene;
  private readonly lightPages: WebGLRenderTarget[] = [];
  private readonly finalPages: WebGLRenderTarget[] = [];
  private readonly chartMeshes: Mesh[] = [];
  private readonly vertexMesh: Mesh;
  private readonly vertexLight: WebGLRenderTarget;
  private readonly vertexFinal: WebGLRenderTarget;
  private readonly vertexCount: number;
  private readonly vertexSide: number;
  private readonly geometries: BufferGeometry[] = [];
  private composed = false;
  private pending: Promise<Float32Array> | null = null;
  private colors: Float32Array | null = null;
  private cleared = false;
  /** The part of the receivers this pass lights (`begin`); null: all of them. */
  private part: BakePart | null = null;

  constructor(
    private readonly kit: GenKit,
    private readonly renderer: WebGLRenderer,
    /** The scene whose opaque meshes cast shadows (layers CASTERS_ALL and CASTERS_LOCAL say which). */
    private readonly world: Scene,
    gen: GenScene,
    art: Texture,
    private readonly options: BakeOptions,
  ) {
    const { kit: k } = this;
    this.views = rigViews(options.sampleSet);
    this.receivers = new k.Scene();
    this.camera = new k.PerspectiveCamera();
    this.flat = new k.PerspectiveCamera();
    this.shadow = new k.WebGLRenderTarget(options.shadowSize, options.shadowSize, {
      minFilter: k.NearestFilter,
      magFilter: k.NearestFilter,
    });
    this.shadow.depthTexture = new k.DepthTexture(options.shadowSize, options.shadowSize, k.UnsignedIntType);
    this.depthMaterial = new k.MeshBasicMaterial({ colorWrite: false, side: k.DoubleSide });

    const encode = options.halfFloat
      ? new k.Vector4(1, 1, 1, 1)
      : new k.Vector4(
          1 / EIGHT_BIT_RANGE.scene,
          1 / EIGHT_BIT_RANGE.scene,
          1 / EIGHT_BIT_RANGE.scene,
          1 / EIGHT_BIT_RANGE.finish,
        );
    const decode = new k.Vector4(1 / encode.x, 1 / encode.y, 1 / encode.z, 1 / encode.w);
    this.lightMaterial = new k.ShaderMaterial({
      vertexShader: RECEIVER_VERTEX,
      fragmentShader: LIGHT_FRAGMENT,
      uniforms: {
        uDirectional: { value: 0 },
        uDome: { value: 0 },
        uLightPosition: { value: new k.Vector3() },
        uLightAxis: { value: new k.Vector3() },
        uColor: { value: new k.Vector3() },
        uFinish: { value: 0 },
        uFall: { value: new k.Vector4() },
        uCone: { value: new k.Vector4(-2, -2, 0, 0) },
        uBeam: { value: new k.Vector4() },
        uBeamCos: { value: new k.Vector4(-2, -2, 0, 0) },
        uFacing: { value: new k.Vector3() },
        uPortal: { value: new k.Vector4() },
        uPortalU: { value: new k.Vector3() },
        uPortalV: { value: new k.Vector3() },
        uShadow: { value: new k.Matrix4() },
        uShadowMap: { value: this.shadow.depthTexture },
        uShadowTexel: { value: new k.Vector4() },
        uEncode: { value: encode },
        uDither: { value: 0 },
      },
      blending: k.AdditiveBlending,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    });
    const display = {
      uDecode: { value: decode },
      uExposure: { value: options.exposure },
      uWarmth: { value: options.warmth },
      uStatic: { value: new k.Vector3(...options.staticColor) },
    };
    this.chartCompose = new k.ShaderMaterial({
      vertexShader: CHART_COMPOSE_VERTEX,
      fragmentShader: CHART_COMPOSE_FRAGMENT,
      uniforms: { ...display, uLight: { value: null }, uArt: { value: art }, uSoften: { value: new k.Vector4() } },
      depthTest: false,
      depthWrite: false,
    });
    this.vertexCompose = new k.ShaderMaterial({
      vertexShader: VERTEX_COMPOSE_VERTEX,
      fragmentShader: VERTEX_COMPOSE_FRAGMENT,
      uniforms: { ...display, uLight: { value: null } },
      depthTest: false,
      depthWrite: false,
    });

    const type = options.halfFloat ? k.HalfFloatType : k.UnsignedByteType;
    gen.charts.bake.forEach((mesh, index) => {
      const page = gen.pages[index] ?? { width: 64, height: 64 };
      const geometry = new k.BufferGeometry();
      const clip = new Float32Array(mesh.uvs.length);
      for (let i = 0; i < clip.length; i++) clip[i] = (mesh.uvs[i] as number) * 2 - 1;
      geometry.setAttribute('position', new k.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('clip', new k.BufferAttribute(clip, 2));
      geometry.setAttribute('shade', new k.BufferAttribute(mesh.shade, 1));
      geometry.setAttribute('local', new k.BufferAttribute(mesh.local, 2));
      geometry.setAttribute('st', new k.BufferAttribute(mesh.st, 2));
      geometry.setAttribute('material', new k.BufferAttribute(mesh.material, 1));
      geometry.setAttribute('params', new k.BufferAttribute(mesh.params, 4));
      this.geometries.push(geometry);
      const receiver = new k.Mesh(geometry, this.lightMaterial);
      receiver.frustumCulled = false;
      this.chartMeshes.push(receiver);
      this.lightPages.push(
        new k.WebGLRenderTarget(
          Math.max(32, Math.round(page.width * options.lightScale)),
          Math.max(32, Math.round(page.height * options.lightScale)),
          {
            type,
            depthBuffer: false,
            minFilter: k.LinearFilter,
            magFilter: k.LinearFilter,
          },
        ),
      );
      const final = new k.WebGLRenderTarget(page.width, page.height, {
        depthBuffer: false,
        generateMipmaps: true,
        minFilter: k.LinearMipmapLinearFilter,
        magFilter: k.LinearFilter,
      });
      final.texture.colorSpace = k.SRGBColorSpace;
      final.texture.anisotropy = options.anisotropy;
      this.finalPages.push(final);
    });

    // The props' vertices, a texel each: a point on its texel's centre (a third of what a triangle a vertex was to
    // build and to upload, in the bake's first unit).
    const meshes = Object.values(gen.meshes);
    this.vertexCount = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
    this.vertexSide = Math.max(4, Math.ceil(Math.sqrt(this.vertexCount)));
    const side = this.vertexSide;
    const positions = new Float32Array(this.vertexCount * 3);
    const normals = new Float32Array(this.vertexCount * 3);
    const albedo = new Float32Array(this.vertexCount * 3);
    const shade = new Float32Array(this.vertexCount);
    const clip = new Float32Array(this.vertexCount * 2);
    let vertex = 0;
    for (const mesh of meshes) {
      positions.set(mesh.positions, vertex * 3);
      normals.set(mesh.normals, vertex * 3);
      albedo.set(mesh.albedo, vertex * 3);
      shade.set(mesh.shade, vertex);
      for (let i = 0; i < mesh.positions.length / 3; i++, vertex++) {
        clip[vertex * 2] = (((vertex % side) + 0.5) / side) * 2 - 1;
        clip[vertex * 2 + 1] = ((Math.floor(vertex / side) + 0.5) / side) * 2 - 1;
      }
    }
    const vertices = new k.BufferGeometry();
    vertices.setAttribute('position', new k.BufferAttribute(positions, 3));
    vertices.setAttribute('normal', new k.BufferAttribute(normals, 3));
    vertices.setAttribute('albedo', new k.BufferAttribute(albedo, 3));
    vertices.setAttribute('shade', new k.BufferAttribute(shade, 1));
    vertices.setAttribute('clip', new k.BufferAttribute(clip, 2));
    this.geometries.push(vertices);
    // Drawn as points, which three's Points is; everything here only ever sets its material and draws it.
    this.vertexMesh = new k.Points(vertices, this.lightMaterial) as unknown as Mesh;
    this.vertexMesh.frustumCulled = false;
    this.vertexLight = new k.WebGLRenderTarget(side, side, {
      type,
      depthBuffer: false,
      minFilter: k.NearestFilter,
      magFilter: k.NearestFilter,
    });
    this.vertexFinal = new k.WebGLRenderTarget(side, side, {
      depthBuffer: false,
      minFilter: k.NearestFilter,
      magFilter: k.NearestFilter,
    });
  }

  /**
   * Starts a pass over every view that lights only `part` of the receivers, adding to what earlier passes lit: the
   * room bakes what its opening view shows first and the rest behind the running game (GeneratedRoom). Each pass ends
   * as a bake does, composing every page from the light so far; `result()` then has the pages and the colours.
   */
  begin(part: BakePart): void {
    this.part = part;
    this.next = 0;
    this.composed = false;
    // A pass without the vertices keeps the colours the pass that lit them read back.
    this.pending = part.vertices ? null : Promise.resolve(this.colors ?? new Float32Array(this.vertexCount * 3));
    this.chartMeshes.forEach((mesh, index) => {
      const cells = part.charts[index];
      mesh.geometry.setIndex(cells ? new this.kit.BufferAttribute(cells, 1) : null);
    });
  }

  /** Views to render; composing and reading back come after. */
  get steps(): number {
    return this.views.length + 2;
  }

  get done(): boolean {
    return this.colors !== null;
  }

  /** Bytes of the bake's own targets while it runs (they are freed by `dispose`, all but the pages). */
  get transientBytes(): number {
    const texel = this.options.halfFloat ? 8 : 4;
    const pages = this.lightPages.reduce((sum, page) => sum + page.width * page.height * texel, 0);
    return pages + this.vertexSide ** 2 * (texel + 4) + this.options.shadowSize ** 2 * 8;
  }

  /** Programs for the three bake materials, linked without blocking (KHR_parallel_shader_compile where there is one). */
  compile(): Promise<unknown> {
    const scene = new this.kit.Scene();
    const first = this.chartMeshes[0];
    if (!first) return Promise.resolve();
    const probes: Mesh[] = [this.lightMaterial, this.chartCompose].map(
      (material) => new this.kit.Mesh(first.geometry, material),
    );
    probes.push(
      new this.kit.Mesh(this.vertexMesh.geometry, this.vertexCompose),
      new this.kit.Mesh(this.vertexMesh.geometry, this.depthMaterial),
    );
    for (const probe of probes) probe.frustumCulled = false;
    scene.add(...probes);
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.lightPages[0] ?? null);
    const compiled = this.renderer.compileAsync(scene, this.flat);
    this.renderer.setRenderTarget(previous);
    return compiled;
  }

  /**
   * One unit of the bake. Returns false once there is nothing left to do here (the vertices' colours may still be on
   * their way back from the GPU: `result()` waits for them).
   */
  step(): boolean {
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      if (!this.cleared) {
        this.cleared = true;
        renderer.setClearColor(0x000000, 0);
        for (const target of [...this.lightPages, this.vertexLight]) {
          renderer.setRenderTarget(target);
          renderer.clear();
        }
      }
      const view = this.views[this.next];
      if (view) {
        this.next++;
        this.renderView(view);
        return true;
      }
      if (!this.composed) {
        this.composed = true;
        this.compose();
        return true;
      }
      if (!this.pending) {
        this.pending = this.readColors();
        return false;
      }
      return false;
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }

  /** The pages and the vertices' colours, once every step has run. */
  async result(): Promise<BakeResult> {
    if (!this.pending) throw new Error('The bake has steps left');
    const colors = await this.pending;
    this.colors = colors;
    return { pages: this.finalPages.map((page) => page.texture), colors, views: this.views.length };
  }

  /** Frees everything but the pages the room draws with (`all` frees those too). */
  dispose(all = false): void {
    this.shadow.depthTexture?.dispose();
    this.shadow.dispose();
    for (const target of [...this.lightPages, this.vertexLight, this.vertexFinal]) target.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of [this.depthMaterial, this.lightMaterial, this.chartCompose, this.vertexCompose])
      material.dispose();
    if (all) for (const page of this.finalPages) page.dispose();
  }

  private renderView(view: View): void {
    const { renderer, camera } = this;
    const { light } = view;
    // The shadow map: the room's opaque meshes from this point of the emitter.
    camera.position.set(...view.position);
    camera.up.set(...view.up);
    // lookAt reads the camera's world position: it has to be this view's before it turns.
    camera.updateMatrixWorld(true);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld(true);
    let texel: number;
    if (view.extent !== undefined) {
      camera.projectionMatrix.makeOrthographic(
        -view.extent,
        view.extent,
        view.extent,
        -view.extent,
        view.near,
        view.far,
      );
      texel = (view.extent * 2) / this.options.shadowSize;
    } else {
      const top = view.near * Math.tan((view.fov ?? 1) / 2);
      camera.projectionMatrix.makePerspective(-top, top, top, -top, view.near, view.far);
      texel = (2 * Math.tan((view.fov ?? 1) / 2)) / this.options.shadowSize;
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    if (light.casters !== 'none') {
      camera.layers.set(light.casters === 'all' ? CASTERS_ALL : CASTERS_LOCAL);
      const override = this.world.overrideMaterial;
      this.world.overrideMaterial = this.depthMaterial;
      renderer.autoClear = true;
      renderer.setRenderTarget(this.shadow);
      renderer.render(this.world, camera);
      this.world.overrideMaterial = override;
    }

    const uniforms = this.lightMaterial.uniforms;
    const uniform = (name: string): { value: unknown } => {
      const found = uniforms[name];
      if (!found) throw new Error(`The bake's light has no uniform ${name}`);
      return found;
    };
    const set = (name: string, ...values: number[]) =>
      (uniform(name).value as { set(...v: number[]): void }).set(...values);
    const directional = view.extent !== undefined;
    const axis = normalize(
      sub(
        light.kind === 'dome' || light.kind === 'sun' ? view.target : light.target,
        light.kind === 'dome' || light.kind === 'sun' ? view.position : light.position,
      ),
    );
    uniform('uDirectional').value = directional ? 1 : 0;
    uniform('uDome').value = light.kind === 'dome' ? 1 : 0;
    uniform('uFinish').value = light.space === 'finish' ? 1 : 0;
    set('uLightPosition', ...view.position);
    set('uLightAxis', ...axis);
    set('uColor', ...view.color);
    set('uFall', light.soften, light.reach?.[0] ?? 0, light.reach?.[1] ?? 0, light.wrap);
    if (light.kind === 'spot' && light.cone) set('uCone', Math.cos(light.cone[1]), Math.cos(light.cone[0]), 0, 0);
    else set('uCone', -2, -2, 0, 0);
    if (light.beam) {
      set('uBeam', ...light.beam.aim, light.beam.floor);
      set('uBeamCos', light.beam.cos[0], light.beam.cos[1], 0, 0);
      set('uFacing', ...light.beam.facing);
    } else set('uBeamCos', -2, -2, 0, 0);
    const portal = light.portal;
    if (portal) {
      set('uPortal', ...portal.center, 1);
      set('uPortalU', ...portal.u);
      set('uPortalV', ...portal.v);
    } else set('uPortal', 0, 0, 0, 0);
    (uniform('uShadow').value as Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    set('uShadowTexel', 1 / this.options.shadowSize, texel, light.casters === 'none' ? 1 : 0, light.through ?? 0);
    uniform('uDither').value = this.options.halfFloat ? 0 : this.next;

    renderer.autoClear = false;
    this.receivers.clear();
    this.vertexMesh.material = this.lightMaterial;
    this.chartMeshes.forEach((mesh, index) => {
      if (mesh.geometry.index?.count === 0) return;
      mesh.material = this.lightMaterial;
      this.receivers.add(mesh);
      renderer.setRenderTarget(this.lightPages[index] ?? null);
      renderer.render(this.receivers, this.flat);
      this.receivers.remove(mesh);
    });
    if (this.part?.vertices === false) return;
    this.receivers.add(this.vertexMesh);
    renderer.setRenderTarget(this.vertexLight);
    renderer.render(this.receivers, this.flat);
    this.receivers.remove(this.vertexMesh);
  }

  private compose(): void {
    const { renderer, flat: camera } = this;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    this.chartMeshes.forEach((mesh, index) => {
      const light = this.lightPages[index];
      if (!light) return;
      // Every chart of the page, whatever part the pass lit.
      mesh.geometry.setIndex(null);
      (this.chartCompose.uniforms.uLight as { value: Texture }).value = light.texture;
      (this.chartCompose.uniforms.uSoften as { value: { set(...v: number[]): void } }).value.set(
        this.options.halfFloat ? 0 : 1.5 / light.width,
        this.options.halfFloat ? 0 : 1.5 / light.height,
        0,
        0,
      );
      mesh.material = this.chartCompose;
      this.receivers.add(mesh);
      renderer.setRenderTarget(this.finalPages[index] ?? null);
      renderer.render(this.receivers, camera);
      this.receivers.remove(mesh);
    });
    if (this.part?.vertices === false) return;
    (this.vertexCompose.uniforms.uLight as { value: Texture }).value = this.vertexLight.texture;
    this.vertexMesh.material = this.vertexCompose;
    this.receivers.add(this.vertexMesh);
    renderer.setRenderTarget(this.vertexFinal);
    renderer.render(this.receivers, camera);
    this.receivers.remove(this.vertexMesh);
  }

  private async readColors(): Promise<Float32Array> {
    const side = this.vertexSide;
    const bytes = new Uint8Array(side * side * 4);
    await this.renderer.readRenderTargetPixelsAsync(this.vertexFinal, 0, 0, side, side, bytes);
    const colors = new Float32Array(this.vertexCount * 3);
    for (let i = 0; i < this.vertexCount; i++)
      for (let c = 0; c < 3; c++) {
        const value = (bytes[i * 4 + c] as number) / 255;
        colors[i * 3 + c] = value * value;
      }
    return colors;
  }
}
