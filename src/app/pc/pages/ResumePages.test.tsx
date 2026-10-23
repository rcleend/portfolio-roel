// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { education, experience, profile, publications } from '@/content';
import { resumeOutline } from '../../resume/outline';
import { Resume } from '../../resume/Resume';
import { ResumePages } from './ResumePages';

/** The rendered text and link targets of some markup. */
function read(markup: string): { readonly text: string; readonly hrefs: readonly string[] } {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return {
    text: host.textContent ?? '',
    hrefs: Array.from(host.querySelectorAll('a'), (link) => link.getAttribute('href') ?? ''),
  };
}

const blocks = resumeOutline();
const renderings = {
  'the semantic résumé': read(renderToStaticMarkup(<Resume />)),
  'the PDF pages': read(
    renderToStaticMarkup(<ResumePages blocks={blocks} pages={[blocks.map((_, index) => index)]} layout="a4" />),
  ),
  'the reflowed pages': read(
    renderToStaticMarkup(<ResumePages blocks={blocks} pages={[blocks.map((_, index) => index)]} layout="reflow" />),
  ),
};

describe.each(Object.entries(renderings))('%s', (_, { text, hrefs }) => {
  it('carries every highlight of every job', () => {
    for (const job of experience) {
      expect(text).toContain(job.role);
      for (const highlight of job.highlights) expect(text).toContain(highlight.description);
    }
  });

  it('links every profile link and publication', () => {
    for (const link of profile.links) expect(hrefs).toContain(link.href);
    for (const publication of publications) expect(hrefs).toContain(publication.href);
  });

  it('names every degree, institution and publication', () => {
    for (const entry of education) {
      expect(text).toContain(entry.degree);
      expect(text).toContain(entry.institution);
    }
    for (const publication of publications) expect(text).toContain(publication.title);
  });
});

describe('ResumePages', () => {
  it('puts a running footer with the page number on every page', () => {
    const markup = renderToStaticMarkup(
      <ResumePages
        blocks={blocks}
        pages={[
          [0, 1],
          [2, 3],
        ]}
        layout="a4"
      />,
    );
    const host = document.createElement('div');
    host.innerHTML = markup;
    const footers = Array.from(host.querySelectorAll('.pc-page__footer'), (footer) => footer.textContent);
    expect(footers).toEqual(['Roel Leenders — Résumé1 / 2', 'Roel Leenders — Résumé2 / 2']);
    expect(host.querySelector('.pc-page__footer')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens web links in a new tab without a way back, and mail in place', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<ResumePages blocks={blocks} pages={[[0]]} layout="a4" />);
    for (const link of host.querySelectorAll('a')) {
      const web = link.getAttribute('href')?.startsWith('https:');
      expect(link.getAttribute('target')).toBe(web ? '_blank' : null);
      expect(link.getAttribute('rel')).toBe(web ? 'noopener' : null);
    }
  });

  it('never reuses the semantic résumé’s ids', () => {
    const markup = renderToStaticMarkup(
      <ResumePages blocks={blocks} pages={[blocks.map((_, index) => index)]} layout="a4" />,
    );
    expect(markup).not.toMatch(/id="(resume-name|job-)/);
  });
});
