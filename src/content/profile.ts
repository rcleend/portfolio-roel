import type { Education, Profile, ProfileLink, Publication, SocialLink } from './types';

/** Primary contact channel, reused wherever the game invites the visitor to get in touch. */
export const emailLink: ProfileLink = { kind: 'email', label: 'rcleende@gmail.com', href: 'mailto:rcleende@gmail.com' };

const linkedinLink: ProfileLink = {
  kind: 'linkedin',
  label: 'linkedin.com/in/roel-leendersit',
  href: 'https://www.linkedin.com/in/roel-leendersit',
};

const githubLink: ProfileLink = { kind: 'github', label: 'github.com/rcleend', href: 'https://github.com/rcleend' };

export const profile: Profile = {
  name: 'Roel Leenders',
  site: 'Portfolio',
  headline: 'Product Engineer',
  location: 'Amsterdam, NL',
  summary:
    'Product engineer who takes ownership of features end to end, from user research and strategy to design and code. ' +
    'Eight years of experience building high-traffic, user-facing products — five of them at early-stage AI startups, ' +
    'working closely with founders on product vision and strategy. Researched human–agent collaboration for an MSc thesis, focusing on voice agents.',
  links: [emailLink, linkedinLink, githubLink],
};

/** The overview's quick links, in this order: X, then the résumé's LinkedIn and GitHub. */
export const socials: readonly SocialLink[] = [
  { kind: 'x', network: 'X', href: 'https://x.com/LeendersRoel' },
  { kind: 'linkedin', network: 'LinkedIn', href: linkedinLink.href },
  { kind: 'github', network: 'GitHub', href: githubLink.href },
  { kind: 'email', network: 'Email', href: emailLink.href },
];

export const education: readonly Education[] = [
  {
    degree: 'MSc Interaction Technology',
    institution: 'University of Twente',
    location: 'Enschede',
    detail:
      'Thesis at Pusan National University, South Korea: Exploring the Role of Generated Backchannels in ' +
      'Human-Agent Collaboration.',
  },
  {
    degree: 'BSc Computer Science',
    institution: 'Avans University of Applied Sciences',
  },
  {
    degree: 'Propaedeutic year, Guitar',
    institution: 'Conservatorium van Amsterdam',
    location: 'Amsterdam',
    detail: 'Composition, production and performance.',
  },
];

export const publications: readonly Publication[] = [
  {
    title: 'Björn: An interrogation simulator',
    citation:
      'Leenders, R., Camin, P., Velner, E. & Theune, M. (2022). Proceedings of the First International ' +
      'Conference on Hybrid Human-Machine Intelligence, IOS Press.',
    href: 'https://doi.org/10.3233/FAIA220213',
  },
];
