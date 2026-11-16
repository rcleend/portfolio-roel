import type { Group, Mesh, MeshBasicMaterial, Texture, Vector3 } from 'three';

/**
 * Where the CD player's moving parts come from (docs/ROOM.md › The CD player). Types only: the device
 * (device/RadioDevice.ts) drives whatever a source hands it. There are two sources while the room is converted to
 * code: the shipped one (radio-closeup.glb cut out of radio-base.glb, device/closeUpAsset.ts), and the generated one
 * (gen/props/radio.ts built in the worker, hung on its pivots by gen/GeneratedRadio.ts). The shipped one goes when the
 * model files do.
 */

type Vec3 = readonly [number, number, number];

/** The radio's moving parts, each a mesh on its pivot. */
export interface DeviceParts {
  /** Turns about the hinge: rotation.x = −angle opens it. Holds the lid and its underside. */
  readonly lidPivot: Group;
  readonly lid: Mesh;
  readonly lidInner: Mesh;
  /** Tilts about the rocker's pivot: rotation.x = −angle leans ▷II in. */
  readonly rockerPivot: Group;
  readonly rockerTop: Mesh;
  readonly rockerBottom: Mesh;
  /** Translated (their parents are) along `keyAxis` as the side keys go in. */
  readonly previous: Mesh;
  readonly next: Mesh;
  readonly keyAxis: Vector3;
  readonly well: Mesh;
  /** What closes the body under the shut lid: shown only while the well is hidden. */
  readonly wellFloor: Mesh;
  /** The materials that carry the shipped radio's atlas (the 2K skin replaces it); none on the generated radio. */
  readonly skinMaterials: readonly MeshBasicMaterial[];
  /** The key faces' own materials (for their shading). */
  readonly keyMaterials: Readonly<Record<'rockerTop' | 'rockerBottom' | 'previous' | 'next', MeshBasicMaterial>>;
  /** The shipped close-up's atlas (512²); the generated radio has no texture. */
  readonly atlas: Texture | null;
  /** Puts the radio back as the room view shows it (lid shut, keys up). Idempotent. */
  restore(): void;
}

/** What the device reads of the radio's measurements: where its display and its lamp go. */
export interface DeviceSpec {
  readonly lcd: {
    readonly min: readonly [number, number];
    readonly max: readonly [number, number];
    readonly z: number;
    readonly normal: Vec3;
  };
  readonly led: { readonly point: Vec3; readonly normal: Vec3 };
}

/** The generated radio, as the generated room hands it to the device once its light is baked. */
export interface GeneratedRadioSource {
  readonly parts: DeviceParts;
  readonly spec: DeviceSpec;
}

/** The generated room's side of the radio (RadioHost.generated): absent where the room is the shipped one. */
export interface GeneratedRadioDoor {
  /** True once the generated room is on screen; false when it will not be this page load (the shipped radio serves). */
  readonly ready: Promise<boolean>;
  radio(): GeneratedRadioSource | null;
}
