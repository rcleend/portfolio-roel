import type { Experience, ExperienceId } from './types';

/** Work history, most recent first. Mirrors the CV — keep the two in sync. */
export const experience: readonly Experience[] = [
  {
    id: 'scripe',
    company: 'Scripe',
    role: 'Founding Product Engineer',
    context: 'AI startup · Founding team',
    location: 'Berlin (remote)',
    start: '2024-10',
    end: null,
    highlights: [
      {
        id: 'scripe-teams',
        title: 'TEAMS INITIATIVE',
        description:
          'Took the lead in shaping and executing a stronger focus on teams. Trial-to-paid conversion rose from ' +
          '20% to ~35%, monthly churn nearly halved to 13% and customer lifetime value almost doubled within six months.',
        metric: { label: 'trial-to-paid conversion', from: '20%', to: '35%' },
      },
      {
        id: 'scripe-onboarding',
        title: 'ONBOARDING',
        description: 'Redesigned onboarding around jobs-to-be-done, raising week-one activation from 9% to 22%.',
        metric: { label: 'week-one activation', from: '9%', to: '22%' },
      },
      {
        id: 'scripe-agent',
        title: 'AI AGENT',
        description:
          'Designed and built the in-product AI agent, from chat interface to tool calls. Its weekly users retain ' +
          '25% better at 90 days than non-users.',
        metric: { label: '90-day retention', to: '+25%' },
      },
      {
        id: 'scripe-ios',
        title: 'iOS APP',
        description:
          'Shipped the iOS app end to end, including payments and OAuth. Its users retain 18% better at 90 days ' +
          'than web-only users.',
        metric: { label: '90-day retention', to: '+18%' },
      },
    ],
    stack: ['Next.js', 'NestJS', 'React', 'Railway', 'PlanetScale', 'Expo', 'React Native'],
  },
  {
    id: 'luna',
    company: 'Luna (Utopian Labs)',
    role: 'Founding Full-Stack Engineer',
    context: 'AI startup · Founding team · Acquired by Zapier',
    location: 'San Francisco (remote)',
    start: '2022-04',
    end: '2024-10',
    highlights: [
      {
        id: 'luna-agent',
        title: 'AI AGENT',
        description:
          'Designed and built the in-product AI agent, from chat interface to tool calls. Its users retained 30% ' +
          'better at 60 days than non-users.',
        metric: { label: '60-day retention', to: '+30%' },
      },
      {
        id: 'luna-outbound',
        title: 'OUTBOUND PLATFORM',
        description:
          'Owned features end to end and helped design and build the cold-outbound platform, responsible for the ' +
          'interface for managing email accounts.',
      },
      {
        id: 'luna-exit',
        title: 'ACQUIRED',
        description: 'Part of the founding team that built Luna until its acquisition by Zapier.',
      },
    ],
    stack: ['Next.js', 'Express', 'React', 'Google Cloud', 'Mixpanel'],
  },
  {
    id: 'fledge',
    company: 'Fledge',
    role: 'Front-End Engineer',
    context: 'Cloud ERP software',
    location: 'Enschede',
    start: '2021-02',
    end: '2022-04',
    highlights: [
      {
        id: 'fledge-migration',
        title: 'CLOUD MIGRATION',
        description: 'Led 12 developers in migrating legacy ERP software to the cloud, delivering three core modules within a year.',
      },
      {
        id: 'fledge-mentoring',
        title: 'MENTORING',
        description:
          'Mentored 10 junior developers in Angular and Agile; all were shipping features independently within six months.',
      },
    ],
    stack: ['Angular', 'RxJS', 'NgRx'],
  },
  {
    id: 'jouwweb',
    company: 'JouwWeb',
    role: 'Front-End Engineer',
    context: 'Website builder',
    location: 'Eindhoven',
    start: '2018-09',
    end: '2021-01',
    highlights: [
      {
        id: 'jouwweb-templates',
        title: 'TEMPLATE LIBRARY',
        description:
          'Built a library of configurable React templates for a website builder now used by more than 100,000 customers.',
      },
    ],
    stack: ['React'],
  },
];

export function getExperience(id: ExperienceId): Experience {
  const entry = experience.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown experience: ${id}`);
  return entry;
}
