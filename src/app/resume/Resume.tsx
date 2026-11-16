import { type Experience, education, experience, type Metric, nextLevelTeaser, profile, publications } from '@/content';
import { formatMonth, sentenceCase } from './format';
import './Resume.css';

/**
 * The same portfolio as semantic HTML, always in the DOM: for screen readers,
 * search engines and visitors who would rather read than play. Visually
 * hidden until it is targeted by the skip link or receives focus, then shown
 * as a typeset page with a light arcade accent.
 */
export function Resume() {
  return (
    <main id="resume" className="resume" tabIndex={-1} aria-labelledby="resume-name">
      <div className="resume__page">
        <nav className="resume__nav" aria-label="Résumé">
          <button type="button" className="resume__back" onClick={backToGame}>
            <span aria-hidden="true">◂ </span>Back to the game
          </button>
        </nav>

        <header className="resume__header">
          <p className="resume__kicker">Player 1</p>
          <h1 id="resume-name">{profile.name}</h1>
          <p className="resume__headline">
            {profile.headline} <span aria-hidden="true">·</span> {profile.location}
          </p>
          <p className="resume__summary">{profile.summary}</p>
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
          <ul className="resume__plain">
            {education.map((entry) => (
              <li key={entry.degree}>
                <strong>{entry.degree}</strong>, {entry.institution}
                {entry.location ? `, ${entry.location}` : ''}
                {entry.detail ? <p className="resume__detail">{entry.detail}</p> : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="resume-publications">
          <h2 id="resume-publications">Publications</h2>
          <ul className="resume__plain">
            {publications.map((publication) => (
              <li key={publication.href}>
                <a href={publication.href}>{publication.title}</a>. {publication.citation}
              </li>
            ))}
          </ul>
        </section>

        <aside className="resume__next" aria-labelledby="resume-next">
          <p className="resume__kicker">{nextLevelTeaser.mission}</p>
          <h2 id="resume-next">{sentenceCase(nextLevelTeaser.title)}</h2>
          <p>{nextLevelTeaser.body}</p>
          <a className="resume__cta" href={nextLevelTeaser.cta.href}>
            {nextLevelTeaser.cta.label}
          </a>
        </aside>

        <footer className="resume__footer">
          <a href={`${import.meta.env.BASE_URL}CREDITS.txt`}>3D room credits</a>
        </footer>
      </div>
    </main>
  );
}

function ExperienceEntry({ job }: { readonly job: Experience }) {
  return (
    <article className="resume__job" aria-labelledby={`job-${job.id}`}>
      <h3 id={`job-${job.id}`}>
        {job.role}, {job.company}
      </h3>
      <p className="resume__meta">
        <time dateTime={job.start}>{formatMonth(job.start)}</time> –{' '}
        {job.end ? <time dateTime={job.end}>{formatMonth(job.end)}</time> : 'present'} · {job.location} · {job.context}
      </p>
      <ul className="resume__highlights">
        {job.highlights.map((highlight) => (
          <li key={highlight.id}>
            {highlight.description}
            {highlight.metric ? <MetricBadge metric={highlight.metric} /> : null}
          </li>
        ))}
      </ul>
      <ul className="resume__stack" aria-label="Stack">
        {job.stack.map((tool) => (
          <li key={tool}>{tool}</li>
        ))}
      </ul>
    </article>
  );
}

function MetricBadge({ metric }: { readonly metric: Metric }) {
  return (
    <span className="resume__metric">
      {metric.from ? (
        <>
          {metric.from} <span aria-hidden="true">→</span>
          <span className="resume__sr"> to</span>{' '}
        </>
      ) : null}
      <strong>{metric.to}</strong> {metric.label}
    </span>
  );
}

/** Leaving the résumé hands keyboard focus straight back to the game, so the next key press plays. */
function backToGame(): void {
  // A real fragment navigation, so :target leaves the résumé (replaceState would not update it).
  window.location.hash = 'game';
  // Moving focus out also ends :focus-within; without a stage (the game failed) the page itself takes it.
  const stage = document.querySelector<HTMLElement>('#game [role="application"]');
  if (stage) stage.focus({ preventScroll: true });
  else (document.activeElement as HTMLElement | null)?.blur();
}
