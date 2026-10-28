import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RADIO_VIEWPORTS } from '../radio/radioFixtures';
import { RADIO_ANCHOR } from '../radio/radioModel';
import { type AnchorTarget, EDGE_BAND, propAnchors } from './anchors';
import type { Viewpoint } from './cameraPath';
import { roomViewpoint } from './roomFraming';

/** The middles of the two pictures in the attic (pc-base.glb and tv-high.glb, room revision 6). */
const PROPS: readonly AnchorTarget[] = [
  { target: 'tv', point: new Vector3(2.159, 0.836, -0.32) },
  { target: 'pc', point: new Vector3(-1.34, 1.071, -1.679) },
];

function anchorsAt(width: number, height: number) {
  const anchors = propAnchors(PROPS, roomViewpoint(width / height), { width, height });
  const find = (target: string) => {
    const anchor = anchors.find((a) => a.target === target);
    if (!anchor) throw new Error(`no ${target} anchor`);
    return anchor;
  };
  return { tv: find('tv'), pc: find('pc') };
}

describe('propAnchors', () => {
  it('pins both props where the desktop room view shows them', () => {
    const { tv, pc } = anchorsAt(1440, 900);
    // Within a few pixels of where the end-to-end tests click the monitor and the TV.
    expect(pc.inFrame).toBe(true);
    expect(Math.abs(pc.x - 375)).toBeLessThan(2);
    expect(Math.abs(pc.y - 455)).toBeLessThan(2);
    expect(tv.inFrame).toBe(true);
    expect(Math.abs(tv.x - 1196)).toBeLessThan(2);
    expect(Math.abs(tv.y - 526)).toBeLessThan(2);
  });

  it.each([
    [390, 844],
    [375, 667],
    [600, 900],
    [768, 1024],
    [820, 1180],
  ])('marks the computer out of frame when a %s × %s room view crops it', (width, height) => {
    const { pc, tv } = anchorsAt(width, height);
    expect(pc.inFrame).toBe(false);
    // Off the page to the left, where the portrait view leaves it.
    expect(pc.x).toBeLessThan(0);
    // The portrait view turns towards the TV, which therefore stays in shot.
    expect(tv.inFrame).toBe(true);
  });

  it('counts a prop behind the camera as out of frame', () => {
    const looking: Viewpoint = { position: new Vector3(0, 1, 0), target: new Vector3(0, 1, -1), fov: 60 };
    const behind = propAnchors(
      [
        { target: 'pc', point: new Vector3(-2, 1, 1) },
        { target: 'tv', point: new Vector3(0.05, 1, 2) },
      ],
      looking,
      { width: 800, height: 600 },
    );
    expect(behind.map(({ inFrame }) => inFrame)).toEqual([false, false]);
  });

  it('counts the 24 px band along each edge as out of frame', () => {
    const looking: Viewpoint = { position: new Vector3(0, 0, 1), target: new Vector3(0, 0, 0), fov: 90 };
    // At 90° and 1 m, x = ±1 is the viewport's edge: 0.95 lands 10 px inside an 400 px wide page.
    const [nearEdge] = propAnchors([{ target: 'tv', point: new Vector3(0.95, 0, 0) }], looking, {
      width: 400,
      height: 400,
    });
    expect(nearEdge?.inFrame).toBe(false);
    expect(nearEdge?.x).toBeGreaterThan(400 - EDGE_BAND);
    expect(nearEdge?.x).toBeLessThan(400);
  });

  it.each(RADIO_VIEWPORTS)('has the radio in the room view at $width × $height', ({ width, height }) => {
    const [radio] = propAnchors([{ target: 'radio', point: RADIO_ANCHOR }], roomViewpoint(width / height), {
      width,
      height,
    });
    expect(radio).toMatchObject({ target: 'radio', inFrame: true });
  });
});
