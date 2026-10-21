/**
 * Pure text layout: no canvas, so it is fully unit-testable and shared by
 * every font type.
 */

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Greedy word wrap. Explicit `\n` always breaks; runs of spaces collapse to
 * one; a single word wider than `maxWidth` is split between characters
 * rather than overflowing the box.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ').filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      for (const piece of breakWord(word, maxWidth, measure)) {
        if (line) lines.push(line);
        line = piece;
      }
    }
    lines.push(line);
  }
  return lines;
}

function breakWord(word: string, maxWidth: number, measure: (s: string) => number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const char of word) {
    if (piece && measure(piece + char) > maxWidth) {
      pieces.push(piece);
      piece = '';
    }
    piece += char;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/** Left edge of a line of `width` pixels aligned at anchor `x`, snapped so centred text never lands on half pixels. */
export function alignedX(x: number, width: number, align: TextAlign): number {
  if (align === 'center') return x - Math.floor(width / 2);
  if (align === 'right') return x - width;
  return x;
}
