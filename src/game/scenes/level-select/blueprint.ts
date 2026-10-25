import type { TextStyle } from '@/engine/gfx/TextStyle';
import { INK, shadeOf } from '../title/backdrops/blueprint/inks';
import type { PostcardInks } from './Postcards';

/**
 * The mission select's own marks in the blueprint's cyanotype inks, so the
 * tabs, the classified slot, the route and the lettering read as drawn on
 * the same sheet as the backdrop and the character select's card. Gold,
 * green, red and white keep the meanings they carry on top of it.
 */
export const MISSION_INK = {
  /** The unexposed paper: outlines, the props' edges and the lettering's rim. */
  outline: shadeOf(0),
  /** Secondary lettering: the company context, the teaser's STATUS line and the player tag. */
  secondary: shadeOf(INK.mid),
  /** A route stop not reached yet, and the "?" of the one still to be written. */
  route: shadeOf(INK.pale),
  /** The dotted leg to the visitor's team: as faint as a construction line, still clear of the paper. */
  future: shadeOf(INK.mid),
  /** The plane's contrail, nearest puff first, fading into the paper. */
  contrail: [shadeOf(INK.white), shadeOf(INK.mid), shadeOf(INK.ghost)],
} as const;

/**
 * The arcade prompt face (MISSION SELECT, the "?" marks) banded from white
 * down the blueprint's line inks instead of lavender, outlined in the paper's
 * darkest navy.
 */
export function blueprintPrompt(prompt: TextStyle): TextStyle {
  const outline = MISSION_INK.outline;
  return {
    ...prompt,
    fill: [shadeOf(INK.hot), shadeOf(INK.hot), shadeOf(INK.white), shadeOf(INK.pale), shadeOf(INK.mid)],
    bands: 5,
    outline,
    shadow: prompt.shadow && { ...prompt.shadow, color: outline },
  };
}

/**
 * The postcards on the blueprint: folder tabs a few steps under the paper
 * with a lit top edge, and the locked slot's hatch marching in paper blues
 * over a field that sinks towards the unexposed navy.
 */
export function blueprintPostcards(prompt: TextStyle): PostcardInks {
  return {
    outline: MISSION_INK.outline,
    folder: shadeOf(1),
    folderEdge: shadeOf(5),
    classified: [shadeOf(3), shadeOf(1)],
    hatch: shadeOf(6),
    prop: MISSION_INK.outline,
    mark: blueprintPrompt(prompt),
  };
}
