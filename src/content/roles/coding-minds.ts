/**
 * The Coding Minds Academy role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const CODING_MINDS: RoleStory = {
  id: 'coding-minds',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Coding Minds Academy', 'Instructor', 'Jun 2025 – Feb 2026 · Remote'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'teaching',
      lines: ['Designed and taught project-based Python, C++, and JavaScript curriculum centered on algorithms and competitive problem solving through structured implementation labs.'],
      callouts: [],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'built with',
      lines: ['Python, C++, JavaScript, ACSL.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  sky: { src: '/roles/skies/coding-minds.webp', focusX: 0.5 },
  panels: [],
  links: [],
  poster: { src: '/roles/skies/coding-minds.webp', alt: 'A floating island diorama for Coding Minds Academy' },
  scene: () => import('../../components/roles/scenes/coding-minds.ts'),
}
