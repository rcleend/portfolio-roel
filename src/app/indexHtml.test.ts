import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profile } from '@/content';

/**
 * index.html carries a static copy of the essentials for crawlers, link
 * previews and visitors without JavaScript. These checks keep it in step with
 * src/content, the single source of truth.
 */
const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');

function jsonLd(): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error('index.html has no JSON-LD block');
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function noscript(): string {
  return /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? '';
}

describe('index.html', () => {
  it('describes the person in JSON-LD with the profile links', () => {
    const person = jsonLd();
    expect(person['@type']).toBe('Person');
    expect(person.name).toBe(profile.name);
    expect(person.jobTitle).toBe(profile.headline);
    const email = profile.links.find((link) => link.kind === 'email');
    expect(person.email).toBe(email?.href);
    const social = profile.links.filter((link) => link.kind !== 'email').map((link) => link.href);
    expect(person.sameAs).toEqual(social);
  });

  it('gives visitors without JavaScript the name and every contact link', () => {
    const fallback = noscript();
    expect(fallback).toContain(profile.name);
    expect(fallback).toContain(profile.headline);
    for (const link of profile.links) expect(fallback).toContain(`href="${link.href}"`);
  });

  it('has the social and browser metadata', () => {
    for (const tag of [
      'name="description"',
      'name="theme-color"',
      'property="og:title"',
      'property="og:image"',
      'name="twitter:card"',
      'rel="icon" href="/favicon.svg"',
    ]) {
      expect(html).toContain(tag);
    }
  });

  it('points the canonical address and the link previews at the production origin, on a preview file that exists', () => {
    expect(html).toContain('<link rel="canonical" href="https://roel.work/" />');
    expect(html).toContain('<meta property="og:url" content="https://roel.work/" />');
    const image = /<meta property="og:image" content="https:\/\/roel\.work\/([^"]+)"/.exec(html)?.[1];
    expect(image).toBeDefined();
    expect(existsSync(resolve(import.meta.dirname, '../../public', image ?? ''))).toBe(true);
    expect(html).toContain(`<meta name="twitter:image" content="https://roel.work/${image}" />`);
    expect(html).not.toContain('vercel.app');
  });
});
