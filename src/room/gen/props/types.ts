import type { ArtRect } from '../art';
import type { MeshBuilder, Rgb, Vec3 } from '../kit/builder';
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
export type MeshName = 'tv' | 'props' | 'globe' | 'eyes';

export interface PropSink {
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

/** The chart pages: the TV corner's surfaces; the floor and its rug; the walls and ceilings. */
export const PAGE = { corner: 0, floor: 1, shell: 2 } as const;
/** The chart groups: each draws with its own material, named for the room's finish. */
export const GROUP = { cabinet: 0, wall: 1, floor: 2 } as const;
