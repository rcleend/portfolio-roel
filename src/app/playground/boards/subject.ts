import type { LookSelectionInput } from '@/game/art/looks/selection';
import type { PreviewSpec } from '@/game/preview';
import type { Timeline } from './timeline';

/** One option of a picker: a registered variant or look, as its registry or docs/LOOKS.md describe it. */
export interface Choice {
  readonly id: string;
  readonly name: string;
  /** One line on what sets it apart. */
  readonly description: string;
}

/** One way a subject can vary, e.g. which backdrop the title shows or which look a hero is drawn in. */
export interface Picker {
  /** Key in `Picks` and in the page URL. */
  readonly id: string;
  readonly label: string;
  /** In registry order. */
  readonly choices: readonly Choice[];
  /** What the game shows today: the default pick, marked "current". */
  readonly current: string;
}

/** A choice id for pickers of a subject, by picker id; a picker left out stands at its current choice. */
export type Picks = Readonly<Record<string, string>>;

/** What a live tile shows: a real scene with its params, drawn in a selection of looks. */
export interface Show {
  readonly spec: PreviewSpec;
  /** Whatever it leaves out is `DEFAULT_LOOKS`. */
  readonly looks: LookSelectionInput;
}

/**
 * Something the playground shows live: a scene of the game, the pickers
 * that shape it and the timeline worth scrubbing through.
 */
export interface Subject {
  readonly id: string;
  readonly label: string;
  /** Every picker, in the order focus mode offers them. */
  readonly pickers: readonly Picker[];
  readonly timeline: Timeline;
  show(picks: Picks): Show;
}

/** Every picker of `subject` at what the game shows today. */
export function currentPicks(subject: Subject): Picks {
  return Object.fromEntries(subject.pickers.map((picker) => [picker.id, picker.current]));
}

/** The choice `picks` makes for `picker`, falling back to the current one. */
export function chosen(picker: Picker, picks: Picks): Choice {
  const id = picks[picker.id] ?? picker.current;
  return picker.choices.find((candidate) => candidate.id === id) ?? currentChoice(picker);
}

function currentChoice(picker: Picker): Choice {
  const choice = picker.choices.find((candidate) => candidate.id === picker.current);
  if (!choice) throw new Error(`Picker "${picker.id}" lacks its current choice "${picker.current}"`);
  return choice;
}
