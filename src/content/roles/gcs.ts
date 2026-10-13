/**
 * Gameplay systems grounded in portfolio.json, with the game's rules supplied by Jesse.
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
        'A local multiplayer game where players leave trails as they move. Touching an opponent’s trail knocks a player out, making movement part of the fight.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'movement and combat',
      lines: [
        'Built grappling, tethering, and combat in Unreal Engine 5 Blueprints, the engine’s visual scripting system.',
        'These mechanics connect player movement with physics, collisions, and the state of the match.',
      ],
      // The first value is the player the scene arms by default.
      choices: [
        { label: 'Player 1', command: 'player', value: 'p1' },
        { label: 'Player 2', command: 'player', value: 'p2' },
      ],
      callouts: [
        { text: 'Select a platform or ring to grapple', anchor: 'arena' },
        { text: 'Select the other player to tether', anchor: 'rival' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'keeping the match in sync',
      lines: [
        'Physics, collision feedback, and eliminations update together in real time. A hit changes both what players see and whether a player is still in the round.',
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
