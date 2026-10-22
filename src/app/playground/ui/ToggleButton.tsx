import type { ReactNode } from 'react';
import { keepFocus } from './keepFocus';

interface ToggleButtonProps {
  readonly pressed: boolean;
  readonly onToggle: () => void;
  /** Shown on hover. */
  readonly hint?: string;
  readonly children: ReactNode;
}

/** An on/off setting, with a lamp that lights while it is on. */
export function ToggleButton({ pressed, onToggle, hint, children }: ToggleButtonProps) {
  return (
    <button
      type="button"
      className="tool toggle"
      aria-pressed={pressed}
      title={hint}
      onMouseDown={keepFocus}
      onClick={onToggle}
    >
      <span className="toggle__lamp" aria-hidden="true" />
      {children}
    </button>
  );
}
