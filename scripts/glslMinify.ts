import type { Plugin } from 'vite';

/** The mark that makes a template literal GLSL: `/* glsl *\/ \`…\``. */
export const GLSL_MARK = '/* glsl */ `';

/** Stands in for a `${…}` interpolation while the text around it is minified; never valid GLSL. */
const HOLE = '\u0000';

/**
 * GLSL as the GPU reads it: comments gone (a block comment keeps its line breaks, or becomes the one space it stands
 * for), every line trimmed and its runs of whitespace collapsed to one space. Line breaks stay, so preprocessor lines
 * (`#include <…>`, `#define`) keep their meaning and the lines of the module around the shader do not move.
 */
export function minifyGlsl(glsl: string): string {
  return glsl
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
      comment.startsWith('//') ? '' : comment.includes('\n') ? comment.replace(/[^\n]/g, '') : ' ',
    )
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join('\n');
}

/**
 * Minifies the text of every template literal marked `/* glsl *\/` in a module's source and copies its `${…}`
 * interpolations as they are. Throws on what it cannot read safely: an unterminated literal, a template literal
 * inside an interpolation or an interpolation inside a comment.
 */
export function minifyGlslLiterals(source: string): string {
  let out = '';
  let copied = 0;
  for (let mark = source.indexOf(GLSL_MARK); mark !== -1; mark = source.indexOf(GLSL_MARK, copied)) {
    let at = mark + GLSL_MARK.length;
    let text = '';
    const holes: string[] = [];
    while (source[at] !== '`') {
      if (at >= source.length) throw new Error(`glsl: unterminated literal at ${mark}`);
      if (source[at] === '\\') {
        text += source.slice(at, at + 2);
        at += 2;
      } else if (source.startsWith('${', at)) {
        const end = interpolationEnd(source, at, mark);
        holes.push(source.slice(at, end));
        text += HOLE;
        at = end;
      } else {
        text += source[at++];
      }
    }
    const pieces = minifyGlsl(text).split(HOLE);
    if (pieces.length !== holes.length + 1) throw new Error(`glsl: interpolation inside a comment at ${mark}`);
    out +=
      source.slice(copied, mark + GLSL_MARK.length) + pieces.map((piece, i) => (holes[i - 1] ?? '') + piece).join('');
    copied = at;
  }
  return out + source.slice(copied);
}

/** The index just past the `}` that closes the interpolation opening at `at`. */
function interpolationEnd(source: string, at: number, mark: number): number {
  let depth = 0;
  for (let i = at + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '`') throw new Error(`glsl: template literal inside an interpolation at ${mark}`);
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  throw new Error(`glsl: unterminated interpolation at ${mark}`);
}

/**
 * Ships the app's shaders without their comments and indentation (docs/ARCHITECTURE.md › Quality bar). Runs before the
 * TypeScript transform, in the dev server, the tests and the build alike, so what is tested is what ships; lines do
 * not move, so the existing source maps stay true.
 */
export function glslMinifyPlugin(): Plugin {
  return {
    name: 'glsl-minify',
    enforce: 'pre',
    transform: {
      filter: { id: /\/src\/.+\.tsx?$/, code: GLSL_MARK },
      handler: (code) => ({ code: minifyGlslLiterals(code), map: null }),
    },
  };
}
