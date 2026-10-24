import {
  type Box3,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Matrix4,
  Mesh,
  type MeshBasicMaterial,
  type Object3D,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { cutTriangles, indexedBounds } from './cutParts';

/**
 * The radio's close-up (`radio-closeup.glb`, built by tools/room/radio-closeup.mjs): the parts an open lid reveals,
 * baked open, plus the extras that say which triangles of the shipped radio-base.glb are its lid and keys. This
 * module checks the close-up was cut for exactly the radio on screen, cuts the moving parts out and hangs them on
 * their pivots; a mismatch makes the radio scenery rather than broken.
 */

type Vec3 = readonly [number, number, number];
type Bounds = readonly [Vec3, Vec3];

/** A list of triangles: sorted [start, count] ranges, or base64 little-endian Uint32 indices. */
export interface TriangleList {
  readonly mesh: string;
  readonly ranges?: readonly (readonly [number, number])[];
  readonly indices?: string;
  readonly bounds: Bounds;
}

export interface CloseUpExtras {
  readonly radioCloseup: 1;
  readonly base: {
    readonly file: string;
    readonly geometrySha256: string;
    readonly meshes: Readonly<Record<string, { readonly vertices: number; readonly triangles: number }>>;
  };
  readonly parts: {
    readonly lid: TriangleList;
    readonly rockerTop: TriangleList;
    readonly rockerBottom: TriangleList;
    readonly previous: TriangleList;
    readonly next: TriangleList;
  };
  readonly hinge: { readonly point: Vec3; readonly axis: Vec3; readonly openDegrees: number };
  readonly rocker: { readonly pivot: Vec3; readonly axis: Vec3; readonly tiltDegrees: number };
  readonly keyTravel: { readonly axis: Vec3; readonly metres: number };
  readonly turntable: { readonly centre: Vec3; readonly seatY: number; readonly normal: Vec3 };
  readonly slot: { readonly z: number; readonly minX: number; readonly maxX: number; readonly floorY: number };
  readonly lcd: {
    readonly min: readonly [number, number];
    readonly max: readonly [number, number];
    readonly z: number;
    readonly normal: Vec3;
  };
  readonly led: { readonly point: Vec3; readonly normal: Vec3; readonly radius: number };
}

/** The cut lid must sit exactly where the close-up was measured, within this (m). */
const BOUNDS_TOLERANCE = 0.0005;

/** The triangle indices a list names. */
export function decodeTriangles(list: TriangleList): number[] {
  if (list.ranges) {
    const triangles: number[] = [];
    for (const [start, count] of list.ranges) for (let i = 0; i < count; i++) triangles.push(start + i);
    return triangles;
  }
  if (!list.indices) return [];
  const binary = atob(list.indices);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return [...new Uint32Array(bytes.buffer)];
}

/** Why the close-up does not fit these radio meshes, or null when it does. */
export function closeUpMismatch(extras: unknown, meshes: ReadonlyMap<string, Mesh>): string | null {
  const data = extras as Partial<CloseUpExtras> | undefined;
  if (data?.radioCloseup !== 1 || !data.base || !data.parts) return 'radio-closeup.glb carries no close-up extras';
  for (const [name, counts] of Object.entries(data.base.meshes)) {
    const mesh = meshes.get(name);
    const index = mesh?.geometry.getIndex();
    if (!mesh || !index) return `radio-base.glb lacks ${name}`;
    if (mesh.geometry.getAttribute('position').count !== counts.vertices || index.count / 3 !== counts.triangles) {
      return `${name} differs from the radio the close-up was cut for`;
    }
  }
  return null;
}

/** World bounds of a geometry's indexed vertices under `matrix`. */
function worldBounds(mesh: Mesh, geometry = mesh.geometry): Box3 {
  return indexedBounds(geometry).applyMatrix4(mesh.matrixWorld);
}

function sameBounds(box: Box3, bounds: Bounds): boolean {
  const [min, max] = bounds;
  return (
    box.min.toArray().every((value, i) => Math.abs(value - (min[i] ?? 0)) <= BOUNDS_TOLERANCE) &&
    box.max.toArray().every((value, i) => Math.abs(value - (max[i] ?? 0)) <= BOUNDS_TOLERANCE)
  );
}

/** The radio's moving parts once cut, each hung on its pivot. */
export interface RadioParts {
  /** Turns about the hinge: rotation.x = −angle opens it. Holds the cut lid and the close-up's underside. */
  readonly lidPivot: Group;
  readonly lid: Mesh;
  readonly lidInner: Mesh;
  /** Tilts about the rocker's pivot: rotation.x = −angle leans ▷II in. */
  readonly rockerPivot: Group;
  readonly rockerTop: Mesh;
  readonly rockerBottom: Mesh;
  /** Translated along `keyTravel` as the side keys go in. */
  readonly previous: Mesh;
  readonly next: Mesh;
  readonly keyAxis: Vector3;
  readonly well: Mesh;
  /** The materials that carry the radio's skin (the shared baked one and the key faces' shaded clones). */
  readonly skinMaterials: readonly MeshBasicMaterial[];
  /** The key faces' own materials (for their shading). */
  readonly keyMaterials: Readonly<Record<'rockerTop' | 'rockerBottom' | 'previous' | 'next', MeshBasicMaterial>>;
  /** The close-up's atlas (512²). */
  readonly atlas: Texture | null;
}

/** A mesh drawn under `parent` exactly where `world` puts it. */
function hang(mesh: Mesh, parent: Object3D, world: Matrix4): void {
  parent.updateMatrixWorld(true);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(parent.matrixWorld.clone().invert().multiply(world));
  parent.add(mesh);
}

/**
 * Cuts the lid and keys out of the radio's meshes by the close-up's lists, checks the lid landed where it was
 * measured, and hangs every moving part and the close-up's meshes on their pivots under `root`.
 * Throws when anything does not match.
 */
export function assembleParts(gltf: GLTF, meshes: ReadonlyMap<string, Mesh>, root: Object3D): RadioParts {
  const extras = gltf.scene.userData as CloseUpExtras;
  const problem = closeUpMismatch(extras, meshes);
  if (problem) throw new Error(problem);
  const mesh = (name: string): Mesh => {
    const found = meshes.get(name);
    if (!found) throw new Error(`radio-base.glb lacks ${name}`);
    found.updateMatrixWorld(true);
    return found;
  };
  const cut = (list: TriangleList, material?: MeshBasicMaterial): { part: Mesh; source: Mesh } => {
    const source = mesh(list.mesh);
    const geometry = cutTriangles(source.geometry, decodeTriangles(list));
    const part = new Mesh(geometry, material ?? source.material);
    part.name = `${source.name}:cut`;
    return { part, source };
  };
  const lidCut = cut(extras.parts.lid);
  if (!sameBounds(worldBounds(lidCut.source, lidCut.part.geometry), extras.parts.lid.bounds)) {
    throw new Error('The cut lid is not where radio-closeup.glb measured it');
  }
  const baseMaterial = lidCut.source.material as MeshBasicMaterial;
  const keyMaterial = (): MeshBasicMaterial => baseMaterial.clone();
  const keyMaterials = {
    rockerTop: keyMaterial(),
    rockerBottom: keyMaterial(),
    previous: keyMaterial(),
    next: keyMaterial(),
  };
  const rockerTop = cut(extras.parts.rockerTop, keyMaterials.rockerTop);
  const rockerBottom = cut(extras.parts.rockerBottom, keyMaterials.rockerBottom);
  const previous = cut(extras.parts.previous, keyMaterials.previous);
  const next = cut(extras.parts.next, keyMaterials.next);

  const lidPivot = new Group();
  lidPivot.name = 'RadioLidPivot';
  lidPivot.position.fromArray(extras.hinge.point);
  root.add(lidPivot);
  hang(lidCut.part, lidPivot, lidCut.source.matrixWorld);
  const rockerPivot = new Group();
  rockerPivot.name = 'RadioRockerPivot';
  rockerPivot.position.fromArray(extras.rocker.pivot);
  root.add(rockerPivot);
  hang(rockerTop.part, rockerPivot, rockerTop.source.matrixWorld);
  hang(rockerBottom.part, rockerPivot, rockerBottom.source.matrixWorld);
  for (const side of [previous, next]) {
    const holder = new Group();
    holder.name = `${side.part.name}:travel`;
    root.add(holder);
    hang(side.part, holder, side.source.matrixWorld);
  }

  gltf.scene.updateMatrixWorld(true);
  const node = (name: string): Mesh => {
    const found = gltf.scene.getObjectByName(name);
    if (!(found instanceof Mesh)) throw new Error(`radio-closeup.glb lacks ${name}`);
    return found;
  };
  const well = node('Radio_CD_Well');
  const lidInner = node('Radio_CD_LidInner');
  const wellWorld = well.matrixWorld.clone();
  const innerWorld = lidInner.matrixWorld.clone();
  well.removeFromParent();
  lidInner.removeFromParent();
  hang(well, root, wellWorld);
  hang(lidInner, lidPivot, innerWorld);
  well.visible = false;
  lidInner.visible = false;
  const atlas = (well.material as MeshBasicMaterial).map ?? null;
  return {
    lidPivot,
    lid: lidCut.part,
    lidInner,
    rockerPivot,
    rockerTop: rockerTop.part,
    rockerBottom: rockerBottom.part,
    previous: previous.part,
    next: next.part,
    keyAxis: new Vector3().fromArray(extras.keyTravel.axis).normalize(),
    well,
    skinMaterials: [baseMaterial, ...Object.values(keyMaterials)],
    keyMaterials,
    atlas,
  };
}

/** Downloads and decodes the 2K skin off the main thread (`createImageBitmap`), oriented as glTF textures are. */
export async function loadSkin(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const blob = await response.blob();
  return createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/** The skin as a texture with the glTF texture's settings (no flip, sRGB, mipmaps). */
export function skinTexture(bitmap: ImageBitmap, anisotropy: number): Texture {
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/** Restores the cut triangles to their meshes is not needed: disposal drops the whole room. */
export function disposeParts(parts: RadioParts): void {
  for (const mesh of [parts.lid, parts.rockerTop, parts.rockerBottom, parts.previous, parts.next]) {
    mesh.removeFromParent();
  }
  for (const material of Object.values(parts.keyMaterials)) material.dispose();
  parts.lidPivot.removeFromParent();
  parts.rockerPivot.removeFromParent();
  parts.well.removeFromParent();
  parts.well.geometry.dispose();
  parts.lidInner.geometry.dispose();
}
