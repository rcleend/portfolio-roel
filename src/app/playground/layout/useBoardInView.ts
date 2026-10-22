import { useEffect, useState } from 'react';
import type { Board } from '../boards/board';

/**
 * The board the visitor is looking at: the first, in page order, that
 * reaches into the upper half of the window. The digit shortcuts and the
 * transport follow it. Boards are found by their section's id, the board id.
 */
export function useBoardInView(boards: readonly Board[]): Board | null {
  const [inView, setInView] = useState<Board | null>(boards[0] ?? null);
  useEffect(() => {
    const showing = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) showing.set(record.target.id, record.isIntersecting);
        const first = boards.find((board) => showing.get(board.id));
        if (first) setInView(first);
      },
      { rootMargin: '0px 0px -50% 0px' },
    );
    for (const board of boards) {
      const section = document.getElementById(board.id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [boards]);
  return inView;
}
