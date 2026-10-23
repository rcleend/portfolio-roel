/**
 * Text metrics shared by the still painter and the DOM desktop, so a label
 * sits on the same baseline and breaks into the same lines in both.
 */

/**
 * The alphabetic baseline's offset from the top of a CSS line box of height
 * `lineHeight`: CSS centres the font's ascent + descent in the line
 * (half-leading). `ascent` and `descent` are the font's bounding box
 * metrics, `measureText(...).fontBoundingBoxAscent/Descent`.
 */
export function baselineInLineBox(lineHeight: number, ascent: number, descent: number): number {
  return (lineHeight - (ascent + descent)) / 2 + ascent;
}

const ELLIPSIS = '…';

/**
 * Breaks `text` into at most `maxLines` lines no wider than `maxWidth`, the
 * way an icon label wraps: at spaces, with an ellipsis on a word wider than a
 * line and on the last line when the text does not fit.
 * `measure` returns the advance width of a string in the label's font.
 */
export function wrapLabel(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (text: string) => number,
): readonly string[] {
  const lines: string[] = [];
  let words = text.split(/\s+/).filter(Boolean);
  while (words.length > 0) {
    if (lines.length === maxLines - 1) {
      lines.push(ellipsize(words.join(' '), maxWidth, measure));
      break;
    }
    let line = '';
    let count = 0;
    for (const word of words) {
      const candidate = count === 0 ? word : `${line} ${word}`;
      if (measure(candidate) > maxWidth) break;
      line = candidate;
      count++;
    }
    // A single word wider than the line keeps a line of its own, cut with an ellipsis.
    lines.push(count === 0 ? ellipsize(words[0] as string, maxWidth, measure) : line);
    words = words.slice(Math.max(1, count));
  }
  return lines;
}

function ellipsize(text: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && measure(`${text.slice(0, end).trimEnd()}${ELLIPSIS}`) > maxWidth) end--;
  return `${text.slice(0, end).trimEnd()}${ELLIPSIS}`;
}
