/**
 * Small helpers for writing lanes in TypeScript: the lane syntax stays the
 * single source of truth, these only assemble strings.
 */

/** Joins bars into one lane: `bars('C4 . . .', 'E4 . . .')` is `'C4 . . . | E4 . . .'`. */
export function bars(...lanes: readonly string[]): string {
  return lanes.join(' | ');
}

/** A lane repeated end to end. */
export function repeat(lane: string, times: number): string {
  return bars(...Array.from({ length: times }, () => lane));
}

/** `count` bars of silence (each bar a single hold). */
export function rest(count: number): string {
  return repeat('-', count);
}

const PLACEHOLDER = /^(~?)([a-z]\w*)((?:\[[0-9a-f]+\])?(?::\d)?)$/;

/**
 * Fills a rhythm template with notes: lowercase placeholders are replaced by
 * the mapped note, keeping any slide, interval or velocity marks; every other
 * token (`.`, `-`, literal notes) passes through.
 *
 *   fill('r . o r . r:5 o .', { r: 'F2', o: 'F3' })  // 'F2 . F3 F2 . F2:5 F3 .'
 */
export function fill(template: string, notes: Readonly<Record<string, string>>): string {
  return template
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === '|') return token;
      const match = PLACEHOLDER.exec(token);
      const mapped = match ? notes[match[2] ?? ''] : undefined;
      return match && mapped !== undefined ? `${match[1]}${mapped}${match[3]}` : token;
    })
    .join(' ');
}
