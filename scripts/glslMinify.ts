import type { Plugin } from 'vite';

/** The mark that makes a template literal GLSL: `/* glsl *\/ \`…\``. */
export const GLSL_MARK = '/* glsl */ `';

/** Stands in for a `${…}` interpolation while the text around it is minified; never valid GLSL. */
const HOLE = '\u0000';

/**
 * GLSL as the GPU reads it: comments gone (a block comment keeps its line breaks, or becomes the one space it stands
 * for), every line trimmed and its runs of whitespace collapsed to one space, and no space left inside brackets or
 * before a comma or semicolon. Those are one-character tokens nothing can join, and a space before `(` stays, as
 * `#define NAME (…)` is not `#define NAME(…)`. Line breaks stay, so preprocessor lines (`#include <…>`, `#define`)
 * keep their meaning and the lines of the module around the shader do not move.
 */
export function minifyGlsl(glsl: string): string {
  return glsl
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
      comment.startsWith('//') ? '' : comment.includes('\n') ? comment.replace(/[^\n]/g, '') : ' ',
    )
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/([([,]) | (?=[)\],;])/g, '$1'),
    )
    .join('\n');
}

/**
 * Minifies the text of every template literal marked `/* glsl *\/` in a module's source and copies its `${…}`
 * interpolations as they are. Throws on what it cannot read safely: an unterminated literal, a template literal
 * inside an interpolation or an interpolation inside a comment. The mark is found as text, so a comment quoting it
 * the way this one does not (`*\/` escaped) would be read as a shader and most likely throw.
 */
export function minifyGlslLiterals(source: string, glslMark = GLSL_MARK): string {
  let out = '';
  let copied = 0;
  for (let mark = source.indexOf(glslMark); mark !== -1; mark = source.indexOf(glslMark, copied)) {
    let at = mark + glslMark.length;
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
      source.slice(copied, mark + glslMark.length) + pieces.map((piece, i) => (holes[i - 1] ?? '') + piece).join('');
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

/** three.js's builds hold its shader chunks as `var name = "…";` lines and mark its inline shaders without a space. */
const THREE_CHUNK = /^(var \w+ = )("(?:[^"\\\n]|\\.)*");$/gm;
const THREE_MARK = '/* glsl */`';

/**
 * Minifies three.js's own shaders in its build (three.module.js, three.core.js): its `ShaderChunk` strings and its
 * marked inline shaders, whose tab indentation would otherwise ship. A chunk that is not plain JSON string text
 * throws rather than being guessed at.
 */
export function minifyThreeShaders(source: string): string {
  const chunks = source.replace(
    THREE_CHUNK,
    (_, head: string, text: string) => `${head}${JSON.stringify(minifyGlsl(JSON.parse(text)))};`,
  );
  return minifyGlslLiterals(chunks, THREE_MARK);
}

/**
 * Ships the shaders without their comments and indentation (docs/ARCHITECTURE.md › Quality bar). The app's own run
 * before the TypeScript transform, in the dev server, the tests and the build alike, so what is tested is what
 * ships; lines do not move, so the existing source maps stay true. three.js's are minified as the build bundles
 * it (the dev server pre-bundles three.js untouched); scripts/glslMinify.test.ts proves every one of them keeps its
 * tokens.
 */
export function glslMinifyPlugin(): Plugin {
  return {
    name: 'glsl-minify',
    enforce: 'pre',
    transform: {
      filter: { id: /(\/src\/.+\.tsx?|\/node_modules\/three\/build\/three\.(module|core)\.js)$/ },
      handler: (code, id) =>
        id.endsWith('.js')
          ? { code: minifyThreeShaders(code), map: null }
          : code.includes(GLSL_MARK)
            ? { code: minifyGlslLiterals(code), map: null }
            : null,
    },
  };
}
