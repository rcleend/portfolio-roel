import type { Board } from './board';
import { customersBoard } from './customers';
import { characterBoard, customerBoard, skillBoard } from './looks';
import { roelsBoard } from './roels';
import type { Subject } from './subject';
import { backdropBoard, lockupBoard } from './title';

/** Every board on the playground, in page order. */
export const PLAYGROUND_BOARDS: readonly Board[] = [
  lockupBoard,
  backdropBoard,
  characterBoard,
  roelsBoard,
  skillBoard,
  customerBoard,
  customersBoard,
];

/** The subjects `boards` show, each once, in page order: everything focus mode can show. */
export function subjectsOf(boards: readonly Board[]): readonly Subject[] {
  return [...new Set(boards.flatMap((board) => board.rows.map((row) => row.subject)))];
}
