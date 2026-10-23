import {
  type Education,
  type Experience,
  education,
  experience,
  type Profile,
  type ProfileLink,
  type Publication,
  profile,
  publications,
} from '@/content';
import { formatMonth } from './format';

/**
 * The résumé as an ordered list of typeset blocks: what the computer's
 * document reader paginates and prints on its A4 pages. It is built from
 * `@/content` like the semantic résumé, so the two can never disagree; it
 * leaves out what only belongs to the arcade (the next-level teaser, metric
 * badges whose numbers the descriptions already state, asset credits).
 */
export type ResumeBlock = HeaderBlock | SummaryBlock | HeadingBlock | JobBlock | EducationBlock | PublicationBlock;

export interface HeaderBlock {
  readonly kind: 'header';
  readonly key: string;
  readonly name: string;
  readonly headline: string;
  readonly location: string;
  readonly links: readonly ProfileLink[];
}

export interface SummaryBlock {
  readonly kind: 'summary';
  readonly key: string;
  readonly text: string;
}

export interface HeadingBlock {
  readonly kind: 'heading';
  readonly key: string;
  readonly title: 'Experience' | 'Education' | 'Publications';
}

export interface JobBlock {
  readonly kind: 'job';
  readonly key: string;
  readonly role: string;
  readonly company: string;
  /** "Oct 2024 – present". */
  readonly dates: string;
  readonly context: string;
  readonly location: string;
  readonly highlights: readonly string[];
  readonly stack: readonly string[];
}

export interface EducationBlock {
  readonly kind: 'education';
  readonly key: string;
  readonly degree: string;
  readonly institution: string;
  readonly location: string | null;
  readonly detail: string | null;
}

export interface PublicationBlock {
  readonly kind: 'publication';
  readonly key: string;
  readonly title: string;
  readonly citation: string;
  readonly href: string;
}

export interface ResumeSource {
  readonly profile: Profile;
  readonly experience: readonly Experience[];
  readonly education: readonly Education[];
  readonly publications: readonly Publication[];
}

const CONTENT: ResumeSource = { profile, experience, education, publications };

export function resumeOutline(source: ResumeSource = CONTENT): readonly ResumeBlock[] {
  return [
    {
      kind: 'header',
      key: 'header',
      name: source.profile.name,
      headline: source.profile.headline,
      location: source.profile.location,
      links: source.profile.links,
    },
    { kind: 'summary', key: 'summary', text: source.profile.summary },
    { kind: 'heading', key: 'heading-experience', title: 'Experience' },
    ...source.experience.map(
      (job): JobBlock => ({
        kind: 'job',
        key: `job-${job.id}`,
        role: job.role,
        company: job.company,
        dates: formatDateRange(job.start, job.end),
        context: job.context,
        location: job.location,
        highlights: job.highlights.map((highlight) => highlight.description),
        stack: job.stack,
      }),
    ),
    { kind: 'heading', key: 'heading-education', title: 'Education' },
    ...source.education.map(
      (entry): EducationBlock => ({
        kind: 'education',
        key: `education-${entry.degree}`,
        degree: entry.degree,
        institution: entry.institution,
        location: entry.location ?? null,
        detail: entry.detail ?? null,
      }),
    ),
    { kind: 'heading', key: 'heading-publications', title: 'Publications' },
    ...source.publications.map(
      (publication): PublicationBlock => ({
        kind: 'publication',
        key: `publication-${publication.href}`,
        title: publication.title,
        citation: publication.citation,
        href: publication.href,
      }),
    ),
  ];
}

/** A section heading never ends a page: it travels with the first entry under it. */
export function keepsWithNext(block: ResumeBlock): boolean {
  return block.kind === 'heading';
}

/** "2024-10", null → "Oct 2024 – present". */
export function formatDateRange(start: string, end: string | null): string {
  return `${formatMonth(start)} – ${end ? formatMonth(end) : 'present'}`;
}
