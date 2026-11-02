import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PcFramingModel } from '../pc/pcFraming';
import { RADIO_FIXTURE } from '../radio/radioFixtures';
import { radioPoseSolver } from '../radio/radioFraming';
import { type FrameScheduler, RenderLoop } from '../stage/RenderLoop';
import { type TvFramingModel, tvViewpoint } from '../tv/tvFraming';
import { CameraRig, MAX_CUT_HOLD_MS, NO_INSETS, REDUCED_FADE_MS } from './CameraRig';
import { regionFromInsets } from './framing';
import type { ScreenFade } from './ScreenFade';

/** pc-base.glb's glass and shell as the model finds them, and a TV set with a 4:3 picture on its front. */
const PC: PcFramingModel = {
  facing: new Vector3(0, 0, 1),
  rim: { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 },
  shellBounds: new Box3(new Vector3(-1.57, 0.785, -2.086), new Vector3(-1.11, 1.268, -1.654)),
};
const TV: TvFramingModel = {
  facing: new Vector3(-1, 0, 0),
  bounds: new Box3(new Vector3(1.6, 0.6, -0.6), new Vector3(2.1, 1.2, 0.2)),
  picture: [
    new Vector3(1.6, 0.72, -0.5),
    new Vector3(1.6, 0.72, 0.1),
    new Vector3(1.6, 1.17, 0.1),
    new Vector3(1.6, 1.17, -0.5),
  ],
};

/** Frames on demand: `frame(ms)` runs what was requested at that time. */
class Frames implements FrameScheduler {
  #callbacks: ((now: number) => void)[] = [];
  request(callback: (now: number) => void): number {
    this.#callbacks.push(callback);
    return this.#callbacks.length;
  }
  cancel(): void {
    this.#callbacks = [];
  }
  run(now: number): void {
    const due = this.#callbacks;
    this.#callbacks = [];
    for (const callback of due) callback(now);
  }
}

function rig(reduced: boolean) {
  const frames = new Frames();
  const loop = new RenderLoop(() => undefined, frames);
  const fade = { opacity: 0 } as unknown as ScreenFade;
  const motion = { matches: reduced } as MediaQueryList;
  const camera = new PerspectiveCamera();
  const instance = new CameraRig(camera, loop, TV, PC, motion, fade);
  instance.setRadioFraming(radioPoseSolver(RADIO_FIXTURE, 5, NO_INSETS));
  return { instance, frames, fade, camera };
}

describe('CameraRig', () => {
  it('solves the radio pose only when it is first needed, and again only after a change', () => {
    const { instance } = rig(false);
    instance.resize({ width: 1440, height: 900, pixelRatio: 2 });
    const solve = vi.fn(radioPoseSolver(RADIO_FIXTURE, 5, NO_INSETS));
    instance.setRadioFraming(solve);
    expect(solve).not.toHaveBeenCalled();
    const pose = instance.viewpoint('radio');
    expect(solve).toHaveBeenCalledTimes(1);
    expect(instance.viewpoint('radio').position.distanceTo(pose.position)).toBe(0);
    expect(solve).toHaveBeenCalledTimes(1);
    instance.resize({ width: 1440, height: 800, pixelRatio: 2 });
    instance.viewpoint('radio');
    expect(solve).toHaveBeenCalledTimes(2);
    const inset = vi.fn(radioPoseSolver(RADIO_FIXTURE, 5, { top: 0, right: 0, bottom: 64, left: 0 }));
    instance.setRadioFraming(inset);
    expect(instance.viewpoint('radio').position.distanceTo(pose.position)).toBeGreaterThan(0);
    expect(inset).toHaveBeenCalledTimes(1);
  });

  it('reframes the TV as a phone turns, clear of the touch pad on either side', () => {
    const { instance, camera } = rig(false);
    const upright = { width: 390, height: 844, pixelRatio: 3 };
    const onItsSide = { width: 844, height: 390, pixelRatio: 3 };
    const bottomPad = { ...NO_INSETS, bottom: 194 };
    const sidePads = { ...NO_INSETS, left: 138, right: 174 };
    const expected = (viewport: typeof upright, insets: typeof NO_INSETS) =>
      tvViewpoint(TV, viewport, regionFromInsets(viewport, insets));
    instance.resize(upright);
    instance.setFramingInsets(bottomPad);
    expect(instance.viewpoint('tv')).toEqual(expected(upright, bottomPad));
    // The viewport turns first; the pad's new insets follow once the app has laid it out again.
    instance.resize(onItsSide);
    instance.setFramingInsets(sidePads);
    expect(instance.viewpoint('tv')).toEqual(expected(onItsSide, sidePads));
    expect(camera.position.distanceTo(expected(onItsSide, sidePads).position)).toBeLessThan(1e-9);
    expect(camera.fov).toBe(expected(onItsSide, sidePads).fov);
    instance.resize(upright);
    instance.setFramingInsets(bottomPad);
    expect(instance.viewpoint('tv')).toEqual(expected(upright, bottomPad));
  });

  it('rests the radio view at the room pose until the radio can frame itself', () => {
    const { instance } = rig(false);
    instance.setRadioFraming(null);
    expect(instance.viewpoint('radio').position.distanceTo(instance.viewpoint('room').position)).toBe(0);
  });

  it('holds a reduced-motion cut black while asked, then fades back and arrives', () => {
    const { instance, frames, fade } = rig(true);
    instance.resize({ width: 1440, height: 900, pixelRatio: 2 });
    let holding = true;
    const arrived = vi.fn();
    instance.goTo('radio', arrived, { holdCut: () => holding });
    frames.run(0);
    expect(instance.veiled).toBe(false);
    for (let t = 16; t <= 600; t += 16) frames.run(t);
    expect(fade.opacity).toBe(1);
    expect(instance.veiled).toBe(true);
    expect(arrived).not.toHaveBeenCalled();
    holding = false;
    frames.run(616);
    expect(instance.veiled).toBe(false);
    frames.run(616 + REDUCED_FADE_MS / 2);
    expect(fade.opacity).toBeGreaterThan(0);
    expect(fade.opacity).toBeLessThan(1);
    frames.run(616 + REDUCED_FADE_MS + 16);
    expect(fade.opacity).toBe(0);
    expect(arrived).toHaveBeenCalledTimes(1);
  });

  it('cuts on black even when the frame after the fade starts comes late, then fades back', () => {
    const { instance, frames, fade } = rig(true);
    instance.resize({ width: 1440, height: 900, pixelRatio: 2 });
    const arrived = vi.fn();
    instance.goTo('room', arrived);
    frames.run(0);
    // A slow frame (a first look's uploads and compiles) lands past the fade out and the fade back alike.
    frames.run(3 * REDUCED_FADE_MS);
    expect(fade.opacity).toBe(1);
    expect(arrived).not.toHaveBeenCalled();
    frames.run(3 * REDUCED_FADE_MS + REDUCED_FADE_MS + 16);
    expect(fade.opacity).toBe(0);
    expect(arrived).toHaveBeenCalledTimes(1);
  });

  it('never holds a cut black longer than its limit', () => {
    const { instance, frames, fade } = rig(true);
    instance.resize({ width: 1440, height: 900, pixelRatio: 2 });
    const arrived = vi.fn();
    instance.goTo('radio', arrived, { holdCut: () => true });
    const end = REDUCED_FADE_MS + MAX_CUT_HOLD_MS + REDUCED_FADE_MS + 32;
    for (let t = 0; t <= end; t += 16) frames.run(t);
    expect(fade.opacity).toBe(0);
    expect(arrived).toHaveBeenCalledTimes(1);
  });

  it('is no longer veiled once a new move supersedes a held cut', () => {
    const { instance, frames } = rig(true);
    instance.resize({ width: 1440, height: 900, pixelRatio: 2 });
    instance.goTo('room', () => {}, { holdCut: () => true });
    for (let t = 0; t <= REDUCED_FADE_MS + 64; t += 16) frames.run(t);
    expect(instance.veiled).toBe(true);
    instance.goTo('tv', () => {});
    expect(instance.veiled).toBe(false);
  });
});
