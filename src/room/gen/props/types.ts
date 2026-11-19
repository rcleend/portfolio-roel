import type { ArtRect } from '../art';
import type { Making, MeshBuilder, Rgb, Vec3 } from '../kit/builder';
import type { Chart } from '../kit/charts';

/** A printed or self-lit quad drawn over a prop with the art page: unlit, tinted, alpha from the print. */
export interface Decal {
  /** One corner and its two edges; it faces `u × v`. */
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly art: ArtRect;
  /** Display colour the print is multiplied by (the room's night stands in for its light). */
  readonly tint: Rgb;
}

/** Which mesh a prop's vertex-lit geometry joins: each is one draw call with one material. */
export type MeshName =
  | 'tv'
  // The computer's monitor, a mesh of its own so the spotlight can light and bounce it.
  | 'monitor'
  | 'props'
  | 'globe'
  // The bare bulb's filament (light itself) and its glass (a film of light).
  | 'filament'
  | 'bulb'
  | 'glass'
  // The desk corner's props: a mesh of their own, small enough about the desk that the frustum of a view looking
  // away from it (the TV's) leaves it out.
  | 'desk'
  // The CD player's body and the parts its deck moves or hides (props/radio.ts).
  | 'radio'
  | 'radioLid'
  | 'radioLidInner'
  | 'radioRockerTop'
  | 'radioRockerBottom'
  | 'radioPrevious'
  | 'radioNext'
  | 'radioWell'
  | 'radioWellCover';

export interface PropSink {
  /**
   * How finely to build, 0–1: 1 on the top quality tier, less on the lower ones (tiers.ts). A prop turns it into
   * segments and into the small parts it leaves out; its budget is for 1.
   */
  readonly detail: number;
  /**
   * A part with lines thinner than a pixel is made twice (docs/ROOM.md › Lines without multisampling): `built`, as
   * geometry, for frames drawn with multisampling, and `drawn`, flat with its lines in the baked surface, for frames
   * drawn without. Whatever `make` adds, to any mesh or as charts, is that making's alone; a room that is never
   * multisampled has the drawn making only (`only`), as plain parts.
   */
  making(making: Making, make: () => void): void;
  /** The one making this room has, where it has one. */
  readonly only: Making | null;
  /** The vertex-lit mesh `name`'s builder. */
  mesh(name: MeshName): MeshBuilder;
  chart(...charts: Chart[]): void;
  decal(decal: Decal): void;
}

export interface Prop {
  readonly name: string;
  /** The most triangles it may add (vertex-lit geometry and two a chart or decal); held by gen.test.ts and at build. */
  readonly budget: number;
  build(sink: PropSink): void;
}

/** The chart pages: the TV corner's surfaces and the rug; the floor; the walls and ceilings; the furniture. */
export const PAGE = { corner: 0, floor: 1, shell: 2, furniture: 3 } as const;
/** The chart groups: each draws with its own material, named for the room's finish. */
export const GROUP = { cabinet: 0, wall: 1, floor: 2, desk: 3, dresser: 4, rug: 5 } as const;

/**
 * The boards' top: 6 mm, where the modelled room's floor was (docs/gen/reference is that room's record) and where
 * everything that stands on it was measured to stand.
 */
export const FLOOR = 0.006;
