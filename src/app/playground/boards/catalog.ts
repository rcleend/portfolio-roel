import type { Board } from './board';
import type { Subject } from './subject';
import { backdropBoard, lockupBoard } from './title';

/** Every board on the playground, in page order. */
export const PLAYGROUND_BOARDS: readonly Board[] = [lockupBoard, backdropBoard];

/** The subjects `boards` show, each once, in page order: everything focus mode can show. */
export function subjectsOf(boards: readonly Board[]): readonly Subject[] {
  return [...new Set(boards.map((board) => board.subject))];
}
