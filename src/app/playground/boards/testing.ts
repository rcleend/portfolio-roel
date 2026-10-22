import type { Board } from './board';
import type { Choice, Subject } from './subject';

/**
 * A made-up subject and board for tests: several choices per picker, which
 * the registries will only have once the variant and look crews have landed.
 * Lives next to the code so every test can share it; never imported by the
 * page itself.
 */
export function testChoice(id: string): Choice {
  return { id, name: id.toUpperCase(), description: `The ${id} one.` };
}

export const heroSubject: Subject = {
  id: 'hero',
  label: 'Hero',
  pickers: [
    { id: 'look', label: 'Look', current: 'classic', choices: ['classic', 'arcade', 'hibit'].map(testChoice) },
    { id: 'view', label: 'View', current: 'moves', choices: ['moves', 'card'].map(testChoice) },
  ],
  timeline: { frames: 60, loops: true, beats: [{ frame: 0, label: 'start' }] },
  show: () => ({ spec: { scene: 'specimen', params: undefined }, looks: {} }),
};

export const lookBoard: Board = {
  id: 'looks',
  title: 'Looks',
  summary: 'Every look, in the same view.',
  rows: [{ subject: heroSubject }],
  compares: 'look',
  shares: ['view'],
};
