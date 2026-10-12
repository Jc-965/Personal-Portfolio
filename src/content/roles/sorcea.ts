/**
 * The Sorcea role's journey. Its copy restates the role's resume entry and adds nothing the entry does not say.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SORCEA: RoleStory = {
  id: 'sorcea',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Sorcea', 'Software Engineer Intern, Mobile'],
      callouts: [
        { text: 'Rebuilt home, product, search, and onboarding', anchor: 'screens' },
        { text: '22-step tutorial across 7 screens', anchor: 'tutorial' },
      ],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'shade matching',
      lines: ['Personalized shade matching on a perceptual color engine built from scratch.'],
      readout: ['CIELAB, Delta-E', 'closest matches, skin-tone fit', 'confidence bands', 'CustomPainter gauge'],
      // The first value is the scene's DEFAULT_TONE in components/roles/scenes/sorcea.ts.
      choices: [
        { label: '#D2A07C', command: 'tone', value: '#D2A07C' },
        { label: '#EDC9AE', command: 'tone', value: '#EDC9AE' },
        { label: '#A97350', command: 'tone', value: '#A97350' },
        { label: '#6B4430', command: 'tone', value: '#6B4430' },
      ],
      callouts: [
        { text: 'Hover or tap the solid to move the tone', anchor: 'solid' },
        { text: 'The gauge shows the fit and its confidence band', anchor: 'gauge' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'load time',
      lines: ['Cut homepage load time ~75% with parallel API calls and caching.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.85],
  room: { src: '/roles/rooms/sorcea.webp', focusX: 0.35 },
  // Rose glyphs for the vanity room, and the room's ink warmed toward rose.
  look: { tint: [1, 0.3, 0.48], grade: [1.12, 0.94, 1] },
  // Shown only while the pointer is on a phone, in the scene's SCREENS order.
  panels: ['Search', 'Tutorial', 'Home', 'Product'],
  links: [],
  poster: { src: '/roles/sorcea/poster.webp', alt: 'A vanity table with a glass cloche over a CIELAB color solid, a fan of foundation compacts, a shade gauge, four Sorcea app screens, and a jewellery box sending requests to the home screen' },
  scene: () => import('../../components/roles/scenes/sorcea.ts'),
}
