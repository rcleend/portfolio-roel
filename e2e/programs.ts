import { expect, type Page } from '@playwright/test';
import type { RoomStats } from '../src/room/createRoom';

/**
 * Shader programs the room compiles by its first room view, pinned at 2494ded before the computer existed; the
 * computer and the radio's first load add none.
 */
export const BASE_PROGRAMS = 7;

/**
 * The path the decorated walls take on the suites' GPU (RoomStats.postersPath): the suites run on Metal ANGLE by
 * default, the full path; under ROOM_GL=swiftshader the room takes the lite path. postersShown holds the page to it.
 */
export const POSTERS_PATH = process.env.ROOM_GL === 'swiftshader' ? 'lite' : 'full';

/**
 * The decorated walls' one program (docs/ROOM.md › Posters): the blended, premultiplied unlit program the skirts and
 * the fading cards share, which compileAsync builds before the walls show. The lite path (no skirts, no fade, the
 * cards on the room's own opaque program) adds none.
 */
export const POSTERS_PROGRAMS = POSTERS_PATH === 'lite' ? 0 : 1;

/**
 * The props' spotlight (docs/ROOM.md › The spotlight): its mask-and-blur program and its glow's, compiled as its chunk
 * arrives behind the first flight away from the TV, so that the first hover never stalls.
 */
export const SPOTLIGHT_PROGRAMS = 2;

/** Programs after the first room view, once the posters are shown and the spotlight is in. */
export const ROOM_PROGRAMS = BASE_PROGRAMS + POSTERS_PROGRAMS + SPOTLIGHT_PROGRAMS;

/**
 * The opal lamp beside the TV (docs/ROOM.md › The opal lamp): its base and globe share one material, the room's unlit
 * varnish without a map, compiled for the screen and for the finish's linear target on either poster path. The
 * original bake draws it with a program the room already has.
 */
export const TV_LAMP_PROGRAMS = 2;

/**
 * Night finishes: varnish, lamp halation, highlight extraction, composition, dust and the monitor's display mask,
 * plus linear-output versions also precompiled for the screen by the full poster path. None are allocated by original.
 */
export const ATMOSPHERE_PROGRAMS = (POSTERS_PATH === 'lite' ? 6 : 8) + TV_LAMP_PROGRAMS;

/** Production uses Velvet dusk; the lab retains the original bake for isolated device tests. */
export const FINISHED_ROOM_PROGRAMS = ROOM_PROGRAMS + ATMOSPHERE_PROGRAMS;
/** Reduced-motion cuts additionally draw the black veil through the linear atmosphere target. */
export const FINISHED_REDUCED_ROOM_PROGRAMS = FINISHED_ROOM_PROGRAMS + 1;
/** The real CD material prewarms in screen output, then draws into the finish's linear target. */
export const FINISHED_RADIO_PROGRAMS = 2;

/**
 * Waits until the spotlight's chunk is in (RoomStats.spotlight), so a program count is deterministic: it is imported
 * after the first flight's first frame, in real time.
 */
export async function spotlightIn(page: Page, stats: () => Promise<RoomStats | undefined>): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!(await stats())?.spotlight) {
    if (Date.now() > deadline) throw new Error('The spotlight is still loading after 15 s');
    await page.waitForTimeout(50);
  }
}

/**
 * Waits until the posters are shown, so a program count is deterministic: they go up in the first flight's frames
 * as background work and three checks compileAsync on a timer, so a paused clock must be moved on (`step`, one frame
 * at a time); without `step`, real time passes.
 */
export async function postersShown(
  page: Page,
  stats: () => Promise<RoomStats | undefined>,
  step: () => Promise<void> = () => page.waitForTimeout(50),
): Promise<void> {
  const deadline = Date.now() + 15_000;
  const onTheirWay = new Set(['loading', 'staged']);
  while (onTheirWay.has((await stats())?.posters ?? '')) {
    if (Date.now() > deadline) throw new Error('The posters are still loading after 15 s');
    await step();
  }
  const shown = await stats();
  expect(shown?.posters).toBe('ready');
  expect(shown?.postersPath, 'the path the walls took on this GPU').toBe(POSTERS_PATH);
}
