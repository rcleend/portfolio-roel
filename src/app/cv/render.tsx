import { renderToStaticMarkup } from 'react-dom/server';
import { profile, socials } from '@/content';
import { Resume } from '../resume/Resume';

/** Where the room's overview leads that the résumé's own links do not (X): on this page they are the only way there. */
const elsewhere = socials
  .filter((social) => !profile.links.some((link) => link.href === social.href))
  .map((social) => ({ kind: social.kind, label: social.href.replace(/^https:\/\//, ''), href: social.href }));

/**
 * The résumé page as markup, rendered where the site is built or served (scripts/gatePlugin.ts › `virtual:cv`),
 * never in the browser: the visitor it is for gets a string to show, not React.
 */
export const cv = {
  html: renderToStaticMarkup(<Resume page links={[...profile.links, ...elsewhere]} />),
  title: `${profile.name} — ${profile.headline} · Résumé`,
};
