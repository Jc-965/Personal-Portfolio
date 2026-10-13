/**
 * Android security and billing work, grounded in the supplied resumes. Task-success figures are intentionally
 * omitted at Jesse's request.
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
        'Blue Shield’s Android app serves more than 500,000 members. The work focused on the billing and payment experience, along with the security of the APIs behind it.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'securing the APIs',
      lines: [
        'A custom replay engine tested more than 220 API endpoints using the same app session, first with the service JWT and then without it.',
        'Matching responses showed that the endpoints were ignoring the token. Moving service credentials and authentication to the server removed bundled credentials from the Android app.',
      ],
      callouts: [
        { text: 'Select an endpoint to compare both requests', anchor: 'wall' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'billing and payments',
      lines: [
        'Reorganized the billing and payment flows to make the steps easier to follow, from reviewing a bill to making a payment.',
        'Fixed 12 crash and data-integrity risks, along with a production bug that left members on a blank screen.',
      ],
      callouts: [
        { text: 'Tap the phone to follow the payment flow', anchor: 'phone' },
      ],
    },
  ],
  restLocal: [0.6, 0.6, 0.75],
  room: { src: '/roles/rooms/blue-shield.webp', focusX: 0.35 },
  // In the scene's panel order: the two lanes of a paired replay in flight, then the response both lanes got.
  panels: ['With service token', 'Without service token', 'Matching responses'],
  // A clear electric-blue decode, and the room's ink graded toward blue.
  look: { tint: [0.16, 0.42, 1.0], grade: [0.8, 0.95, 1.2] },
  links: [],
  poster: { src: '/roles/blue-shield/poster.webp', alt: 'A white Android phone with a blank screen, ringed by red risk markers and a gold key, on a dark table of member lights beside a replay deck, a wall of endpoint lights, and a steel vault' },
  scene: () => import('../../components/roles/scenes/blue-shield.ts'),
}
