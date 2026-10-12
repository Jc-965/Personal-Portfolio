/**
 * The Blue Shield of California role's journey, written in the project chapters' voice. Every claim about the work
 * comes from the role's resume entry. The other sentences say what the organization is or define a term in everyday
 * words.
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
        'Blue Shield of California’s Android app serves more than 500K members. The internship covered its billing and payment screens and the security of the APIs behind them.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'testing the APIs',
      lines: [
        'A replay engine tested authentication across 220+ API endpoints.',
        'Paired replays kept the live cookies and session headers and changed only the service JWT, the token that proves which app is calling. The answers never changed, which proved the APIs ignored those tokens.',
      ],
      readout: ['bundled credentials and auth moved server-side'],
      callouts: [
        { text: 'Click an endpoint to replay a pair', anchor: 'wall' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'billing and payments',
      lines: [
        'Rebuilt the billing and payment flows members use.',
        'Fixed 12 crash and data-integrity risks along the way, including a production defect that left members on a blank screen.',
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
