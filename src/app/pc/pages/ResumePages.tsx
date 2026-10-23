import { type CSSProperties, Fragment, type Ref } from 'react';
import type { ProfileLink } from '@/content';
import type { ResumeBlock } from '../../resume/outline';
import './ResumePages.css';

export interface ResumePagesProps {
  readonly blocks: readonly ResumeBlock[];
  /** Block indices per page, from `paginate`. */
  readonly pages: readonly (readonly number[])[];
  /** `a4`: fixed 794 × 1123 sheets for transform zoom; `reflow`: the same sheets re-typeset at the pane's width. */
  readonly layout: 'a4' | 'reflow';
  readonly style?: CSSProperties;
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * The résumé typeset as a PDF: A4 sheets with margins, a serif body, sans
 * headings and a running footer, built from the same outline as everything
 * else. In Reflow the same page groups become narrower sheets at 16 px.
 */
export function ResumePages({ blocks, pages, layout, style, ref }: ResumePagesProps) {
  return (
    <div ref={ref} className={`pc-doc pc-doc--${layout}`} style={style}>
      {pages.map((page, pageIndex) => (
        <div key={page[0] ?? pageIndex} className="pc-page" data-page={pageIndex + 1}>
          {page.map((index) => {
            const block = blocks[index];
            return block ? <ResumeBlockView key={block.key} block={block} /> : null;
          })}
          <div className="pc-page__footer" aria-hidden="true">
            <span>Roel Leenders — Résumé</span>
            <span>
              {pageIndex + 1} / {pages.length}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One block in its measuring box: `flow-root` keeps every margin inside, so measured heights add up exactly. */
export function ResumeBlockView({ block }: { readonly block: ResumeBlock }) {
  return (
    <div className={`pc-block pc-block--${block.kind}`}>
      <BlockContent block={block} />
    </div>
  );
}

function BlockContent({ block }: { readonly block: ResumeBlock }) {
  switch (block.kind) {
    case 'header':
      return (
        <>
          <h1 className="pc-doc__name">{block.name}</h1>
          <p className="pc-doc__headline">
            {block.headline} <span aria-hidden="true">·</span> {block.location}
          </p>
          <p className="pc-doc__links">
            {block.links.map((link, index) => (
              <Fragment key={link.href}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                <DocumentLink href={link.href}>{link.label}</DocumentLink>
              </Fragment>
            ))}
          </p>
        </>
      );
    case 'summary':
      return <p className="pc-doc__summary">{block.text}</p>;
    case 'heading':
      return <h2 className="pc-doc__section">{block.title}</h2>;
    case 'job':
      return (
        <>
          <div className="pc-doc__head">
            <h3>
              {block.role}, {block.company}
            </h3>
            <p className="pc-doc__dates">{block.dates}</p>
          </div>
          <p className="pc-doc__meta">
            {block.context} · {block.location}
          </p>
          <ul className="pc-doc__highlights">
            {block.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          <p className="pc-doc__stack">{block.stack.join(' · ')}</p>
        </>
      );
    case 'education':
      return (
        <>
          <h3>{block.degree}</h3>
          <p className="pc-doc__meta">
            {block.institution}
            {block.location ? ` · ${block.location}` : ''}
          </p>
          {block.detail ? <p className="pc-doc__detail">{block.detail}</p> : null}
        </>
      );
    case 'publication':
      return (
        <p className="pc-doc__publication">
          <DocumentLink href={block.href}>{block.title}</DocumentLink>. {block.citation}
        </p>
      );
  }
}

/** `mailto:` opens in place; web links open in a new tab without access back to this page. */
function DocumentLink({ href, children }: { readonly href: ProfileLink['href']; readonly children: string }) {
  return href.startsWith('https:') ? (
    <a href={href} target="_blank" rel="noopener">
      {children}
    </a>
  ) : (
    <a href={href}>{children}</a>
  );
}
