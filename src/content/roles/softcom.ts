/**
 * The SoftCom Lab role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SOFTCOM: RoleStory = {
  id: 'softcom',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['SoftCom Lab', 'Machine Learning Research Intern', 'Jun 2023 – Aug 2024 · Pomona, CA'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'research',
      lines: ['Developed and evaluated a computer-vision model for Parkinson\'s exercise-form assessment, reaching 95.4% mean accuracy in controlled video trials, and first-authored the resulting peer-reviewed paper at CS & IT-CSCP 2024.'],
      callouts: [],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'built with',
      lines: ['Python, ML/CV, NumPy, scikit-learn.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  sky: { src: '/roles/skies/softcom.webp', focusX: 0.5 },
  panels: [],
  links: [],
  poster: { src: '/roles/skies/softcom.webp', alt: 'A floating island diorama for SoftCom Lab' },
  scene: () => import('../../components/roles/scenes/softcom.ts'),
}
