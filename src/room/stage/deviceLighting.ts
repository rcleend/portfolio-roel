import {
  DirectionalLight,
  HemisphereLight,
  type Object3D,
  PMREMGenerator,
  PointLight,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Lighting for the imported PBR devices (TV, PC, radio, PS2). The room itself is baked and
 * unlit, so these lights only shape the devices so they sit in the baked night scene:
 * a dim environment, blue moonlight through the window and the room's warm practicals.
 * Values match the Blender export's review viewer.
 */
const PRACTICAL_LIGHTS = [
  // Desk lamp.
  { color: 0xffc38c, intensity: 0.45, position: [-1.91, 1.13, -2.035], distance: 2.3 },
  // Lava lamp.
  { color: 0xff4c0b, intensity: 0.23, position: [0.49, 1.13, -1.97], distance: 1.3 },
  // Cool fill in front of the TV, standing in for moonlight bouncing off the floor.
  { color: 0x8397ff, intensity: 0.18, position: [2.08, 0.98, -0.32], distance: 1.6 },
] as const;

export function addDeviceLighting(scene: Scene, renderer: WebGLRenderer): () => void {
  const added: Object3D[] = [];
  const add = <T extends Object3D>(object: T): T => {
    scene.add(object);
    added.push(object);
    return object;
  };

  const pmrem = new PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  const environment: Texture = pmrem.fromScene(environmentScene, 0.04).texture;
  environmentScene.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.18;

  add(new HemisphereLight(0x9bb9ed, 0x2c2336, 0.35));
  const moon = add(new DirectionalLight(0x718dff, 0.65));
  moon.position.set(-1.4, 3.2, -3.6);
  for (const { color, intensity, position, distance } of PRACTICAL_LIGHTS) {
    const light = add(new PointLight(color, intensity, distance, 2));
    light.position.fromArray(position);
  }

  return () => {
    for (const object of added) scene.remove(object);
    scene.environment = null;
    environment.dispose();
  };
}
