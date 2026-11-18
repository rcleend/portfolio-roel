import { describe, expect, it } from 'vitest';
import { profile, publications, socials } from '@/content';
import { cv } from './render';

describe('the résumé page of a visitor without a GPU', () => {
  it('is the résumé as the page: shown, with one heading at the top and nothing to press', () => {
    expect(cv.html).toMatch(/^<main id="resume" class="resume resume--page"/);
    expect(cv.html).not.toContain('tabindex');
    expect(cv.html.match(/<h1/g)).toHaveLength(1);
    expect(cv.html).toContain(`>${profile.name}</h1>`);
    expect(cv.title).toContain(profile.name);
  });

  it('offers no way to a game or a room that is not there', () => {
    expect(cv.html).not.toContain('<nav');
    expect(cv.html).not.toContain('<button');
    expect(cv.html).not.toMatch(/back to the game|explore the room|#game/i);
  });

  it('leads to everything the room and the game lead to', () => {
    const everywhere = [...profile.links, ...socials, ...publications].map((link) => link.href);
    expect(everywhere).toContain('https://x.com/LeendersRoel');
    for (const href of everywhere) expect(cv.html).toContain(`href="${href}"`);
    // Each once: the room's overview repeats the résumé's own links, and the page does not.
    for (const social of socials) expect(cv.html.split(`<a href="${social.href}"`)).toHaveLength(2);
  });
});
