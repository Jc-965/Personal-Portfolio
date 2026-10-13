/**
 * The Blue Shield of California role's journey. The arrival says plainly what the work was and does not sell the
 * company or describe it. The work and impact acts hold only Jesse's own work, each line opening on its verb in
 * resume voice. Every claim comes from the role's resume entry.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const BLUE_SHIELD: RoleStory = {
  id: 'blue-shield',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: [
        'Blue Shield of California',
        'Software Engineer Intern, Android',
        'The work covered securing the Android app’s APIs and restructuring its billing and payment flows, for more than 500K members.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'securing the APIs',
      lines: [
        'Built a replay engine to test whether the app’s 220+ service API calls actually needed a JWT.',
        'It sent each call twice, once with the JWT and once without. The calls still worked without it, which proved the APIs were ignoring the token.',
        'Moved the bundled credentials and authentication server-side.',
      ],
      callouts: [
        { text: 'Click an endpoint to replay it with and without the JWT', anchor: 'wall' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'billing and payments',
      lines: [
        'Restructured the information architecture of the billing and payment flows.',
        'Fixed 12 crash and data-integrity risks, including a production defect that left members on a blank screen.',
      ],
      callouts: [
        { text: 'Click the phone to step through the flow', anchor: 'phone' },
      ],
    },
  ],
  restLocal: [0.6, 0.6, 0.75],
  room: { src: '/roles/rooms/blue-shield.webp', focusX: 0.35 },
  // In the scene's panel order: the two lanes of a paired replay in flight, then the response both lanes got.
  panels: ['with service JWT', 'without service JWT', 'same response'],
  // A clear electric-blue decode, and the room's ink graded toward blue.
  look: { tint: [0.16, 0.42, 1.0], grade: [0.8, 0.95, 1.2] },
  links: [],
  poster: { src: '/roles/blue-shield/poster.webp', alt: 'A white Android phone with a blank screen, ringed by red risk markers and a gold key, on a dark table of member lights beside a replay deck, a wall of endpoint lights, and a steel vault' },
  scene: () => import('../../components/roles/scenes/blue-shield.ts'),
}
