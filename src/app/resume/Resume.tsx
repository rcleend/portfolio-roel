import { type Experience, education, experience, profile, publications } from '@/content';
import './Resume.css';

/**
 * The same portfolio as semantic HTML, always in the DOM: for screen readers,
 * search engines and visitors who would rather read than play. Visually
 * hidden until it is targeted by the skip link or receives focus.
 */
export function Resume() {
  return (
    <main id="resume" className="resume" tabIndex={-1} aria-labelledby="resume-name">
      <a className="resume__back" href="#game">
        Back to the game
      </a>
      <header>
        <h1 id="resume-name">{profile.name}</h1>
        <p className="resume__headline">
          {profile.headline} · {profile.location}
        </p>
        <p>{profile.summary}</p>
        <ul className="resume__links">
          {profile.links.map((link) => (
            <li key={link.kind}>
              <a href={link.href} rel={link.kind === 'email' ? undefined : 'me noopener'}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="resume-experience">
        <h2 id="resume-experience">Experience</h2>
        {experience.map((job) => (
          <ExperienceEntry key={job.id} job={job} />
        ))}
      </section>

      <section aria-labelledby="resume-education">
        <h2 id="resume-education">Education</h2>
        <ul>
          {education.map((entry) => (
            <li key={entry.degree}>
              <strong>{entry.degree}</strong>, {entry.institution}
              {entry.location ? `, ${entry.location}` : ''}
              {entry.detail ? <p>{entry.detail}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="resume-publications">
        <h2 id="resume-publications">Publications</h2>
        <ul>
          {publications.map((publication) => (
            <li key={publication.href}>
              <a href={publication.href}>{publication.title}</a>. {publication.citation}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function ExperienceEntry({ job }: { readonly job: Experience }) {
  return (
    <article aria-labelledby={`job-${job.id}`}>
      <h3 id={`job-${job.id}`}>
        {job.role}, {job.company}
      </h3>
      <p className="resume__meta">
        <time dateTime={job.start}>{formatMonth(job.start)}</time> –{' '}
        {job.end ? <time dateTime={job.end}>{formatMonth(job.end)}</time> : 'present'} · {job.location} · {job.context}
      </p>
      <ul>
        {job.highlights.map((highlight) => (
          <li key={highlight.id}>{highlight.description}</li>
        ))}
      </ul>
      <p className="resume__stack">Stack: {job.stack.join(', ')}</p>
    </article>
  );
}

const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2024-10" → "Oct 2024". */
export function formatMonth(isoYearMonth: string): string {
  return MONTH.format(new Date(`${isoYearMonth}-01T00:00:00Z`));
}
