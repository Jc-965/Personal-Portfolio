/**
 * The Game Creation Society role's journey, written in the project chapters' voice. Every claim about the work
 * comes from the role's entry in portfolio.json. The other sentences say what the organization is or define a term
 * in everyday words.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const GCS: RoleStory = {
  id: 'gcs',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: [
        'Game Creation Society',
        'Core Developer',
        'Game Creation Society is a Carnegie Mellon student organization where teams make games together. Built the gameplay systems for a local multiplayer game as a core developer.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'game systems',
      lines: [
        'Players grapple, tether, and fight on one screen.',
        'The systems are built in Unreal Engine 5 Blueprints, the engine’s visual scripting.',
      ],
      // The first value is the player the scene arms by default.
      choices: [
        { label: 'P1', command: 'player', value: 'p1' },
        { label: 'P2', command: 'player', value: 'p2' },
      ],
      callouts: [
        { text: 'Click a platform or ring to grapple', anchor: 'arena' },
        { text: 'Click the other player to tether', anchor: 'rival' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'in sync',
      lines: [
        'Physics, hits, and eliminations stay in sync in real time.',
        'Physics-driven interactions, collision feedback, and elimination state all update together as a match plays out.',
      ],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.6],
  room: { src: '/roles/rooms/gcs.webp', focusX: 0.35 },
  // Magenta glyphs for the neon game room, and the room's ink pushed toward magenta and teal.
  look: { tint: [1, 0.08, 0.6], grade: [1.05, 0.95, 1.15] },
  panels: [],
  links: [],
  poster: { src: '/roles/gcs/poster.webp', alt: 'A video-game arena of floating platforms over a neon pit, two players grappling to rings, a P1 versus P2 scoreboard, and two controllers' },
  scene: () => import('../../components/roles/scenes/gcs.ts'),
}
