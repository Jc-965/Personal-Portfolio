/**
 * The Blue Shield of California role's journey. Its copy restates the role's resume entry and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const BLUE_SHIELD: RoleStory = {
  id: 'blue-shield',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Blue Shield of California', 'Software Engineer Intern, Android'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'auth audit',
      lines: ['A replay engine that found auth flaws in a 500K+ user Android app.'],
      readout: ['220+ API endpoints replayed', 'paired replays: service JWTs ignored', 'credentials moved server-side'],
      callouts: [
        { text: 'Click an endpoint to replay a pair', anchor: 'wall' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'billing and payments',
      lines: ['Rebuilt billing and payment flows, and fixed the defects members hit.'],
      readout: ['12 crash and data risks fixed', 'blank-screen defect fixed'],
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
