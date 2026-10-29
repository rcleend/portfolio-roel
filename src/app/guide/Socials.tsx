import type { CSSProperties } from 'react';
import { type SocialLink, socials } from '@/content';
import github from './socials/github.svg';
import linkedin from './socials/linkedin.svg';
import x from './socials/x.svg';

/** The networks' own marks, from Simple Icons (CC0), drawn through a mask in the link's colour (RoomGuide.css). */
const GLYPHS: Readonly<Record<SocialLink['kind'], string>> = { x, linkedin, github };

/**
 * The overview's quick links to Roel elsewhere (X, LinkedIn, GitHub): the networks' marks, quiet beside the menu,
 * each opening in a new tab. Its own list, so the overview can move it without touching the menu.
 */
export function Socials({ style }: { readonly style?: CSSProperties }) {
  return (
    <ul className="socials" aria-label="Roel elsewhere" style={style}>
      {socials.map(({ kind, network, href }) => (
        <li key={kind}>
          <a className="socials__link" data-network={kind} href={href} target="_blank" rel="noopener noreferrer me">
            <span className="socials__glyph" style={{ '--glyph': `url("${GLYPHS[kind]}")` } as CSSProperties} />
            <span className="guide-hidden">{network} (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
