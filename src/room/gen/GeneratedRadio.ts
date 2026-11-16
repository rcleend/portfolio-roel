// Types only: three.js arrives through the GenKit (genKit.ts).
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import type { DeviceParts, GeneratedRadioSource } from '../radio/partsProvider';
import { CASTERS_ALL, CASTERS_LOCAL } from './bake/Baker';
import type { GenKit } from './genKit';
import { RADIO_MESHES, RADIO_SPEC } from './props/radioSpec';
import type { GenScene } from './scene';

type RadioMesh = (typeof RADIO_MESHES)[number];

/**
 * The generated CD player as the room draws it and the deck moves it (docs/ROOM.md › The CD player): the body and
 * every part of props/radio.ts as a mesh of its own, the moving ones on the pivots `RADIO_SPEC` names. Vertex colours
 * carry the bake's light, so the radio has no texture at all, and a lost context costs it nothing but a re-upload of
 * its attributes.
 *
 * In the bake only the body casts a shadow: the lid is shut then, and would leave the well under it black. The well
 * is lit through the open hole instead, and the lid's underside is generated where the open lid holds it, so it is
 * lit there; it hangs on the pivot turned back by the open angle.
 */
export class GeneratedRadio implements GeneratedRadioSource {
  readonly group: Group;
  readonly parts: DeviceParts;
  readonly spec = RADIO_SPEC;
  private readonly meshes: Readonly<Record<RadioMesh, Mesh>>;

  constructor(
    k: GenKit,
    private readonly gen: GenScene,
  ) {
    const group = new k.Group();
    group.name = 'GeneratedRadio';
    this.group = group;
    const material = (name: string): MeshBasicMaterial => {
      const made = new k.MeshBasicMaterial({ vertexColors: true });
      // Named for the finish (RoomGloss).
      made.name = name;
      return made;
    };
    const body = material('device_radio_BAKED_UNLIT');
    const tub = material('device_radio_cd_BAKED_UNLIT');
    const keys = {
      rockerTop: material('device_radio_BAKED_UNLIT'),
      rockerBottom: material('device_radio_BAKED_UNLIT'),
      previous: material('device_radio_BAKED_UNLIT'),
      next: material('device_radio_BAKED_UNLIT'),
    };
    const materials: Readonly<Record<RadioMesh, MeshBasicMaterial>> = {
      radio: body,
      radioLid: body,
      radioLidInner: tub,
      radioRockerTop: keys.rockerTop,
      radioRockerBottom: keys.rockerBottom,
      radioPrevious: keys.previous,
      radioNext: keys.next,
      radioWell: tub,
      radioWellCover: body,
    };
    const mesh = (name: RadioMesh): Mesh => {
      const data = gen.meshes[name];
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      geometry.setAttribute('color', new k.BufferAttribute(new Float32Array(data.positions.length), 3));
      const made = new k.Mesh(geometry, materials[name]);
      made.name = `Generated ${name}`;
      return made;
    };
    this.meshes = Object.fromEntries(RADIO_MESHES.map((name) => [name, mesh(name)])) as Record<RadioMesh, Mesh>;
    const m = this.meshes;
    m.radio.layers.enable(CASTERS_ALL);
    m.radio.layers.enable(CASTERS_LOCAL);

    // A pivot at a world point: what hangs on it keeps its world coordinates while the pivot rests.
    const pivot = (name: string, at: readonly [number, number, number], ...hung: Mesh[]): Group => {
      const made = new k.Group();
      made.name = name;
      made.position.set(...at);
      for (const part of hung) {
        part.position.set(-at[0], -at[1], -at[2]);
        made.add(part);
      }
      group.add(made);
      return made;
    };
    const { hinge, rocker, keyTravel } = RADIO_SPEC;
    const lidPivot = pivot('RadioLidPivot', hinge.point, m.radioLid, m.radioLidInner);
    // The underside was generated open: turned back by the open angle, it lies under the shut lid.
    m.radioLidInner.matrixAutoUpdate = false;
    m.radioLidInner.matrix
      .makeRotationX((hinge.openDegrees * Math.PI) / 180)
      .multiply(new k.Matrix4().makeTranslation(-hinge.point[0], -hinge.point[1], -hinge.point[2]));
    const rockerPivot = pivot('RadioRockerPivot', rocker.pivot, m.radioRockerTop, m.radioRockerBottom);
    const previous = pivot('RadioPrevious:travel', [0, 0, 0], m.radioPrevious);
    const next = pivot('RadioNext:travel', [0, 0, 0], m.radioNext);
    group.add(m.radio, m.radioWell, m.radioWellCover);

    const rest = (): void => {
      lidPivot.rotation.x = 0;
      rockerPivot.rotation.x = 0;
      previous.position.set(0, 0, 0);
      next.position.set(0, 0, 0);
      m.radioWell.visible = false;
      m.radioLidInner.visible = false;
      m.radioWellCover.visible = true;
      for (const key of Object.values(keys)) key.color.setScalar(1);
    };
    rest();
    this.parts = {
      lidPivot,
      lid: m.radioLid,
      lidInner: m.radioLidInner,
      rockerPivot,
      rockerTop: m.radioRockerTop,
      rockerBottom: m.radioRockerBottom,
      previous: m.radioPrevious,
      next: m.radioNext,
      keyAxis: new k.Vector3(...keyTravel.axis).normalize(),
      well: m.radioWell,
      wellFloor: m.radioWellCover,
      keyMaterials: keys,
      restore: rest,
    };
  }

  /** The bake's vertex colours (every generated mesh end to end, in `GenScene.meshes` order) into the radio's meshes. */
  light(colors: Float32Array): void {
    let offset = 0;
    for (const [name, data] of Object.entries(this.gen.meshes)) {
      const count = data.positions.length;
      const mesh = (this.meshes as Record<string, Mesh | undefined>)[name];
      if (mesh) {
        const attribute = mesh.geometry.getAttribute('color');
        (attribute.array as Float32Array).set(colors.subarray(offset, offset + count));
        attribute.needsUpdate = true;
      }
      offset += count;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    const materials = new Set<MeshBasicMaterial>();
    for (const mesh of Object.values(this.meshes)) {
      mesh.geometry.dispose();
      materials.add(mesh.material as MeshBasicMaterial);
    }
    for (const material of materials) material.dispose();
  }
}
