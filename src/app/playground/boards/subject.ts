import type { PreviewSpec } from '@/game/preview';
import type { Timeline } from './timeline';

/** One option of a picker: a registered variant, as its registry describes it. */
export interface Choice {
  readonly id: string;
  readonly name: string;
  /** One line on what sets it apart. */
  readonly description: string;
}

/** One way a subject can vary, e.g. which backdrop the title shows. */
export interface Picker {
  /** Key in `Picks` and in the page URL. */
  readonly id: string;
  readonly label: string;
  /** In registry order. */
  readonly choices: readonly Choice[];
  /** What the game shows today: the default pick, marked "current". */
  readonly current: string;
}

/** A choice id for every picker of a subject, by picker id. */
export type Picks = Readonly<Record<string, string>>;

/**
 * Something the playground shows live: a scene of the game, the pickers
 * that shape it and the timeline worth scrubbing through.
 */
export interface Subject {
  readonly id: string;
  readonly label: string;
  readonly pickers: readonly Picker[];
  readonly timeline: Timeline;
  /** The scene and params `picks` show; a picker they leave out stands at today's choice. */
  preview(picks: Picks): PreviewSpec;
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
