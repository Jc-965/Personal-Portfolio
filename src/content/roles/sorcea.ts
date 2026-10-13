/**
 * The Sorcea role's journey. The arrival describes the product or organization alone, in the project chapters'
 * voice, and never Jesse's part in it. The work and impact acts hold only his own work, each line opening on its
 * verb in resume voice. Every claim about the work comes from the role's resume entry.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SORCEA: RoleStory = {
  id: 'sorcea',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: [
        'Sorcea',
        'Software Engineer Intern, Mobile',
        'Sorcea is a mobile app with more than 10K users. People browse and search products in it, and it matches shades to their skin tone.',
      ],
      callouts: [
        { text: 'Home, product, search, and onboarding', anchor: 'screens' },
        { text: 'A 22-step tutorial across 7 screens', anchor: 'tutorial' },
      ],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'shade matching',
      lines: [
        'Built shade matching on a color engine written from scratch.',
        'Wrote it to compare colors in CIELAB, a color space modeled on human vision, and to rank shades by Delta-E, a measure of how different two colors look. Drew the match gauge with CustomPainter.',
      ],
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
      eyebrow: 'the app',
      lines: [
        'Rebuilt home, product, search, and onboarding from the founder’s spec through release, with a 22-step tutorial that saves each person’s progress.',
        'Cut homepage load time about 75% by running API calls in parallel, prefetching the feed, paging by token, and caching revisits.',
      ],
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
