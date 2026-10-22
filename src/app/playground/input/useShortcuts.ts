import { useEffect, useEffectEvent } from 'react';
import { keyOwnerOf, type Shortcut, shortcutFor } from './shortcuts';

/** Runs the playground's keyboard shortcuts (`shortcutFor`) wherever focus is on the page. */
export function useShortcuts(run: (shortcut: Shortcut) => void): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const shortcut = shortcutFor({
      key: event.key,
      modified: event.ctrlKey || event.metaKey || event.altKey,
      repeat: event.repeat,
      owner: keyOwnerOf(event.target),
    });
    if (!shortcut) return;
    // Space would scroll the page and arrows would scroll the boards.
    event.preventDefault();
    run(shortcut);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
