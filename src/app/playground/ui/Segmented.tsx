import { keepFocus } from './keepFocus';

export interface Segment<T> {
  readonly value: T;
  readonly label: string;
  /** Shown on hover. */
  readonly hint?: string;
  /** Marks the segment as what the game shows today. */
  readonly current?: boolean;
}

interface SegmentedProps<T> {
  readonly label: string;
  readonly segments: readonly Segment<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Shows `label` in front of the segments; it is always there for assistive tech. */
  readonly visibleLabel?: boolean;
}

/** A one-of-many choice as a row of pressed and unpressed buttons. */
export function Segmented<T extends string | number>({
  label,
  segments,
  value,
  onChange,
  visibleLabel = false,
}: SegmentedProps<T>) {
  return (
    <fieldset className="segmented">
      <legend className={visibleLabel ? 'segmented__label' : 'visually-hidden'}>{label}</legend>
      <div className="segmented__options">
        {segments.map((segment) => (
          <button
            key={segment.value}
            type="button"
            className="segment"
            aria-pressed={segment.value === value}
            title={segment.hint}
            onMouseDown={keepFocus}
            onClick={() => onChange(segment.value)}
          >
            {segment.label}
            {segment.current ? (
              <span className="segment__current" title="What the game shows today">
                <span className="visually-hidden"> (current)</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
