// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the cases are module source text with `${…}` in it.
import { describe, expect, it } from 'vitest';
import { minifyGlsl, minifyGlslLiterals } from './glslMinify';

describe('minifyGlsl', () => {
  it('drops comments and indentation but keeps every line break', () => {
    const glsl = '\n  // the lamp\n  float a = 1.0;   // trailing\n  /* one\n     two */\n  vec3  b = vec3( a );\n';
    expect(minifyGlsl(glsl)).toBe('\n\nfloat a = 1.0;\n\n\nvec3 b = vec3( a );\n');
    expect(minifyGlsl(glsl).split('\n')).toHaveLength(glsl.split('\n').length);
  });

  it('keeps preprocessor lines readable to three.js and an inline block comment as a space', () => {
    expect(minifyGlsl('  #include <common>\n#define  PI 3.14 // pi\nfloat/**/x;')).toBe(
      '#include <common>\n#define PI 3.14\nfloat x;',
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
