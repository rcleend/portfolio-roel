import { type CSSProperties, useEffect } from 'react';
import { type SocialLink, socials } from '@/content';
import github from './socials/github.svg';
import linkedin from './socials/linkedin.svg';
import email from './socials/mail.svg';
import x from './socials/x.svg';

/**
 * The networks' own marks, from Simple Icons (CC0), and an envelope for email, drawn through a mask in the link's
 * colour (RoomGuide.css).
 */
const GLYPHS: Readonly<Record<SocialLink['kind'], string>> = { x, linkedin, github, email };

/**
 * The overview's quick links to Roel elsewhere (X, LinkedIn, GitHub, and email): the marks, quiet beside the menu,
 * each network opening in a new tab and the envelope in the visitor's mail app (a `mailto:`, which a new tab would
 * only leave empty). Its own list, so the overview can move it without touching the menu.
 */
export function Socials({ style }: { readonly style?: CSSProperties }) {
  // The marks are fetched and decoded while the overview waits hidden, so they are there the moment it shows.
  useEffect(() => {
    for (const url of Object.values(GLYPHS)) {
      const image = new Image();
      image.src = url;
      image.decode?.().catch(() => undefined);
    }
  }, []);
  return (
    <ul className="socials" aria-label="Roel elsewhere" style={style}>
      {socials.map(({ kind, network, href }) => {
        const mail = kind === 'email';
        return (
          <li key={kind}>
            <a
              className="socials__link"
              data-network={kind}
              href={href}
              {...(mail ? {} : { target: '_blank', rel: 'noopener noreferrer me' })}
            >
              <span className="socials__glyph" style={{ '--glyph': `url("${GLYPHS[kind]}")` } as CSSProperties} />
              <span className="guide-hidden">
                {mail ? `Email Roel (${href.replace(/^mailto:/, '')})` : `${network} (opens in a new tab)`}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
