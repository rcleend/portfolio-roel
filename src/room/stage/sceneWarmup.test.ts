import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, type Object3D, Points } from 'three';
import { describe, expect, it } from 'vitest';
import { QUIET } from './IdleWork';
import { WARM_UNIT_VERTICES, warmObjects } from './sceneWarmup';

function geometry(vertices: number): BufferGeometry {
  const made = new BufferGeometry();
  made.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
  return made;
}

function named(object: Object3D, name: string): Object3D {
  object.name = name;
  return object;
}

/** Runs the task to its end; what each unit warmed, by name, and what each unit yielded before it. */
function run(root: Object3D, warmed = new WeakSet<Object3D>()) {
  const units: string[][] = [];
  const yields: unknown[] = [];
  const task = warmObjects(root, (objects) => units.push(objects.map((object) => object.name)), warmed);
  for (let step = task.next(); !step.done; step = task.next()) yields.push(step.value);
  return { units, yields, warmed };
}

describe('warmObjects', () => {
  it('warms every mesh and points once, a few to a unit, each unit an upload', () => {
    const root = new Group();
    const material = new MeshBasicMaterial();
    root.add(named(new Mesh(geometry(WARM_UNIT_VERTICES / 2), material), 'a'));
    root.add(named(new Mesh(geometry(WARM_UNIT_VERTICES / 2), material), 'b'));
    root.add(named(new Mesh(geometry(WARM_UNIT_VERTICES * 3), material), 'large'));
    const nested = new Group();
    nested.add(named(new Points(geometry(10), material), 'dust'));
    root.add(nested);
    const { units, yields, warmed } = run(root);
    expect(units).toEqual([['a', 'b'], ['large'], ['dust']]);
    // Each unit is kept for a moment an upload may have (IdleWork's QUIET).
    expect(yields).toEqual([QUIET, QUIET, QUIET]);
    // What is warmed is not warmed again.
    expect(run(root, warmed).units).toEqual([]);
  });

  it('warms a mesh that is hidden for now or whose material is off, and leaves alone what is never drawn', () => {
    const root = new Group();
    const hidden = named(new Mesh(geometry(3), new MeshBasicMaterial()), 'hidden for now');
    hidden.visible = false;
    const pick = named(new Mesh(geometry(3), new MeshBasicMaterial()), 'pick');
    pick.userData.neverDrawn = true;
    const off = named(new Mesh(geometry(3), new MeshBasicMaterial({ visible: false })), 'material off');
    root.add(hidden, pick, off, named(new Group(), 'group'));
    // A mesh's buffers go up as it comes into view, whether its material draws anything or not.
    expect(run(root).units).toEqual([['hidden for now', 'material off']]);
  });
});
