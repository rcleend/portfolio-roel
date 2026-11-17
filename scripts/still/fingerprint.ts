/**
 * What the startup still was made from, as one short word (docs/ROOM.md › Startup): the triangles each layer picks
 * out of the generated room, the framing model and the layer table itself. `pnpm build:still` writes it beside the
 * colours; `still.test.ts` makes it again from the generators as they are now, so a change to the set, the cabinet,
 * the lamps, the plant or the TV view's framing fails there until the still is built again. (Tracing the outlines
 * again would say the same and take the test half a minute.)
 */
import type { StillFraming } from '../../src/app/startup/still/camera';
import { unseen } from '../../src/app/startup/still/camera';
import { LAYERS } from './layers';
import { cameraFor, type World } from './world';

export function fingerprint(world: World, framing: StillFraming): string {
  // Two FNV-1a hashes from different starts, over numbers to a hundredth of a millimetre and the table's text.
  const hashes = [0x811c9dc5, 0x01000193];
  const mix = (value: number): void => {
    for (let i = 0; i < hashes.length; i++) hashes[i] = Math.imul((hashes[i] as number) ^ value, 16777619) >>> 0;
  };
  const number = (value: number): void => mix(Math.round(value * 1e5));
  const text = (value: string): void => {
    for (let i = 0; i < value.length; i++) mix(value.charCodeAt(i));
  };
  const eye = unseen(cameraFor(framing, 1440, 900, false).eye);
  for (const point of [...framing.bounds, ...framing.picture, eye]) point.forEach(number);
  for (const layer of LAYERS) {
    // The layer as the table has it; its picks are functions, told by what they pick.
    text(JSON.stringify(layer));
    const picks = ['pick' in layer ? layer.pick : null, 'behind' in layer ? (layer.behind ?? null) : null];
    for (const pick of picks) {
      if (!pick) continue;
      world.triangles.forEach((triangle, i) => {
        if (!pick(triangle)) return;
        for (let k = 0; k < 9; k++) number(world.positions[i * 9 + k] as number);
      });
    }
  }
  return hashes.map((hash) => hash.toString(16).padStart(8, '0')).join('');
}
