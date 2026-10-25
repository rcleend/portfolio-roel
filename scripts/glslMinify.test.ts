// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the cases are module source text with `${…}` in it.
import { readFileSync } from 'node:fs';
import { ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { minifyGlsl, minifyGlslLiterals, minifyThreeShaders } from './glslMinify';

describe('minifyGlsl', () => {
  it('drops comments and indentation but keeps every line break', () => {
    const glsl = '\n  // the lamp\n  float a = 1.0;   // trailing\n  /* one\n     two */\n  vec3  b = vec3( a );\n';
    expect(minifyGlsl(glsl)).toBe('\n\nfloat a = 1.0;\n\n\nvec3 b = vec3(a);\n');
    expect(minifyGlsl(glsl).split('\n')).toHaveLength(glsl.split('\n').length);
  });

  it('keeps preprocessor lines readable to three.js and an inline block comment as a space', () => {
    expect(minifyGlsl('  #include <common>\n#define  PI 3.14 // pi\nfloat/**/x;')).toBe(
      '#include <common>\n#define PI 3.14\nfloat x;',
    );
  });

  it('drops the spaces inside brackets and before a comma or semicolon, never before an opening bracket', () => {
    expect(minifyGlsl('#define F( a, b ) ( a + b )\nv = m[ i ] * F( x , y ) ;\nif ( a ) {')).toBe(
      '#define F(a,b) (a + b)\nv = m[i] * F(x,y);\nif (a) {',
    );
  });

  it('reads the comment that starts first', () => {
    expect(minifyGlsl('a; // see /* here\nb; /* // */ c;')).toBe('a;\nb; c;');
  });
});

describe('minifyGlslLiterals', () => {
  it('minifies only marked literals and copies interpolations verbatim', () => {
    const source = [
      'const plain = `  keep   me  `;',
      'const shader = /* glsl */ `',
      '  // header',
      '  const vec3 C = ${vec3(DISC_LIGHT.ambient, { digits:  4 })};',
      '  float f = ${x.toFixed(4)};',
      '`;',
    ].join('\n');
    expect(minifyGlslLiterals(source)).toBe(
      [
        'const plain = `  keep   me  `;',
        'const shader = /* glsl */ `',
        '',
        'const vec3 C = ${vec3(DISC_LIGHT.ambient, { digits:  4 })};',
        'float f = ${x.toFixed(4)};',
        '`;',
      ].join('\n'),
    );
  });

  it('refuses what it cannot read safely', () => {
    expect(() => minifyGlslLiterals('/* glsl */ `float a;')).toThrow(/unterminated literal/);
    expect(() => minifyGlslLiterals('/* glsl */ `${`x`}`')).toThrow(/inside an interpolation/);
    expect(() => minifyGlslLiterals('/* glsl */ `// ${a}\n`')).toThrow(/inside a comment/);
  });
});

/** One line of GLSL as tokens: what minifying must keep (comments aside). */
const TOKEN =
  /[A-Za-z_]\w*|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|\$\{|\S/g;
function tokenLines(glsl: string): string[][] {
  return glsl
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, '').match(TOKEN) ?? []);
}
/** Whether each `#define` line defines a function-like macro: `NAME(` with no space between. */
function macroKinds(glsl: string): boolean[] {
  return glsl
    .split('\n')
    .filter((line) => line.trim().startsWith('#define'))
    .map((line) => /^#define\s+\w+\(/.test(line.trim()));
}
function expectSameShader(minified: string, original: string): void {
  expect(tokenLines(minified)).toEqual(tokenLines(original));
  expect(macroKinds(minified)).toEqual(macroKinds(original));
}

describe('minifyThreeShaders', () => {
  const build = (file: string) => readFileSync(new URL(`../node_modules/three/build/${file}`, import.meta.url), 'utf8');
  const chunks = (source: string) =>
    new Map(
      [...source.matchAll(/^var (\w+) = (".*");$/gm)].map(([, name = '', text = '']): [string, string] => [
        name,
        JSON.parse(text),
      ]),
    );
  const inline = (source: string) =>
    source
      .split('/* glsl */`')
      .slice(1)
      .map((rest) => rest.slice(0, rest.indexOf('`')));

  it.each(['three.module.js', 'three.core.js'])('keeps every token of %s’s shaders', (file) => {
    const original = build(file);
    const minified = minifyThreeShaders(original);
    expect(minified.split('\n')).toHaveLength(original.split('\n').length);
    const before = chunks(original);
    const after = chunks(minified);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [name, text] of before) expectSameShader(after.get(name) ?? '', text);
    const literals = inline(original);
    expect(inline(minified)).toHaveLength(literals.length);
    inline(minified).forEach((text, i) => {
      expectSameShader(text, literals[i] ?? '');
    });
    expect(minified.length).toBeLessThan(original.length);
  });

  it('minifies only ShaderChunk text', () => {
    const names = new Set(Object.keys(ShaderChunk));
    const module = [...chunks(build('three.module.js')).keys()];
    expect(module.length).toBeGreaterThan(100);
    expect(module.filter((name) => !names.has(name))).toEqual([]);
    expect([...chunks(build('three.core.js')).keys()]).toEqual(['default_vertex', 'default_fragment']);
  });

  it('refuses a chunk it cannot read as JSON', () => {
    expect(() => minifyThreeShaders('var a = "\\x41";')).toThrow(SyntaxError);
  });
});
