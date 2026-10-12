/**
 * The Blue Shield of California role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const BLUE_SHIELD: RoleStory = {
  id: 'blue-shield',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Blue Shield of California', 'Software Engineer Intern, Android', 'Jun 2026 – Aug 2026 · Long Beach, CA'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'healthcare',
      lines: ['Shipped Android features for 500K+ members, improved billing and payments flows, fixed production defects, and built a security-audit pipeline validating authentication across 220+ API endpoints.'],
      callouts: [],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'built with',
      lines: ['Android, Kotlin, Agile, Jira.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  sky: { src: '/roles/skies/blue-shield.webp', focusX: 0.6 },
  panels: [],
  links: [],
  poster: { src: '/roles/skies/blue-shield.webp', alt: 'A floating island diorama for Blue Shield of California' },
  scene: () => import('../../components/roles/scenes/blue-shield.ts'),
}
