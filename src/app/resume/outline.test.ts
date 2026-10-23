import { describe, expect, it } from 'vitest';
import { education, experience, profile, publications } from '@/content';
import { formatDateRange, keepsWithNext, resumeOutline } from './outline';

describe('resumeOutline', () => {
  const blocks = resumeOutline();

  it('orders the header, summary and the three sections like a CV', () => {
    expect(blocks.map((block) => (block.kind === 'heading' ? block.title : block.kind))).toEqual([
      'header',
      'summary',
      'Experience',
      ...experience.map(() => 'job'),
      'Education',
      ...education.map(() => 'education'),
      'Publications',
      ...publications.map(() => 'publication'),
    ]);
  });

  it('carries the profile and every job, entry and publication from the content', () => {
    expect(blocks[0]).toMatchObject({
      kind: 'header',
      name: profile.name,
      headline: profile.headline,
      location: profile.location,
      links: profile.links,
    });
    expect(blocks[1]).toEqual({ kind: 'summary', key: 'summary', text: profile.summary });
    const jobs = blocks.filter((block) => block.kind === 'job');
    expect(jobs.map((job) => job.role)).toEqual(experience.map((job) => job.role));
    expect(jobs[0]?.highlights).toEqual(experience[0]?.highlights.map((highlight) => highlight.description));
    expect(jobs[0]?.stack).toEqual(experience[0]?.stack);
    const entries = blocks.filter((block) => block.kind === 'education');
    expect(entries.map((entry) => entry.institution)).toEqual(education.map((entry) => entry.institution));
    expect(entries[1]).toMatchObject({ location: null, detail: null });
  });

  it('leaves the arcade-only material out of the PDF', () => {
    const text = JSON.stringify(blocks);
    expect(text).not.toContain('CREDITS');
    expect(text).not.toMatch(/"metric"|"title":"[A-Z ]+"/);
  });

  it('gives every block a unique key', () => {
    expect(new Set(blocks.map((block) => block.key)).size).toBe(blocks.length);
  });

  it('keeps only headings with the block after them', () => {
    expect(blocks.filter(keepsWithNext).every((block) => block.kind === 'heading')).toBe(true);
    expect(blocks.filter(keepsWithNext)).toHaveLength(3);
  });
});

describe('formatDateRange', () => {
  it('formats finished and current roles', () => {
    expect(formatDateRange('2022-04', '2024-10')).toBe('Apr 2022 – Oct 2024');
    expect(formatDateRange('2024-10', null)).toBe('Oct 2024 – present');
  });
});
