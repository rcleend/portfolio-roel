import { expect, type Page } from '@playwright/test';
import type { RoomStats } from '../src/room/createRoom';

/**
 * Shader programs the generated room holds from its first frame in the lab's unprocessed bake (`mood: 'original'`),
 * before the walls are decorated or the spotlight is in. The room compiles its whole scene once, as it is made
 * (`stage.prepare`), so the count is the same at the TV and in every view after it, and the computer adds none.
 * By what draws with them (three.js shares a program between materials of one kind):
 *
 *  1. the generated room's vertex-lit meshes: the TV set, the monitor, the props, the desk corner, the CD player's
 *     parts;
 *  2. its charts, a baked page each: the cabinet, the walls, the floor, the rug, the desk, the dresser;
 *  3. plain colour: the opal lamp's globe and the bare bulb's filament, the TV's dark glass and the LEDs' lenses;
 *  4. its prints (a map tinted by vertex colours, blended);
 *  5. the view outside the window (a map on a plate without normals, so not program 2);
 *  6. the lava lamp's wax (vertex colours, no normals);
 *  7. the lava lamp's glass and the bare bulb's, films of light: front faces only, the bottle's far wall being the
 *     same triangles wound the other way (LavaWax), where a double-sided blended material would draw in two passes
 *     with a program each;
 *  8. the CRT;
 *  9. the TV's light on the surfaces around it (ScreenGlow);
 * 10. the LEDs' halo;
 * 11. the reduced-motion cut's black veil (in the scene from the start, so compiled with it whether or not it shows).
 *
 * The pick meshes of the desk corner are never drawn and never compiled (GeneratedRoom keeps them out of
 * `stage.prepare`, since `renderer.compile` prepares invisible meshes too).
 */
export const BASE_PROGRAMS = 11;

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
 * What a night finish adds to the room's own (none are allocated by `original`):
 *
 *  - four of its own: the lamps' halation, the highlight extraction, the composition and the dust;
 *  - the monitor's display mask (its picture drawn with alpha 0, so no longer the charts' program);
 *  - the varnish splits one of the room's programs, since only surfaces named for the finish take it (RoomGloss):
 *    the globe and the filament leave the glass and the lenses (program 3).
 */
const FINISH_PROGRAMS = 4 + 1 + 1;

/**
 * Under a finish the full poster path holds four programs, not one: the cards no longer share the charts' varnished
 * program, and cards and skirts are both precompiled for the screen (compileAsync, before the walls show) and then
 * drawn into the finish's linear target. The lite path's cards add their one linear program.
 */
const FINISHED_POSTERS_PROGRAMS = POSTERS_PATH === 'lite' ? 1 : 4;

/** Night finishes: what they add to ROOM_PROGRAMS. */
export const ATMOSPHERE_PROGRAMS = FINISH_PROGRAMS + FINISHED_POSTERS_PROGRAMS - POSTERS_PROGRAMS;

/**
 * Production uses Velvet dusk; the lab retains the original bake for isolated device tests. Reduced motion adds none:
 * the cut's veil is compiled with the scene (program 11).
 */
export const FINISHED_ROOM_PROGRAMS = ROOM_PROGRAMS + ATMOSPHERE_PROGRAMS;
/** The CD's one material prewarms in screen output (compileAsync), then draws into the finish's linear target. */
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
 * Waits until the posters are shown and any fade is over, so a program count is deterministic: they go up in the first
 * flight's frames as background work and three checks compileAsync on a timer, so a paused clock must be moved on
 * (`step`, one frame at a time); without `step`, real time passes.
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
  // Cards that arrive late fade in on the skirts' blended program and take their own opaque one in the first frame
  // after the fade (PosterWall › setFading): the count is whole only then.
  while ((await stats())?.postersFading) {
    if (Date.now() > deadline) throw new Error('The posters are still fading in after 15 s');
    await step();
  }
  for (let frame = 0; frame < 3; frame++) await step();
  const shown = await stats();
  expect(shown?.posters).toBe('ready');
  expect(shown?.postersPath, 'the path the walls took on this GPU').toBe(POSTERS_PATH);
}
