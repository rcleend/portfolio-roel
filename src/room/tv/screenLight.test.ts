import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Texture, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { boxCorners } from '../camera/framing';
import { createScreenLightUniforms, SCREEN_LIGHT, type ScreenLightUniforms, screenLight } from './screenLight';
import type { UvRect } from './screenMapping';
import { tvFixture } from './tvFixtures';
import { pictureOutline } from './tvFraming';
import { TV_SCREEN_APERTURE } from './tvModel';

/** The shipped TV faces into the room, −x. */
const FACING = new Vector3(-1, 0, 0);

let light: ScreenLightUniforms;
let glassBox: Box3;
let content: UvRect;
const picture = new Texture();

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const fixture = tvFixture(await io.read(join(process.cwd(), 'public/room/tv-high.glb')));
  content = fixture.content;
  glassBox = new Box3().setFromObject(fixture.glass);
  const { min, max } = fixture.framing.bounds;
  const front = Math.max(...boxCorners(min, max).map((corner) => corner.dot(FACING)));
  light = screenLight(
    pictureOutline(fixture.glass, content),
    FACING,
    glassBox,
    TV_SCREEN_APERTURE,
    front,
    320,
    picture,
  );
});

describe('screenLight', () => {
  it('takes the picture frame from the set: right along +z (u), up, and its normal into the room', () => {
    const basis = light.uScreenBasis.value.elements;
    // Columns of the matrix: right, up, normal.
    expect([...basis.slice(0, 3)].map((value) => value + 0)).toEqual([0, 0, 1]);
    expect([...basis.slice(3, 6)].map((value) => value + 0)).toEqual([0, 1, 0]);
    expect([...basis.slice(6, 9)].map((value) => value + 0)).toEqual([-1, 0, 0]);
  });

  it('is the picture on the glass: its extent, and the plane its edges emit from on the curved face', () => {
    const width = glassBox.max.z - glassBox.min.z;
    const height = glassBox.max.y - glassBox.min.y;
    const centre = light.uScreenCentre.value;
    const size = light.uScreenSize.value;
    // The content rect in metres (u along +z, v down from the top), to the millimetre.
    expect(centre.z).toBeCloseTo(glassBox.min.z + ((content.minU + content.maxU) / 2) * width, 3);
    expect(centre.y).toBeCloseTo(glassBox.max.y - ((content.minV + content.maxV) / 2) * height, 3);
    expect(size.x).toBeCloseTo(((content.maxU - content.minU) / 2) * width, 3);
    expect(size.y).toBeCloseTo(((content.maxV - content.minV) / 2) * height, 3);
    // Behind the glass's bulging middle (x 2.159) and in front of its corners (2.184): where its edges are.
    expect(centre.x).toBeGreaterThan(2.164);
    expect(centre.x).toBeLessThan(2.176);
  });

  it('is seen through the bezel: an opening a tube border wider, at the front of the set a little ahead of it', () => {
    const size = light.uScreenSize.value;
    const [recess, lod, output] = light.uScreenOptics.value.toArray();
    // The aperture's dark border around the picture: 7 to 16 mm on each side.
    expect(size.z - size.x).toBeGreaterThan(0.007);
    expect(size.z - size.x).toBeLessThan(0.016);
    expect(size.w - size.y).toBeGreaterThan(0.007);
    expect(size.w - size.y).toBeLessThan(0.016);
    // The set's front (x 2.153) stands 1–2.5 cm in front of the picture's plane.
    expect(recess).toBeGreaterThan(0.01);
    expect(recess).toBeLessThan(0.025);
    // A surface 1 cm from the glass takes the colour of the picture over ~16 of its 320 columns (LOD 4).
    expect(lod + Math.log2(0.01)).toBeCloseTo(Math.log2((2.5 * 0.01 * 320) / (2 * size.x)), 6);
    expect(lod + Math.log2(0.01)).toBeGreaterThan(3.5);
    expect(lod + Math.log2(0.01)).toBeLessThan(4.5);
    // Dark until the tube says otherwise (Television.syncGlow), and lit by its picture's texture.
    expect(output).toBe(0);
    expect(light.uScreenPicture.value).toBe(picture);
  });

  it('starts dark until a set publishes its light', () => {
    const placeholder = createScreenLightUniforms();
    expect(placeholder.uScreenPicture.value).toBeNull();
    expect(placeholder.uScreenOptics.value.z).toBe(0);
  });

  it('declares in GLSL every uniform it hands the finish, and the finish’s gain', () => {
    for (const name of [...Object.keys(createScreenLightUniforms()), 'uScreenGain'])
      expect(SCREEN_LIGHT).toMatch(new RegExp(`uniform \\w+ ${name};`));
  });
});
