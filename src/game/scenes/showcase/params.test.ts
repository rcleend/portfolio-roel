import { describe, expect, it } from 'vitest';
import { CUSTOMER_DEMO, MOVES_DEMO } from './demos';
import { resolveShowcase, ShowcaseParamsError } from './params';

describe('resolveShowcase', () => {
  it("plays Hackerman's moves in Berlin unless asked otherwise", () => {
    expect(resolveShowcase(undefined)).toEqual({ demo: MOVES_DEMO, hero: 'hackerman', levelId: 'scripe' });
    expect(resolveShowcase({ demo: 'customer', levelId: 'luna' })).toEqual({
      demo: CUSTOMER_DEMO,
      hero: 'hackerman',
      levelId: 'luna',
    });
  });

  it('casts a skill with its owner, from the slot it sits in', () => {
    const showcase = resolveShowcase({ demo: 'skill', skill: 'power-chord' });
    expect(showcase.hero).toBe('artsy');
    expect(showcase.demo.beats[0]).toMatchObject({ press: 'skill2' });
    expect(resolveShowcase({ demo: 'skill', skill: 'ux-elixir', hero: 'artsy' }).demo.beats[0]).toMatchObject({
      press: 'skill1',
    });
  });

  it.each([
    [{ demo: 'dance' }, 'showcase: demo must be one of moves, skill, customer, got "dance"'],
    [{ hero: 'roel' }, 'showcase: hero must be one of hackerman, artsy, strategy, got "roel"'],
    [{ demo: 'skill' }, 'showcase: skill must be one of full-stack-attack, agent-summon, ux-elixir, power-chord'],
    [
      { demo: 'skill', skill: 'power-chord', hero: 'hackerman' },
      `showcase: "power-chord" is artsy's skill, not hackerman's`,
    ],
    [{ levelId: 'mars' }, 'showcase: levelId must be one of luna, scripe, got "mars"'],
  ])('rejects %j', (params, message) => {
    expect(() => resolveShowcase(params as never)).toThrow(message);
    expect(() => resolveShowcase(params as never)).toThrow(ShowcaseParamsError);
  });
});
