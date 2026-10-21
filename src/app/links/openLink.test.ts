import { describe, expect, it } from 'vitest';
import { type LinkEnvironment, openLink } from './openLink';

function environment(): LinkEnvironment & { readonly navigated: string[]; readonly opened: string[] } {
  const navigated: string[] = [];
  const opened: string[] = [];
  return {
    baseUrl: 'https://roel.example/',
    navigated,
    opened,
    navigate: (href) => navigated.push(href),
    openTab: (href) => opened.push(href),
  };
}

describe('openLink', () => {
  it('hands mailto links to the mail client in the same tab', () => {
    const env = environment();
    expect(openLink('mailto:rcleende@gmail.com', env)).toBe(true);
    expect(env.navigated).toEqual(['mailto:rcleende@gmail.com']);
    expect(env.opened).toEqual([]);
  });

  it('opens https links in a new tab', () => {
    const env = environment();
    expect(openLink('https://github.com/rcleend', env)).toBe(true);
    expect(env.opened).toEqual(['https://github.com/rcleend']);
    expect(env.navigated).toEqual([]);
  });

  it.each(['javascript:alert(1)', 'http://insecure.example', 'data:text/html,hi', 'ftp://x', 'http://[bad'])(
    'refuses %s',
    (href) => {
      const env = environment();
      expect(openLink(href, env)).toBe(false);
      expect([...env.navigated, ...env.opened]).toEqual([]);
    },
  );
});
