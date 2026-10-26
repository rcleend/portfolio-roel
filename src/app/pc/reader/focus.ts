const TABBABLE = 'a[href], button:not(:disabled), select:not(:disabled), [tabindex]';

/** The elements Tab visits inside `container`, in document order. */
export function tabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.closest('[inert], [aria-hidden="true"]'),
  );
}

/**
 * Keeps Tab inside a modal dialog: past the last stop it wraps to the first
 * and back. Returns true when it moved focus (the caller prevents the default).
 */
export function trapTab(container: HTMLElement, backwards: boolean): boolean {
  const stops = tabbables(container);
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) return false;
  const active = document.activeElement;
  if (backwards && (active === first || !container.contains(active))) {
    last.focus();
    return true;
  }
  if (!backwards && (active === last || !container.contains(active))) {
    first.focus();
    return true;
  }
  return false;
}
