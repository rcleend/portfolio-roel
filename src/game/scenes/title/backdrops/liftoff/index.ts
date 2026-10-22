import type { Gfx } from '@/engine/gfx/Gfx';
import { lazy } from '../../../../art/logos/lazy';
import { bitmapToCanvas } from '../../../../art/logos/raster/toCanvas';
import type { BackdropArt, TitleBackdrop, TitleFrame } from '../TitleBackdrop';
import { drawBeacons } from './beacons';
import { layoutBillow, type PuffPose, poseBillowPuff, TRENCH_MOUTH } from './billow';
import { drawBloom, drawFlare } from './bloom';
import { drawBoom } from './boom';
import { layoutClouds } from './clouds';
import { DELIVERIES, deliveryAge, drawDelivery } from './deliveries';
import { drawFlame, drawJet } from './flame';
import { PAD_BOX, paintLaunchPad } from './launchpad';
import { STAGE } from './layout';
import { layoutPlume, posePlumePuff } from './plume';
import { PUFF_LIGHTING, paintPuffAtlas, warmthLighting } from './puffs';
import { paintRocket, ROCKET_SIZE } from './rocket';
import { paintBackdrops } from './sky';
import { paintSkyline, SKYLINE_TOP } from './skyline';
import { SmokeMass } from './smokeMass';
import { drawStars, layoutStars, paintFarStars } from './stars';
import {
  bloomRadius,
  boomProgress,
  exhaustWarmth,
  flameLength,
  flareHalfWidth,
  floodReach,
  frameOf,
  ignitionLight,
  jetLength,
  padRumble,
  rocketLift,
  rocketVisible,
} from './timeline';

/**
 * Launch night (docs/ART-DIRECTION.md › Title › Liftoff): the product
 * ships from a pad between Berlin and San Francisco at dusk. The fireball
 * becomes the ignition, the crater the smoke billowing off the pad, and
 * the idle loop the exhaust plume drifting over the logo while, now and
 * then, another rocket goes up far away.
 */
export const liftoffBackdrop: TitleBackdrop<'liftoff'> = {
  id: 'liftoff',
  name: 'Liftoff',
  description:
    'Launch night over a Berlin–San Francisco skyline: ignition, a smoke billow and a plume that drifts at dusk.',
  prepare: lazy(paintLiftoffBackdrop),
};

/** Palette-cycle steps per second as the smoke banks roll; reduced motion rolls them at half the pace. */
const ROLL_FPS = 4;
/** Above this ignition light the far stars are washed out. */
const STARS_UNTIL_LIGHT = 1;
/** The flood's stepped dome: how many steps tall, and how much wider than tall. */
const FLOOD_STEPS = 7;
const FLOOD_SPREAD = 1.5;
/** From this ignition light up, the rocket and its tower stand black against the bloom: the impact frames. */
const SILHOUETTE_FROM_LIGHT = 3;

/** About 55 ms on a laptop, on a par with the classic: most of it the sky's five light levels and the smoke atlas. */
function paintLiftoffBackdrop(): BackdropArt {
  const clouds = layoutClouds();
  const stars = layoutStars(clouds);
  const billow = layoutBillow();
  const plumePuffs = layoutPlume();
  const backdrops = paintBackdrops(clouds).map((bitmap, level) => {
    if (level <= STARS_UNTIL_LIGHT) paintFarStars(bitmap, stars);
    return bitmapToCanvas(bitmap);
  });
  const skyline = bitmapToCanvas(paintSkyline());
  const pad = bitmapToCanvas(paintLaunchPad());
  const rocket = bitmapToCanvas(paintRocket());
  const rocketSilhouette = bitmapToCanvas(paintRocket(true));
  const atlas = bitmapToCanvas(paintPuffAtlas());
  // Scratch for posing and collecting smoke: every frame overwrites it, so no frame depends on another.
  const pose: PuffPose = { x: 0, y: 0, radius: 0 };
  const plume = new SmokeMass(plumePuffs.length);
  const billowBack = new SmokeMass(billow.length);
  const billowFront = new SmokeMass(billow.length);

  /**
   * The ignition light floods out over the plain evening: the ground and
   * the horizon light up at once, then the sky in a stepped dome climbing
   * from the pad, until it fills the sky.
   */
  function drawSky(gfx: Gfx, light: number, time: number, reducedMotion: boolean): void {
    const plain = backdrops[0];
    const lit = backdrops[light] ?? plain;
    if (!plain || !lit) return;
    const reach = reducedMotion ? Number.POSITIVE_INFINITY : floodReach(time);
    if (light === 0 || !Number.isFinite(reach)) {
      gfx.image(lit, 0, 0);
      return;
    }
    gfx.image(plain, 0, 0);
    const lowest = Math.round(STAGE.pad.y - reach / FLOOD_STEPS);
    gfx.image(lit, 0, lowest, { source: { x: 0, y: lowest, w: STAGE.width, h: STAGE.height - lowest } });
    for (let step = 1; step < FLOOD_STEPS; step++) {
      const bottom = Math.round(STAGE.pad.y - (reach * step) / FLOOD_STEPS);
      const top = Math.round(STAGE.pad.y - (reach * (step + 1)) / FLOOD_STEPS);
      const half = Math.round(reach * FLOOD_SPREAD * Math.sqrt(1 - (step / FLOOD_STEPS) ** 2));
      const left = Math.max(0, STAGE.pad.x - half);
      const right = Math.min(STAGE.width, STAGE.pad.x + half + 1);
      gfx.image(lit, left, top, { source: { x: left, y: top, w: right - left, h: bottom - top } });
    }
  }

  /** The column, lit warm while the flame is near and by the sky (or the set sun, up high) once it has gone. */
  function drawPlume(gfx: Gfx, frame: TitleFrame, light: number, nozzleY: number | null): void {
    plume.begin();
    for (const puff of plumePuffs) {
      if (!posePlumePuff(puff, frame.time, frame.beats, pose)) continue;
      const distance = nozzleY === null ? Number.POSITIVE_INFINITY : Math.abs(pose.y - nozzleY);
      const warmth = exhaustWarmth(distance, light);
      const lighting = warmth > 0 ? warmthLighting(warmth) : puff.sunlit ? PUFF_LIGHTING.SUNLIT : PUFF_LIGHTING.SHADOW;
      plume.add(pose.x, pose.y, pose.radius, lighting, 0);
    }
    plume.draw(gfx, atlas);
  }

  /** Poses the billow into its two masses: behind the pad, and in front of it. */
  function collectBillow(frame: TitleFrame, light: number, nozzleY: number | null): void {
    const roll = Math.floor(frame.time * ROLL_FPS * (frame.reducedMotion ? 0.5 : 1));
    billowBack.begin();
    billowFront.begin();
    for (const puff of billow) {
      if (!poseBillowPuff(puff, frame.time, pose)) continue;
      const distance = nozzleY === null ? Number.POSITIVE_INFINITY : Math.hypot(pose.x - STAGE.pad.x, pose.y - nozzleY);
      const lighting = warmthLighting(exhaustWarmth(distance, light));
      (puff.front ? billowFront : billowBack).add(pose.x, pose.y, pose.radius, lighting, roll + puff.phase);
    }
  }

  return {
    drawBehind(gfx: Gfx, frame: TitleFrame): void {
      const { time, beats, reducedMotion, lockupBounds } = frame;
      const light = ignitionLight(time, reducedMotion);
      const nozzleY = rocketVisible(time, beats) ? STAGE.pad.y - rocketLift(time, beats) : null;

      drawSky(gfx, light, time, reducedMotion);
      if (light <= STARS_UNTIL_LIGHT) drawStars(gfx, stars, time, reducedMotion, lockupBounds);
      const boom = boomProgress(time, beats, reducedMotion);
      if (boom !== null) drawBoom(gfx, boom);
      for (const delivery of DELIVERIES) {
        const age = deliveryAge(delivery, time, beats);
        if (age !== null) drawDelivery(gfx, delivery, age);
      }
      gfx.image(skyline, 0, SKYLINE_TOP);
      drawBeacons(gfx, time, reducedMotion, lockupBounds);
      drawPlume(gfx, frame, light, nozzleY);
      const bloom = bloomRadius(time, reducedMotion);
      if (bloom > 0) drawBloom(gfx, bloom, reducedMotion);
      const flare = flareHalfWidth(time, reducedMotion);
      if (flare > 0) drawFlare(gfx, flare);
      collectBillow(frame, light, nozzleY);
      billowBack.draw(gfx, atlas);

      // The pad and the rocket on it rumble; the sky and the far city hold still.
      const rumble = padRumble(time, beats, reducedMotion);
      gfx.image(pad, PAD_BOX.x + rumble, PAD_BOX.y);
      if (nozzleY !== null) {
        const x = STAGE.pad.x + rumble;
        const sprite = light >= SILHOUETTE_FROM_LIGHT ? rocketSilhouette : rocket;
        drawFlame(gfx, x, nozzleY, flameLength(time, beats), frameOf(time));
        gfx.image(sprite, x - Math.floor(ROCKET_SIZE.width / 2), nozzleY - ROCKET_SIZE.height);
      }
      const jet = jetLength(time, reducedMotion);
      if (jet > 0) {
        drawJet(gfx, STAGE.pad.x - TRENCH_MOUTH.offset, TRENCH_MOUTH.y, -1, jet, frameOf(time));
        drawJet(gfx, STAGE.pad.x + TRENCH_MOUTH.offset, TRENCH_MOUTH.y, 1, jet, frameOf(time));
      }
      billowFront.draw(gfx, atlas);
    },
  };
}
