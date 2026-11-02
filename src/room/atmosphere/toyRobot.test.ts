import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { attachToyRobot, createToyRobotUniforms, TOY_ROBOT_LIGHT } from './toyRobot';

const LIGHT = {
  eyes: [
    [2.5418, 0.7517, -0.8737],
    [2.547, 0.7517, -0.8473],
  ],
  facing: [-0.9817, 0, 0.1904],
  color: [1, 0.72, 0.46],
  glow: 1.25,
  frame: { origin: [2.58, 0.486, -0.87], yaw: Math.PI / 6 },
  head: [
    [-0.03, 0.22, -0.04],
    [0.03, 0.29, 0.04],
  ],
  body: [
    [-0.04, 0.1, -0.06],
    [0.04, 0.22, 0.06],
  ],
};

/** The robot as GLTFLoader builds it from room.glb: a node with the light in its extras, the body and eyes below it. */
function room(): { root: Group; body: MeshBasicMaterial; eyes: MeshBasicMaterial } {
  const root = new Group();
  const robot = new Group();
  robot.userData = { supplied_asset: 'toy-robot', light: LIGHT };
  const body = new MeshBasicMaterial({ name: '01_TV_robot_BAKED_UNLIT', color: 0x0a0a0a });
  const eyes = new MeshBasicMaterial({ name: '01_TV_robot_eyes_BAKED_UNLIT' });
  robot.add(new Mesh(new BoxGeometry(), body), new Mesh(new BoxGeometry(), eyes));
  root.add(robot);
  return { root, body, eyes };
}

describe('attachToyRobot', () => {
  it("reads the eyes, the head's facing and the shadow boxes into the uniforms", () => {
    const uniforms = createToyRobotUniforms();
    expect(attachToyRobot(room().root, uniforms)?.glow).toBe(1.25);
    expect(uniforms.uRobotEyeLeft.value.toArray()).toEqual(LIGHT.eyes[0]);
    expect(uniforms.uRobotEyeRight.value.toArray()).toEqual(LIGHT.eyes[1]);
    expect(uniforms.uRobotFacing.value.toArray()).toEqual(LIGHT.facing);
    expect(uniforms.uRobotHeadHigh.value.toArray()).toEqual(LIGHT.head[1]);
    expect(uniforms.uRobotBodyLow.value.toArray()).toEqual(LIGHT.body[0]);
    // The light stays off until the finish turns it on.
    expect(uniforms.uRobotEyeColor.value.toArray()).toEqual([0, 0, 0]);
  });

  it("turns world positions into the body's frame: its facing becomes -x", () => {
    const uniforms = createToyRobotUniforms();
    attachToyRobot(room().root, uniforms);
    // The build turns the body by +yaw, facing (-cos, 0, sin); the frame turns that back to the opening camera's -x.
    const yaw = LIGHT.frame.yaw;
    const facing = new Vector3(-Math.cos(yaw), 0, Math.sin(yaw)).applyMatrix3(uniforms.uRobotFrame.value);
    expect(facing.x).toBeCloseTo(-1, 6);
    expect(facing.z).toBeCloseTo(0, 6);
  });

  it("turns the eyes into light of the lamp's colour past white and leaves the body as built", () => {
    const { root, body, eyes } = room();
    attachToyRobot(root, createToyRobotUniforms());
    expect(eyes.color.toArray().map((value) => +value.toFixed(4))).toEqual([1.25, 0.9, 0.575]);
    expect(body.color.getHex()).toBe(0x0a0a0a);
  });

  it('finds nothing in a room without the robot', () => {
    const uniforms = createToyRobotUniforms();
    expect(attachToyRobot(new Group().add(new Mesh()), uniforms)).toBeNull();
    expect(uniforms.uRobotEyeLeft.value.toArray()).toEqual([0, 0, 0]);
  });
});

describe('TOY_ROBOT_LIGHT', () => {
  it("shadows each eye with the lamp's boxes for the set and the cabinet and the robot's own, and stays off without it", () => {
    expect(TOY_ROBOT_LIGHT.match(/tvLampChord\(/g)).toHaveLength(4);
    expect(TOY_ROBOT_LIGHT.match(/robotEye\(position/g)).toHaveLength(2);
    expect(TOY_ROBOT_LIGHT).toContain('uRobotEyeColor.r <= 0.0');
  });
});
