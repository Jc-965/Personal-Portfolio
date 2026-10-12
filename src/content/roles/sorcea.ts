/**
 * The Sorcea Labs role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SORCEA: RoleStory = {
  id: 'sorcea',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Sorcea Labs', 'Software Engineer Intern', 'Jan 2026 – May 2026 · Remote'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'industry',
      lines: ['Overhauled a 10K+ user Flutter app\'s home, product, search, and onboarding flows from founder spec to release.', 'Shipped skin-tone shade matching, building a from-scratch perceptual color engine (sRGB to CIELAB, Delta-E) and the live gauge it powers, pinpointing the user\'s tone and confidence band on a shade spectrum.', 'Cut homepage load time ~75% via API fan-out, feed prefetching, token pagination, and TTL-cached revisits.'],
      callouts: [],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'built with',
      lines: ['Flutter, Dart, Dio, CustomPainter, CIELAB/Delta-E.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  sky: { src: '/roles/skies/sorcea.webp', focusX: 0.5 },
  panels: [],
  links: [],
  poster: { src: '/roles/skies/sorcea.webp', alt: 'A floating island diorama for Sorcea Labs' },
  scene: () => import('../../components/roles/scenes/sorcea.ts'),
}
