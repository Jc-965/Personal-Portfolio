/**
 * The Blue Shield of California role's journey. The arrival describes the product or organization alone, in the
 * project chapters' voice, and never Jesse's part in it. The work and impact acts hold only his own work, each line
 * opening on its verb in resume voice. Every claim about the work comes from the role's resume entry.
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
        'Blue Shield of California is a health plan, and more than 500K members use its Android app.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'testing the APIs',
      lines: [
        'Built a replay engine that tested authentication across 220+ API endpoints.',
        'Proved with paired replays that the APIs ignored service JWTs, the tokens that identify the calling app. Each pair kept the live cookies and session headers and changed only the token, and the answers never changed.',
        'Moved the app’s bundled credentials and authentication server-side.',
      ],
      readout: ['220+ endpoints replayed'],
      callouts: [
        { text: 'Click an endpoint to replay a pair', anchor: 'wall' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'billing and payments',
      lines: [
        'Rebuilt the billing and payment flows.',
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
