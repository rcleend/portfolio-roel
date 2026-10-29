import type { HintWords } from './radioHints';

/** A hint's two voices: the Chewy heading over the Nunito line (docs/ART-DIRECTION.md › The room's UI). */
export function HintLines({ words }: { readonly words: HintWords }) {
  return (
    <span className="radio__words">
      <span className="radio__title">{words.title}</span>
      <span className="radio__body">{words.body}</span>
    </span>
  );
}
