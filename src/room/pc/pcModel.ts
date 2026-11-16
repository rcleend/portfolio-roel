import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import { PC_SPEC } from '../gen/roomSpec';
import { type GlassPlane, insetPlane } from './glassPlane';

/**
 * Facts about the computer on the desk that the room relies on: the generated desktop set (gen/props/deskCorner.ts)
 * as `PC_SPEC` (gen/roomSpec.ts) measures it, and its glass (pcGlass.ts). Only the picture's border and corner radius
 * are design constants.
 */

/** Uniform dark tube border between the glass rim and the picture, like the TV's thin border. */
export const PC_PICTURE_BORDER = 0.01;
/** Rounded raster corners of the picture. */
export const PC_PICTURE_RADIUS = 0.006;
/** The unlit tube: the TV's `TUBE` constant (crtShader.ts), sRGB-encoded. */
export const PC_TUBE_COLOR = '#070a09';

export interface PcModel {
  /** The device as a click target: the monitor, its glass, the keyboard and the mouse. */
  readonly root: Object3D;
  /** The desk with its chair, lamp, tower and clutter, as a click target. */
  readonly desk: Object3D;
  /** The monitor's shell: what glows and bounces in the light, the glass with it. */
  readonly shell: Object3D;
  /** The monitor's curved glass; its UVs are a planar projection with v = 0 at the top. */
  readonly glass: Mesh;
  /** World-space unit vector the glass faces, i.e. towards the viewer. */
  readonly facing: Vector3;
  /** The plane the glass rim sits on (the glass's back-most z); the picture is registered to it. */
  readonly rim: GlassPlane;
  /** The picture: the rim inset by the tube border. */
  readonly picture: GlassPlane;
  /** World z of the monitor's front face, where the bezel lip catches the screen's light. */
  readonly shellFrontZ: number;
  /** The monitor's shell: the computer's outline, beyond which a click is a click on the room. */
  readonly shellBounds: Box3;
  readonly keyboardBounds: Box3;
}

const box = ({ min, max }: { readonly min: readonly number[]; readonly max: readonly number[] }): Box3 =>
  new Box3(new Vector3().fromArray(min), new Vector3().fromArray(max));

/** The computer as the spec has it, around the nodes the room made for it. */
export function pcModelOf(nodes: Pick<PcModel, 'root' | 'desk' | 'shell' | 'glass'>): PcModel {
  const { glass, shell, keyboard } = PC_SPEC;
  const rim: GlassPlane = { minX: glass.minX, maxX: glass.maxX, minY: glass.minY, maxY: glass.maxY, z: glass.rimZ };
  return {
    ...nodes,
    facing: new Vector3(0, 0, 1),
    rim,
    picture: insetPlane(rim, PC_PICTURE_BORDER),
    shellFrontZ: shell.max[2],
    shellBounds: box(shell),
    keyboardBounds: box(keyboard),
  };
}
