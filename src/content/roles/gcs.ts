/**
 * The Game Creation Society role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const GCS: RoleStory = {
  id: 'gcs',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Game Creation Society', 'Core Developer', 'Sep 2025 – Dec 2025 · Pittsburgh, PA'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'game systems',
      lines: ['Built Unreal Engine 5 Blueprint gameplay systems for grappling, tethering, and local multiplayer combat, synchronizing physics-driven interactions, collision feedback, and elimination state in real time.'],
      callouts: [],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'built with',
      lines: ['Unreal Engine 5, Blueprints, Physics, Multiplayer.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  sky: { src: '/roles/skies/gcs.webp', focusX: 0.5 },
  panels: [],
  links: [],
  poster: { src: '/roles/skies/gcs.webp', alt: 'A floating island diorama for Game Creation Society' },
  scene: () => import('../../components/roles/scenes/gcs.ts'),
}
