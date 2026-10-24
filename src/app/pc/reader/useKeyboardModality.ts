import { useEffect, useState } from 'react';

/**
 * Whether the visitor's last input, anywhere on the page, was a key rather than a pointer. The
 * document pane takes focus from a script as the reader opens, and Chrome's `:focus-visible`
 * matches such a focus whenever an earlier one did (the page's own opening focus on the stage
 * does), so the pane's ring would show to mouse and touch users too; it shows only with this.
 */
export function useKeyboardModality(): boolean {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const onKey = (): void => setKeyboard(true);
    const onPointer = (): void => setKeyboard(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  return keyboard;
}
