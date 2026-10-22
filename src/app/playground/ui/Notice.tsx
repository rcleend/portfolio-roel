import { keepFocus } from './keepFocus';

interface NoticeProps {
  /** What the link asked for that the page cannot show, one line each. */
  readonly problems: readonly string[];
  readonly onDismiss: () => void;
}

/** Says what a shared link asked for that this checkout does not have, and what shows instead. */
export function Notice({ problems, onDismiss }: NoticeProps) {
  return (
    <div className="notice" role="status">
      <p className="notice__title">
        This link asks for things this checkout does not have; what the game shows today stands in.
      </p>
      <ul className="notice__list">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      <button type="button" className="tool" onMouseDown={keepFocus} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
